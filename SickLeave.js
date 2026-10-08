/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: SickLeave.js (Quản lý Hồ sơ ốm đau BHXH & Đồng bộ công 'O')
 * ====================================================================
 */

/**
 * Lấy danh sách toàn bộ hồ sơ ốm đau
 */
function apiGetSickCases() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const data = sheetToObjects(sheet);
    return { success: true, data: data };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Nộp hồ sơ ốm đau mới
 */
function apiSubmitSick(form) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const newId = "SC-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMM") + "-" + Math.floor(10 + Math.random() * 90);

    // Header: Mã Hồ Sơ | Mã NV | Họ và Tên | Cơ Sở Y Tế | Từ Ngày | Đến Ngày | Số Ngày | Chứng Từ URL | Trạng Thái | Ngày Duyệt | Người Duyệt
    sheet.appendRow([
      newId,
      form.empId,
      form.empName,
      form.hospital,
      form.from,
      form.to,
      Number(form.days) || 1,
      form.docUrl || "https://drive.google.com/sample_cert.pdf",
      "PENDING",
      "",
      ""
    ]);

    return { success: true, message: `Nộp hồ sơ ốm đau thành công! Mã hồ sơ: ${newId}`, newId: newId };
  } catch(err) {
    return { success: false, message: "Lỗi nộp hồ sơ ốm đau: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Phê duyệt hồ sơ ốm đau (HR & Kế toán)
 * Tự động cập nhật ký hiệu 'O' vào bảng chấm công
 */
function apiApproveSick(sickId, reviewerName) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const sickData = sickSheet.getDataRange().getValues();

    let targetEmpId = null;
    let fromDateStr = null;
    let numDays = 1;

    for (let i = 1; i < sickData.length; i++) {
      if (sickData[i][0] === sickId) {
        sickSheet.getRange(i + 1, 9).setValue("APPROVED");
        sickSheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
        sickSheet.getRange(i + 1, 11).setValue(reviewerName || "HR / Kế toán");
        targetEmpId = sickData[i][1];
        fromDateStr = sickData[i][4];
        numDays = parseInt(sickData[i][6]) || 1;
        break;
      }
    }

    if (!targetEmpId) return { success: false, message: "Không tìm thấy hồ sơ: " + sickId };

    // Tự động bắn vào bảng Chấm Công (ChamCong) với ký hiệu 'O'
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
            const targetCol = 3 + (startDay + d);
            if (targetCol <= 34) {
              attSheet.getRange(j + 1, targetCol).setValue("O");
            }
          }
          break;
        }
      }
    }

    return { success: true, message: `Đã phê duyệt chế độ BHXH cho hồ sơ [${sickId}] và đồng bộ ký hiệu [O] vào Bảng Chấm Công!` };
  } catch(err) {
    return { success: false, message: "Lỗi duyệt hồ sơ BHXH: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
