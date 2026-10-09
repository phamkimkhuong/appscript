/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Leave.js (Quản lý Đơn nghỉ phép & Phê duyệt tự động)
 * ====================================================================
 */

/**
 * Lấy danh sách toàn bộ đơn xin nghỉ phép
 */
function apiGetLeaveRequests() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const data = sheetToObjects(sheet);
    return { success: true, data: data };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Tạo đơn xin nghỉ phép mới (Xác thực danh tính người gửi)
 * @param {Object} form - Thông tin đơn nghỉ phép
 * @param {string} [callerEmail] - Email của người nộp đơn
 */
function apiSubmitLeave(form, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  // Nhân viên thông thường chỉ được phép nộp cho chính mình
  if (auth.role === CONFIG.ROLES.EMPLOYEE && form.empId && form.empId !== auth.empId) {
    return { success: false, message: "Nhân viên chỉ có quyền tạo đơn xin nghỉ cho chính mình!" };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const newId = "LV-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMM") + "-" + Math.floor(10 + Math.random() * 90);

    // Header: Mã Đơn | Mã NV | Họ và Tên | Loại Nghỉ | Từ Ngày | Đến Ngày | Số Ngày | Lý Do | Trạng Thái | Ngày Duyệt | Người Duyệt
    sheet.appendRow([
      newId,
      form.empId || auth.empId,
      form.empName || auth.name,
      form.type,
      form.from,
      form.to,
      Number(form.days) || 1,
      form.reason,
      "PENDING",
      "",
      ""
    ]);

    return { success: true, message: `Nộp đơn nghỉ phép thành công! Mã đơn: ${newId}`, newId: newId };
  } catch (err) {
    return { success: false, message: "Lỗi nộp đơn: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Phê duyệt đơn xin nghỉ phép (CÓ KHÓA ĐỒNG THỜI LOCK SERVICE & KIỂM TRA QUYỀN)
 * Tự động cập nhật ký hiệu 'P' vào bảng chấm công
 * @param {string} reqId - Mã đơn nghỉ phép
 * @param {string} [callerEmail] - Email người phê duyệt (phải là Quản lý hoặc HR)
 */
function apiApproveLeave(reqId, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, message: "Hệ thống đang bận xử lý giao dịch khác, vui lòng thử lại sau!" };
  }

  try {
    const ss = getSpreadsheet();
    const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const leaveData = leaveSheet.getDataRange().getValues();

    let targetEmpId = null;
    let fromDateStr = null;
    let toDateStr = null;
    let numDays = 1;
    let foundIndex = -1;
    let currentStatus = "";

    for (let i = 1; i < leaveData.length; i++) {
      if (leaveData[i][0] === reqId) {
        foundIndex = i + 1;
        currentStatus = (leaveData[i][8] || "").toString().trim().toUpperCase();
        targetEmpId = leaveData[i][1];
        fromDateStr = leaveData[i][4];
        toDateStr = leaveData[i][5];
        numDays = parseInt(leaveData[i][6]) || 1;
        break;
      }
    }

    if (foundIndex < 0) return { success: false, message: "Không tìm thấy đơn nghỉ: " + reqId };

    // Kiểm tra tính hợp lệ của luồng phê duyệt: Chỉ duyệt đơn đang PENDING
    if (currentStatus === "APPROVED") {
      return { success: false, message: `Đơn nghỉ [${reqId}] đã được phê duyệt trước đó, không thể thao tác lại!` };
    }
    if (currentStatus === "REJECTED") {
      return { success: false, message: `Đơn nghỉ [${reqId}] đã bị từ chối, không thể phê duyệt trực tiếp!` };
    }

    const reviewerName = auth.name || "Ban Giám Đốc";

    leaveSheet.getRange(foundIndex, 9).setValue("APPROVED"); // Cột Trạng thái
    leaveSheet.getRange(foundIndex, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
    leaveSheet.getRange(foundIndex, 11).setValue(reviewerName);

    // Tự động bắn vào bảng Chấm Công (Hỗ trợ đa kỳ và nghỉ xuyên tháng, ví dụ 30/10 đến 02/11)
    syncLeaveRangeToAttendance(targetEmpId, fromDateStr, toDateStr, numDays, "P");

    return { success: true, message: `Đã phê duyệt đơn [${reqId}] và tự động đồng bộ ký hiệu [P] vào Bảng Chấm Công đa kỳ!` };
  } catch (err) {
    return { success: false, message: "Lỗi phê duyệt đơn: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Từ chối đơn xin nghỉ phép (Kiểm tra quyền RBAC)
 * @param {string} reqId - Mã đơn nghỉ phép
 * @param {string} [reason] - Lý do từ chối
 * @param {string} [callerEmail] - Email người từ chối (phải là Quản lý hoặc HR)
 */
function apiRejectLeave(reqId, reason, callerEmail) {
  let actualCaller = callerEmail;
  let actualReason = reason || "Không duyệt";

  // Xử lý linh hoạt trường hợp đảo vị trí tham số
  if (!actualCaller && typeof reason === "string" && reason.includes("@")) {
    actualCaller = reason;
    actualReason = "Kế hoạch công tác không phù hợp";
  }

  const auth = verifyUserAuthorization(actualCaller, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reqId) {
        const currentStatus = (data[i][8] || "").toString().trim().toUpperCase();
        if (currentStatus === "REJECTED") {
          return { success: false, message: `Đơn nghỉ [${reqId}] đã ở trạng thái từ chối trước đó!` };
        }
        if (currentStatus === "APPROVED") {
          return { success: false, message: `Đơn nghỉ [${reqId}] đã được phê duyệt và ghi nhận công. Không thể từ chối trực tiếp!` };
        }

        const reviewerName = auth.name || "Ban Giám Đốc";

        sheet.getRange(i + 1, 9).setValue("REJECTED");
        sheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
        sheet.getRange(i + 1, 11).setValue(reviewerName + " (Từ chối: " + actualReason + ")");
        return { success: true, message: `Đã từ chối đơn nghỉ phép [${reqId}]!` };
      }
    }
    return { success: false, message: "Không tìm thấy đơn: " + reqId };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

