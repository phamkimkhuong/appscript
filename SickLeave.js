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
    let foundIndex = -1;
    let currentStatus = "";

    for (let i = 1; i < sickData.length; i++) {
      if (sickData[i][0] === sickId) {
        foundIndex = i + 1;
        currentStatus = (sickData[i][8] || "").toString().trim().toUpperCase();
        targetEmpId = sickData[i][1];
        fromDateStr = sickData[i][4];
        numDays = parseInt(sickData[i][6]) || 1;
        break;
      }
    }

    if (foundIndex < 0) return { success: false, message: "Không tìm thấy hồ sơ: " + sickId };

    if (currentStatus === "APPROVED") {
      return { success: false, message: `Hồ sơ ốm đau [${sickId}] đã được phê duyệt trước đó!` };
    }
    if (currentStatus === "REJECTED") {
      return { success: false, message: `Hồ sơ ốm đau [${sickId}] đã bị từ chối, không thể phê duyệt lại!` };
    }

    sickSheet.getRange(foundIndex, 9).setValue("APPROVED");
    sickSheet.getRange(foundIndex, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
    sickSheet.getRange(foundIndex, 11).setValue(reviewerName || "HR / Kế toán");

    // Tự động bắn vào bảng Chấm Công (ChamCong) với ký hiệu 'O' và tính lại công
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
            const targetCol = 3 + (startDay + d);
            if (targetCol <= 34) {
              attSheet.getRange(j + 1, targetCol).setValue("O");
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

    return { success: true, message: `Đã phê duyệt chế độ BHXH cho hồ sơ [${sickId}] và đồng bộ ký hiệu [O] vào Bảng Chấm Công!` };
  } catch(err) {
    return { success: false, message: "Lỗi duyệt hồ sơ BHXH: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
