/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Attendance.js (Quản lý Bảng chấm công đa kỳ tháng/năm)
 * Hỗ trợ: Đa kỳ (10/2026, 11/2026, 2027...), tháng 28/29/30/31 ngày,
 *         nghỉ phép/ốm đau xuyên tháng (vd: 30/10 đến 02/11)
 * ====================================================================
 */

/**
 * Đảm bảo Sheet ChamCong có cột "Mã Kỳ Công" ở đầu (Tự động migrate an toàn nếu chưa có)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureAttendancePeriodColumn(sheet) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;

  const firstHeader = (data[0][0] || "").toString().trim();
  // Nếu cột đầu chưa phải là "Mã Kỳ Công" mà là "Mã NV"
  if (firstHeader !== "Mã Kỳ Công" && firstHeader === "Mã NV") {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue("Mã Kỳ Công");
    const numRows = sheet.getLastRow();
    if (numRows > 1) {
      // Đặt kỳ mặc định 10/2026 cho tất cả các bản ghi hiện tại
      const periods = [];
      for (let r = 2; r <= numRows; r++) {
        periods.push(["10/2026"]);
      }
      sheet.getRange(2, 1, numRows - 1, 1).setValues(periods);
    }
  }

  // Đảm bảo có cột "Tổng OT" tại cột 39
  const updatedHeaders = sheet.getRange(1, 1, 1, Math.max(39, sheet.getLastColumn())).getValues()[0];
  if (!updatedHeaders.includes("Tổng OT")) {
    sheet.getRange(1, 39).setValue("Tổng OT");
  }
}

/**
 * Lấy số ngày thực tế của một tháng trong năm (xử lý chính xác năm nhuận & tháng 28/30/31 ngày)
 * @param {number} month - Tháng (1-12)
 * @param {number} year - Năm (vd: 2026, 2027)
 * @returns {number}
 */
function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

/**
 * Sinh ma trận công chuẩn mặc định cho một kỳ tháng/năm
 * Tự động tính đúng thứ 7 (T7) và chủ nhật (CN) thực tế theo lịch vạn niên
 * @param {string} period - "MM/YYYY" (ví dụ: "10/2026", "11/2026", "02/2027")
 * @returns {{ days: string[], daysInMonth: number, standardWorkingDays: number }}
 */
function generateDefaultDaysForMonth(period) {
  const parts = (period || "10/2026").split("/");
  const month = parseInt(parts[0], 10) || 10;
  const year = parseInt(parts[1], 10) || 2026;
  const totalDays = getDaysInMonth(month, year);

  const days = Array(31).fill("");
  let standardWorkingDays = 0;

  for (let d = 1; d <= 31; d++) {
    if (d <= totalDays) {
      const dt = new Date(year, month - 1, d);
      const dayOfWeek = dt.getDay(); // 0: Chủ nhật (CN), 6: Thứ 7 (T7)
      if (dayOfWeek === 0) {
        days[d - 1] = "CN";
      } else if (dayOfWeek === 6) {
        days[d - 1] = "T7";
      } else {
        days[d - 1] = "X";
        standardWorkingDays++;
      }
    } else {
      days[d - 1] = ""; // Tháng không có ngày này (ví dụ ngày 29-31 tháng 2)
    }
  }

  return { days, daysInMonth: totalDays, standardWorkingDays };
}

/**
 * Khởi tạo dữ liệu chấm công cho một kỳ nếu chưa có trong Sheet ChamCong
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet ChamCong
 * @param {string} period - "MM/YYYY"
 * @param {Array<Object>} users - Danh sách nhân viên từ sheet Users
 */
function initPeriodAttendanceIfMissing(sheet, period, users) {
  ensureAttendancePeriodColumn(sheet);
  const data = sheet.getDataRange().getValues();
  const existingPeriodRows = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === period) {
      existingPeriodRows.push(data[i][1]); // Mã NV
    }
  }

  const { days, standardWorkingDays } = generateDefaultDaysForMonth(period);

  const activeUsers = users.filter(u => u["Trạng Thái"] !== "Đã nghỉ việc");
  activeUsers.forEach(u => {
    const empId = u["Mã NV"];
    if (!existingPeriodRows.includes(empId)) {
      sheet.appendRow([
        period,
        empId,
        u["Họ và Tên"],
        u["Phòng Ban"],
        ...days,
        standardWorkingDays, // Tổng công
        0,                  // Tổng phép
        0,                  // Tổng ốm
        0                   // Tổng OT
      ]);
    }
  });
}

/**
 * Đánh dấu ký hiệu công cho khoảng ngày nghỉ (Hỗ trợ nghỉ xuyên tháng, vd: 30/10 đến 02/11)
 * @param {string} targetEmpId - Mã nhân viên
 * @param {string|Date} fromDateStr - Ngày bắt đầu (yyyy-MM-dd)
 * @param {string|Date} [toDateStr] - Ngày kết thúc (yyyy-MM-dd)
 * @param {number} [numDays] - Số ngày nghỉ
 * @param {string} [symbol] - 'P' (nghỉ phép) hoặc 'O' (nghỉ ốm)
 */
