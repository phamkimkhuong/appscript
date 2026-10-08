/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: TasksAndDocs.js (Quản lý Công việc & Kho Văn bản Doanh nghiệp)
 * ====================================================================
 */

/**
 * Lấy danh sách nhiệm vụ / công việc
 */
function apiGetTasks() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TASKS);
    const data = sheetToObjects(sheet);
    return { success: true, data: data };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Thêm mới hoặc cập nhật công việc (Hỗ trợ liên kết Văn bản Căn cứ E-Office & RBAC)
 * @param {Object} task - Dữ liệu công việc
 * @param {string} [callerEmail] - Email người thực hiện
 */
function apiSaveTask(task, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TASKS);
    const data = sheet.getDataRange().getValues();

    // Xác định cột "Mã Văn Bản" trong Sheet
    const headers = data.length > 0 ? data[0] : [];
    let docCol = -1;
    for (let c = 0; c < headers.length; c++) {
      const hStr = (headers[c] || "").toString().trim();
      if (hStr === "Mã Văn Bản" || hStr === "Mã VB") {
        docCol = c + 1;
        break;
      }
    }
    // Nếu Sheet chưa có cột Mã Văn Bản, tự động mở rộng thêm cột 12
    if (docCol < 0) {
      docCol = Math.max(12, headers.length + 1);
      sheet.getRange(1, docCol).setValue("Mã Văn Bản");
    }

    let existingRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === task.id) {
        existingRow = i + 1;
        break;
      }
    }

    if (existingRow > 0) {
      sheet.getRange(existingRow, 2).setValue(task.title);
      sheet.getRange(existingRow, 3).setValue(task.type);
      sheet.getRange(existingRow, 5).setValue(task.assignee);
      sheet.getRange(existingRow, 7).setValue(task.deadline);
      if (task.status) sheet.getRange(existingRow, 9).setValue(task.status);
      if (task.evaluation) sheet.getRange(existingRow, 10).setValue(task.evaluation);
      if (task.note) sheet.getRange(existingRow, 11).setValue(task.note);
      if (docCol > 0) sheet.getRange(existingRow, docCol).setValue(task.docId || "");
      return { success: true, message: `Cập nhật công việc [${task.id}] thành công!` };
    } else {
      const newId = task.id || ("CV-" + Math.floor(100 + Math.random() * 900));
      const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");
      const rowVals = [
        newId,
        task.title,
        task.type || "Dự án",
        task.assigner || auth.name || "Ban Giám Đốc",
        task.assignee,
        task.startDate || today,
        task.deadline,
        "",
        task.status || "Đang xử lý",
        "",
        task.note || ""
      ];
      if (docCol >= 12) {
        rowVals.push(task.docId || "");
      }
      sheet.appendRow(rowVals);
      return { success: true, message: `Giao việc mới thành công! Mã CV: ${newId}`, newId: newId };
    }
  } catch(err) {
    return { success: false, message: "Lỗi lưu công việc: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cập nhật trạng thái công việc (Đang xử lý, Hoàn thành, Quá hạn)
 * @param {string} taskId - Mã công việc
 * @param {string} status - Trạng thái mới
 * @param {string} [evalText] - Đánh giá hoàn thành
 * @param {string} [callerEmail] - Email người thực hiện
 */
function apiUpdateTaskStatus(taskId, status, evalText, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TASKS);
    const data = sheet.getDataRange().getValues();
    const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === taskId) {
        sheet.getRange(i + 1, 9).setValue(status);
        if (status === "Hoàn thành") {
          sheet.getRange(i + 1, 8).setValue(today);
        }
        if (evalText) {
          sheet.getRange(i + 1, 10).setValue(evalText);
        }
        return { success: true, message: `Đã cập nhật trạng thái CV [${taskId}] thành '${status}'!` };
      }
    }
    return { success: false, message: "Không tìm thấy công việc: " + taskId };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lấy danh sách văn bản và công văn
 */
function apiGetDocuments(filterType) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS);
    let docs = sheetToObjects(sheet);

    if (filterType && filterType !== "all") {
      docs = docs.filter(d => (d["Loại Văn Bản"] || "").toLowerCase().includes(filterType.toLowerCase()));
    }
    return { success: true, data: docs };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Thêm mới văn bản lưu trữ (Yêu cầu vai trò Quản lý hoặc HR)
 * @param {Object} doc - Dữ liệu văn bản
 * @param {string} [callerEmail] - Email người thực hiện
 */
function apiSaveDocument(doc, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS);
    const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");

    sheet.appendRow([
      doc.id || (Math.floor(10 + Math.random() * 90) + "/2026/QĐ-VT"),
      doc.title,
      doc.type || "Quy chế nội bộ",
      doc.issuer || "Tổng Giám Đốc",
      doc.date || today,
      doc.signer || auth.name || "",
      doc.fileUrl || "https://drive.google.com/sample_doc.pdf",
      doc.status || "Hiệu lực"
    ]);

    return { success: true, message: "Thêm văn bản mới thành công!" };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

