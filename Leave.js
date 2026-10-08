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
    let foundIndex = -1;
    let currentStatus = "";

    for (let i = 1; i < leaveData.length; i++) {
      if (leaveData[i][0] === reqId) {
        foundIndex = i + 1;
        currentStatus = (leaveData[i][8] || "").toString().trim().toUpperCase();
        targetEmpId = leaveData[i][1];
        fromDateStr = leaveData[i][4];
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

    leaveSheet.getRange(foundIndex, 9).setValue("APPROVED"); // Cột Trạng thái
    leaveSheet.getRange(foundIndex, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
    leaveSheet.getRange(foundIndex, 11).setValue(reviewerName || "Ban Giám Đốc");

    // Tự động bắn vào bảng Chấm Công (ChamCong) và tính lại tổng công
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (attSheet) {
      const attData = attSheet.getDataRange().getValues();
      let startDay = 1;
      try {
        if (fromDateStr instanceof Date) {
          startDay = fromDateStr.getDate();
        } else {
          const str = String(fromDateStr);
          if (str.includes("-")) {
            startDay = parseInt(str.split("-")[2]) || 1;
          } else {
            startDay = new Date(str).getDate() || 1;
          }
        }
      } catch(e) {
        startDay = 1;
      }

      for (let j = 1; j < attData.length; j++) {
        if (attData[j][0] === targetEmpId) {
          for (let d = 0; d < numDays; d++) {
            const targetCol = 3 + (startDay + d); // Cột ngày tương ứng (1-indexed)
            if (targetCol <= 34) {
              attSheet.getRange(j + 1, targetCol).setValue("P");
            }
          }

          // Tính lại tổng công thực (X), phép (P), ốm (O)
          const rowVals = attSheet.getRange(j + 1, 4, 1, 31).getValues()[0];
          let totalX = 0, totalP = 0, totalO = 0;
          rowVals.forEach(s => {
            if (s === "X") totalX++;
            else if (s === "P") totalP++;
            else if (s === "O") totalO++;
          });

          attSheet.getRange(j + 1, 35).setValue(totalX); // Tổng công
          attSheet.getRange(j + 1, 36).setValue(totalP); // Tổng phép
          attSheet.getRange(j + 1, 37).setValue(totalO); // Tổng ốm
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
        const currentStatus = (data[i][8] || "").toString().trim().toUpperCase();
        if (currentStatus === "REJECTED") {
          return { success: false, message: `Đơn nghỉ [${reqId}] đã ở trạng thái từ chối trước đó!` };
        }
        if (currentStatus === "APPROVED") {
          return { success: false, message: `Đơn nghỉ [${reqId}] đã được phê duyệt và ghi nhận công. Không thể từ chối trực tiếp!` };
        }

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
