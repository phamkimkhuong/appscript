/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Attendance.js (Quản lý Bảng chấm công 31 ngày & Đồng bộ)
 * ====================================================================
 */

/**
 * Lấy dữ liệu ma trận chấm công
 */
function apiGetAttendance() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const data = sheetToObjects(sheet);
    return { success: true, data: data };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Cập nhật ký hiệu chấm công cho 1 ngày cụ thể của nhân viên
 * @param {string} empId - Mã nhân viên
 * @param {number} day - Ngày trong tháng (1 đến 31)
 * @param {string} symbol - Ký hiệu (X, P, O, L, CN...)
 */
function apiUpdateAttendanceCell(empId, day, symbol) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === empId) {
        // Cột ngày 1 là cột thứ 4 (index 3 trong 0-index, tức column 4 trong 1-index)
        const colIndex = 3 + parseInt(day);
        if (colIndex >= 4 && colIndex <= 34) {
          sheet.getRange(i + 1, colIndex).setValue(symbol);

          // Tính lại tổng công thực (X), phép (P), ốm (O)
          const rowVals = sheet.getRange(i + 1, 4, 1, 31).getValues()[0];
          let totalX = 0, totalP = 0, totalO = 0;
          rowVals.forEach(s => {
            if (s === "X") totalX++;
            else if (s === "P") totalP++;
            else if (s === "O") totalO++;
          });

          sheet.getRange(i + 1, 35).setValue(totalX); // Tổng công
          sheet.getRange(i + 1, 36).setValue(totalP); // Tổng phép
          sheet.getRange(i + 1, 37).setValue(totalO); // Tổng ốm
        }
        return { success: true, message: `Đã cập nhật ngày ${day} của NV ${empId} thành [${symbol}]!` };
      }
    }
    return { success: false, message: "Không tìm thấy dòng chấm công của nhân viên: " + empId };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}