function syncLeaveRangeToAttendance(targetEmpId, fromDateStr, toDateStr, numDays, symbol) {
  const ss = getSpreadsheet();
  const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (!attSheet) return;

  ensureAttendancePeriodColumn(attSheet);

  // Parse ngày bắt đầu
  let startDate;
  if (fromDateStr instanceof Date) {
    startDate = new Date(fromDateStr.getTime());
  } else {
    startDate = new Date(String(fromDateStr).replace(/-/g, "/"));
  }

  // Parse ngày kết thúc
  let endDate;
  if (toDateStr) {
    if (toDateStr instanceof Date) {
      endDate = new Date(toDateStr.getTime());
    } else {
      endDate = new Date(String(toDateStr).replace(/-/g, "/"));
    }
  } else {
    endDate = new Date(startDate.getTime());
    endDate.setDate(startDate.getDate() + (parseInt(String(numDays), 10) || 1) - 1);
  }

  // Lấy danh sách users để khởi tạo kỳ mới nếu cần
  const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
  const users = userSheet ? sheetToObjects(userSheet) : [];

  // Nhóm các ngày theo từng kỳ tháng/năm: { "10/2026": [30, 31], "11/2026": [1, 2] }
  const periodDaysMap = {};
  const cur = new Date(startDate.getTime());
  let safetyCount = 0;
  while (cur <= endDate && safetyCount < 60) {
    safetyCount++;
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const y = cur.getFullYear();
    const periodStr = `${m}/${y}`;
    const dayOfMonth = cur.getDate();

    if (!periodDaysMap[periodStr]) {
      periodDaysMap[periodStr] = [];
    }
    periodDaysMap[periodStr].push(dayOfMonth);
    cur.setDate(cur.getDate() + 1);
  }

  // Duyệt qua từng kỳ và cập nhật vào bảng ChamCong
  Object.keys(periodDaysMap).forEach(periodStr => {
    initPeriodAttendanceIfMissing(attSheet, periodStr, users);

    const attData = attSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < attData.length; i++) {
      if ((attData[i][0] || "").toString().trim() === periodStr && attData[i][1] === targetEmpId) {
        rowIndex = i + 1; // 1-indexed trong Sheets
        break;
      }
    }

    if (rowIndex > 0) {
      const daysToMark = periodDaysMap[periodStr];
      daysToMark.forEach(d => {
        const colIndex = 4 + d; // Cột 5 là Ngày 1, Cột 4 + d là Ngày d
        if (colIndex <= 35) {
          attSheet.getRange(rowIndex, colIndex).setValue(symbol);
        }
      });

      // Tính lại tổng công thực (X), phép (P), ốm (O)
      const rowVals = attSheet.getRange(rowIndex, 5, 1, 31).getValues()[0];
      let totalX = 0, totalP = 0, totalO = 0;
      rowVals.forEach(s => {
        if (s === "X") totalX++;
        else if (s === "P") totalP++;
        else if (s === "O") totalO++;
      });

      attSheet.getRange(rowIndex, 36).setValue(totalX); // Tổng công
      attSheet.getRange(rowIndex, 37).setValue(totalP); // Tổng phép
      attSheet.getRange(rowIndex, 38).setValue(totalO); // Tổng ốm
    }
  });
}

/**
 * Lấy dữ liệu ma trận chấm công theo kỳ tháng/năm cụ thể
 * @param {string} [period] - Kỳ chấm công ("MM/YYYY", vd: "10/2026", "11/2026")
 * @param {string} [userEmail] - Email người gọi
 */
function apiGetAttendance(period, userEmail) {
  try {
    const periodStr = (period || "10/2026").trim();
    const ss = getSpreadsheet();
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (!attSheet) {
      return { success: false, message: "Không tìm thấy bảng ChamCong!" };
    }

    ensureAttendancePeriodColumn(attSheet);

    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const users = userSheet ? sheetToObjects(userSheet) : [];

    // Tự động khởi tạo kỳ nếu kỳ này chưa có bản ghi
    initPeriodAttendanceIfMissing(attSheet, periodStr, users);

    const rawRows = sheetToObjects(attSheet);
    const periodRows = rawRows.filter(r => (r["Mã Kỳ Công"] || "10/2026") === periodStr);

    const timesheetMap = {};
    periodRows.forEach(row => {
      const empId = row["Mã NV"];
      if (!empId) return;
      const days = [];
      for (let d = 1; d <= 31; d++) {
        days.push(row["Ngày " + d] || "");
      }
      timesheetMap[empId] = days;
    });

    const parts = periodStr.split("/");
    const m = parseInt(parts[0], 10) || 10;
    const y = parseInt(parts[1], 10) || 2026;
    const daysInMonth = getDaysInMonth(m, y);

    return {
      success: true,
      period: periodStr,
      daysInMonth: daysInMonth,
      timesheet: timesheetMap,
      data: periodRows
    };
  } catch (err) {
    return { success: false, message: "Lỗi tải bảng chấm công: " + err.message };
  }
}

