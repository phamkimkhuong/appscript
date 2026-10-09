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
 * Lấy hoặc tạo thư mục lưu trữ tài liệu văn bản doanh nghiệp trên Google Drive
 */
function getOrCreateDocsFolder() {
  const folderName = "VinTech_VanBan_LuuTru";
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("DOCS_FOLDER_ID");

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch(e) {
      Logger.log("Folder cũ không truy cập được: " + e.message);
    }
  }

  const folders = DriveApp.getFoldersByName(folderName);
  let targetFolder;
  if (folders.hasNext()) {
    targetFolder = folders.next();
  } else {
    targetFolder = DriveApp.createFolder(folderName);
  }

  props.setProperty("DOCS_FOLDER_ID", targetFolder.getId());
  return targetFolder;
}

/**
 * Tải file văn bản thật lên Google Drive và lấy link xem trực tiếp
 * @param {Object} fileData - { name: string, type: string, base64: string }
 * @param {string} docId - Số hiệu văn bản
 * @param {string} title - Tiêu đề văn bản
 */
function uploadDocToDrive(fileData, docId, title) {
  if (!fileData || !fileData.base64) return null;
  try {
    const folder = getOrCreateDocsFolder();
    const cleanBase64 = fileData.base64.replace(/^data:[^;]+;base64,/, "");
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const mimeType = fileData.type || "application/pdf";
    const safeDocId = (docId || "VB").replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `${safeDocId}_${fileData.name || "VanBan.pdf"}`;

    const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    const driveFile = folder.createFile(blob);
    driveFile.setDescription(`Tài liệu văn bản số: ${docId} - ${title}`);

    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {
      Logger.log("Không thể gán quyền chia sẻ: " + e.message);
    }

    return driveFile.getUrl();
  } catch(err) {
    Logger.log("Lỗi tải văn bản lên Drive: " + err.message);
    return null;
  }
}

/**
 * Đảm bảo Sheet VanBan có cột "Lĩnh Vực" tại cột 9
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureDocumentCategoryColumn(sheet) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;
  const headers = data[0];
  if (headers.length < 9 || headers[8].toString().trim() !== "Lĩnh Vực") {
    sheet.getRange(1, 9).setValue("Lĩnh Vực");
  }
}

/**
 * Lấy danh sách văn bản và công văn
 * @param {string} [filterType] - Lọc theo loại văn bản hoặc "all"
 * @param {string} [filterCategory] - Lọc theo lĩnh vực hoặc "all"
 */
function apiGetDocuments(filterType, filterCategory) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS);
    ensureDocumentCategoryColumn(sheet);
    let docs = sheetToObjects(sheet);

    if (filterType && filterType !== "all") {
      docs = docs.filter(d => (d["Loại Văn Bản"] || "").toLowerCase().includes(filterType.toLowerCase()));
    }
    if (filterCategory && filterCategory !== "all") {
      docs = docs.filter(d => (d["Lĩnh Vực"] || "").toLowerCase().includes(filterCategory.toLowerCase()));
    }
    return { success: true, data: docs };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Thêm mới văn bản lưu trữ (Hỗ trợ upload Drive thật, trường Lĩnh Vực & RBAC)
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
    ensureDocumentCategoryColumn(sheet);

    const docId = doc.id || (Math.floor(10 + Math.random() * 90) + "/2026/QĐ-VT");
    const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");

    let fileUrl = doc.fileUrl || "";
    if (doc.fileData && doc.fileData.base64) {
      const uploadedUrl = uploadDocToDrive(doc.fileData, docId, doc.title);
      if (uploadedUrl) fileUrl = uploadedUrl;
    }
    if (!fileUrl) {
      fileUrl = "https://drive.google.com/sample_doc.pdf";
    }

    sheet.appendRow([
      docId,
      doc.title,
      doc.type || "Quy chế nội bộ",
      doc.issuer || "Tổng Giám Đốc",
      doc.date || today,
      doc.signer || auth.name || "",
      fileUrl,
      doc.status || "Hiệu lực",
      doc.category || "Quản trị nội bộ"
    ]);

    return {
      success: true,
      message: `Thêm văn bản [${docId}] thành công!`,
      newId: docId,
      fileUrl: fileUrl
    };
  } catch(err) {
    return { success: false, message: "Lỗi lưu văn bản: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cập nhật thông tin văn bản (HR & Ban Quản Lý)
 * @param {Object} doc - Thông tin văn bản cập nhật
 * @param {string} [callerEmail] - Email người thực hiện
 */
function apiUpdateDocument(doc, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS);
    ensureDocumentCategoryColumn(sheet);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === doc.id || data[i][0] === doc.originalId) {
        let fileUrl = doc.fileUrl || data[i][6];
        if (doc.fileData && doc.fileData.base64) {
          const uploadedUrl = uploadDocToDrive(doc.fileData, doc.id, doc.title);
          if (uploadedUrl) fileUrl = uploadedUrl;
        }

        if (doc.id) sheet.getRange(i + 1, 1).setValue(doc.id);
        if (doc.title) sheet.getRange(i + 1, 2).setValue(doc.title);
        if (doc.type) sheet.getRange(i + 1, 3).setValue(doc.type);
        if (doc.issuer) sheet.getRange(i + 1, 4).setValue(doc.issuer);
        if (doc.date) sheet.getRange(i + 1, 5).setValue(doc.date);
        if (doc.signer) sheet.getRange(i + 1, 6).setValue(doc.signer);
        sheet.getRange(i + 1, 7).setValue(fileUrl);
        if (doc.status) sheet.getRange(i + 1, 8).setValue(doc.status);
        if (doc.category) sheet.getRange(i + 1, 9).setValue(doc.category);

        return { success: true, message: `Cập nhật văn bản [${doc.id}] thành công!`, fileUrl: fileUrl };
      }
    }
    return { success: false, message: "Không tìm thấy văn bản: " + doc.id };
  } catch(err) {
    return { success: false, message: "Lỗi cập nhật văn bản: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
