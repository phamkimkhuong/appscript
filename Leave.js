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
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Tạo đơn xin nghỉ phép mới
 */
function apiSubmitLeave(form) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const newId = "LV-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMM") + "-" + Math.floor(10 + Math.random() * 90);

    // Header: Mã Đơn | Mã NV | Họ và Tên | Loại Nghỉ | Từ Ngày | Đến Ngày | Số Ngày | Lý Do | Trạng Thái | Ngày Duyệt | Người Duyệt
    sheet.appendRow([
      newId,
      form.empId,
      form.empName,
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
  } catch(err) {
    return { success: false, message: "Lỗi nộp đơn: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Phê duyệt đơn xin nghỉ phép (CÓ KHÓA ĐỒNG THỜI LOCK SERVICE)
 * Tự động cập nhật ký hiệu 'P' vào bảng chấm công
 */
function apiApproveLeave(reqId, reviewerName) {
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
    let numDays = 1;

    for (let i = 1; i < leaveData.length; i++) {
      if (leaveData[i][0] === reqId) {
        leaveSheet.getRange(i + 1, 9).setValue("APPROVED"); // Cột Trạng thái
        leaveSheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
        leaveSheet.getRange(i + 1, 11).setValue(reviewerName || "Ban Giám Đốc");
        targetEmpId = leaveData[i][1];
        fromDateStr = leaveData[i][4];
        numDays = parseInt(leaveData[i][6]) || 1;
        break;
      }
    }

    if (!targetEmpId) return { success: false, message: "Không tìm thấy đơn nghỉ: " + reqId };

    // Tự động bắn vào bảng Chấm Công (ChamCong)
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (attSheet) {
      const attData = attSheet.getDataRange().getValues();
      let startDay = 1;
      try {
        startDay = new Date(fromDateStr).getDate();
      } catch(e) {
        startDay = parseInt(fromDateStr.split("-")[2]) || 1;
      }

      for (let j = 1; j < attData.length; j++) {
        if (attData[j][0] === targetEmpId) {
          for (let d = 0; d < numDays; d++) {
            const targetCol = 3 + (startDay + d); // Cột ngày tương ứng
            if (targetCol <= 34) {
              attSheet.getRange(j + 1, targetCol).setValue("P");
            }
          }
          break;
        }
      }
    }

    return { success: true, message: `Đã phê duyệt đơn [${reqId}] và tự động đồng bộ ký hiệu [P] vào Bảng Chấm Công!` };
  } catch(err) {
    return { success: false, message: "Lỗi phê duyệt đơn: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Từ chối đơn xin nghỉ phép
 */
function apiRejectLeave(reqId, reason, reviewerName) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reqId) {
        sheet.getRange(i + 1, 9).setValue("REJECTED");
        sheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
        sheet.getRange(i + 1, 11).setValue((reviewerName || "") + " (Từ chối: " + (reason || "Không duyệt") + ")");
        return { success: true, message: `Đã từ chối đơn nghỉ phép [${reqId}]!` };
      }
    }
    return { success: false, message: "Không tìm thấy đơn: " + reqId };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}