/**
 * Cập nhật ký hiệu chấm công cho 1 ngày cụ thể của nhân viên theo kỳ (Kiểm tra quyền Quản lý / HR)
 * @param {string} empId - Mã nhân viên
 * @param {number} day - Ngày trong tháng (1 đến 31)
 * @param {string} symbol - Ký hiệu (X, P, O, CN, T7...)
 * @param {string} [callerEmail] - Email của người thực hiện thao tác
 * @param {string} [period] - Kỳ tháng/năm (vd: "10/2026", "11/2026")
 */
function apiUpdateAttendanceCell(empId, day, symbol, callerEmail, period) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const periodStr = (period || "10/2026").trim();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (!sheet) return { success: false, message: "Bảng ChamCong không tồn tại!" };

    ensureAttendancePeriodColumn(sheet);

    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const users = userSheet ? sheetToObjects(userSheet) : [];
    initPeriodAttendanceIfMissing(sheet, periodStr, users);

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      const rowPeriod = (data[i][0] || "10/2026").toString().trim();
      const rowEmpId = data[i][1];

      if (rowPeriod === periodStr && rowEmpId === empId) {
        // Cột ngày 1 là cột thứ 5 (column 5 trong 1-index)
        const colIndex = 4 + Number(day);
        if (colIndex >= 5 && colIndex <= 35) {
          sheet.getRange(i + 1, colIndex).setValue(symbol);

          // Tính lại tổng công thực (X), làm thêm (OT), phép (P), ốm (O)
          const rowVals = sheet.getRange(i + 1, 5, 1, 31).getValues()[0];
          let totalX = 0, totalP = 0, totalO = 0, totalOT = 0;
          rowVals.forEach(s => {
            if (s === "X") totalX++;
            else if (s === "OT") totalOT++;
            else if (s === "P") totalP++;
            else if (s === "O") totalO++;
          });

          sheet.getRange(i + 1, 36).setValue(totalX); // Tổng công
          sheet.getRange(i + 1, 37).setValue(totalP); // Tổng phép
          sheet.getRange(i + 1, 38).setValue(totalO); // Tổng ốm
          sheet.getRange(i + 1, 39).setValue(totalOT); // Tổng OT
        }
        return { success: true, message: `Đã cập nhật ngày ${day} (${periodStr}) của NV ${empId} thành [${symbol}]!` };
      }
    }
    return { success: false, message: `Không tìm thấy dòng chấm công kỳ ${periodStr} của nhân viên: ${empId}` };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Xuất dữ liệu bảng chấm công kỳ chỉ định sang định dạng bảng HTML Excel (.xls) có thể mở trực tiếp
 * @param {string} [period] - Kỳ tháng/năm
 * @param {string} [userEmail] - Email người gọi
 */
function apiExportAttendanceExcel(period, userEmail) {
  try {
    const res = apiGetAttendance(period, userEmail);
    if (!res.success) return res;

    const periodStr = res.period;
    const daysInMonth = res.daysInMonth;
    const rows = res.data || [];

    let tableHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/><title>Bảng Chấm Công Kỳ ${periodStr}</title>
    <style>
      th { background-color: #1e293b; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 6px; }
      td { border: 1px solid #cbd5e1; text-align: center; padding: 5px; }
      .text-left { text-align: left; }
    </style></head><body>
    <h2>VINTECH SOLUTIONS - BẢNG CHẤM CÔNG VÀ LÀM THÊM GIỜ KỲ ${periodStr}</h2>
    <table><thead><tr>
      <th>Mã NV</th><th>Họ và Tên</th><th>Phòng Ban</th>`;

    for (let d = 1; d <= daysInMonth; d++) {
      tableHtml += `<th>Ngày ${d}</th>`;
    }
    tableHtml += `<th>Tổng Công</th><th>Tổng OT</th><th>Tổng Phép</th><th>Tổng Ốm</th></tr></thead><tbody>`;

    rows.forEach(r => {
      tableHtml += `<tr><td class="text-left">${r["Mã NV"] || ""}</td><td class="text-left">${r["Họ và Tên"] || ""}</td><td class="text-left">${r["Phòng Ban"] || ""}</td>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const val = r["Ngày " + d] || "";
        tableHtml += `<td>${val}</td>`;
      }
      tableHtml += `<td>${r["Tổng Công"] || 0}</td><td>${r["Tổng OT"] || 0}</td><td>${r["Tổng Phép"] || 0}</td><td>${r["Tổng Ốm"] || 0}</td></tr>`;
    });

    tableHtml += `</tbody></table></body></html>`;

    return {
      success: true,
      fileName: `Bang_Cham_Cong_${periodStr.replace('/', '_')}.xls`,
      mimeType: "application/vnd.ms-excel",
      content: Utilities.base64Encode(Utilities.newBlob(tableHtml, "application/vnd.ms-excel").getBytes())
    };
  } catch (err) {
    return { success: false, message: "Lỗi xuất file Excel: " + err.message };
  }
}
