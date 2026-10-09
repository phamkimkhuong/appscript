/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Database.js (Khởi tạo và quản lý kết nối Google Sheets)
 * ====================================================================
 */

/**
 * Mở Spreadsheet an toàn với try/catch và Script Properties
 */
function getSpreadsheet_() {
  if (REQUEST_CONTEXT_ && REQUEST_CONTEXT_.ss) return REQUEST_CONTEXT_.ss;
  const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ssId = propId || CONFIG.DEFAULT_SPREADSHEET_ID;
  let ss;
  try {
    ss = SpreadsheetApp.openById(ssId);
  } catch (err) {
    throw new Error("Không thể mở Google Sheet với ID [" + ssId + "]. Vui lòng kiểm tra quyền chia sẻ!");
  }
  if (!ss.getSheetByName(CONFIG.SHEET_NAMES.USERS)) {
    setupDatabaseSheets_(ss, true);
  }
  if (REQUEST_CONTEXT_) REQUEST_CONTEXT_.ss = ss;
  return ss;
}

/**
 * Chuyển đổi dữ liệu 1 Sheet thành mảng Object dựa vào dòng Header
 */
function sheetToObjects_(sheet) {
  if (!sheet) return [];
  return matrixToObjects_(sheet.getDataRange().getValues());
}

function matrixToObjects_(data) {
  if (data.length <= 1) return [];

  const headers = data[0];
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Bỏ qua dòng trống
    if (!row[0] && !row[1]) continue;
    const item = { _rowIndex: i + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c].toString().trim();
      let val = row[c];
      // Chuẩn hóa Date object thành chuỗi yyyy-MM-dd tránh lỗi truyền tải Apps Script
      if (val instanceof Date) {
        val = Utilities.formatDate(val, CONFIG.TIMEZONE || "GMT+7", "yyyy-MM-dd");
      }
      item[key] = val;
    }
    results.push(item);
  }
  return results;
}

/**
 * Format ngày giờ GMT+7 chuẩn VN
 */
function formatDateVN_(date) {
  if (!date) return "";
  const d = new Date(date);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm");
}

/** Build the entire demo in memory before writing to Sheets. */
function demoSeedTables_() {
  const tables = {};
  const getOrCreateSheet = name => (tables[name] = []);

  // 1. Sheet Users (Nhân sự)
  let userSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.USERS);
  if (userSheet.length < 1) {
    userSheet.push(["Mã NV", "Họ và Tên", "Phòng Ban", "Chức Vụ", "Lương Cơ Bản", "Email", "Mật Khẩu", "Trạng Thái", "Ngày Vào Làm", "Số Điện Thoại"]);
    userSheet.push(["VT-001", "Lê Thị Phương", "Kỹ thuật", "Nhân viên", 18000000, "phuong.le@vintech.vn", "123456", "Đang làm việc", "15/01/2024", "0901234567"]);
    userSheet.push(["VT-002", "Trần Minh Trí", "Kỹ thuật", "Quản lý", 28000000, "tri.tran@vintech.vn", "123456", "Đang làm việc", "01/03/2023", "0912345678"]);
    userSheet.push(["VT-003", "Nguyễn Thu Hương", "Kế toán", "Kế toán", 24000000, "huong.nguyen@vintech.vn", "123456", "Đang làm việc", "10/05/2023", "0923456789"]);
    userSheet.push(["VT-004", "Hoàng Khương Duy", "Kỹ thuật", "Nhân viên", 16500000, "duy.hoang@vintech.vn", "123456", "Đang làm việc", "20/08/2024", "0934567890"]);
  }

  // 2. Sheet ChamCong (Ma trận chấm công đa kỳ tháng/năm có hỗ trợ OT)
  let attSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (attSheet.length < 1) {
    const daysHeader = [];
    for (let d = 1; d <= 31; d++) daysHeader.push("Ngày " + d);
    attSheet.push(["Mã Kỳ Công", "Mã NV", "Họ và Tên", "Phòng Ban", ...daysHeader, "Tổng Công", "Tổng Phép", "Tổng Ốm", "Tổng OT"]);

    // Dữ liệu mẫu Kỳ 10/2026 (31 ngày: 4 CN, 5 T7 => 22 ngày làm việc chuẩn "X")
    const defaultDays10 = Array(31).fill("X");
    [3, 10, 17, 24].forEach(idx => { defaultDays10[idx] = "CN"; });
    [2, 9, 16, 23, 30].forEach(idx => { defaultDays10[idx] = "T7"; });

    attSheet.push(["10/2026", "VT-001", "Lê Thị Phương", "Kỹ thuật", ...defaultDays10, 22, 0, 0, 0]);
    attSheet.push(["10/2026", "VT-002", "Trần Minh Trí", "Kỹ thuật", ...defaultDays10, 22, 0, 0, 0]);
    attSheet.push(["10/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán", ...defaultDays10, 22, 0, 0, 0]);

    // VT-004 có 2 ngày làm thêm OT (Thứ 7 ngày 10 & 24) và 2 ngày ốm theo SC-2610-01 (ngày 12 & 13)
    const days4 = [...defaultDays10];
    days4[9] = "OT"; days4[23] = "OT";
    days4[11] = "O"; days4[12] = "O";
    attSheet.push(["10/2026", "VT-004", "Hoàng Khương Duy", "Kỹ thuật", ...days4, 20, 0, 2, 2]);

    // Dữ liệu mẫu Kỳ 11/2026 (30 ngày: Ngày 1, 8, 15, 22, 29 là CN; 7, 14, 21, 28 là T7; ngày 31 để trống)
    const defaultDays11 = Array(31).fill("X");
    [0, 7, 14, 21, 28].forEach(idx => { defaultDays11[idx] = "CN"; });
    [6, 13, 20, 27].forEach(idx => { defaultDays11[idx] = "T7"; });
    defaultDays11[30] = ""; // Tháng 11 chỉ có 30 ngày

    attSheet.push(["11/2026", "VT-001", "Lê Thị Phương", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.push(["11/2026", "VT-002", "Trần Minh Trí", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.push(["11/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.push(["11/2026", "VT-004", "Hoàng Khương Duy", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
  }

  // 3. Sheet DonNghiPhep
  let leaveSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.LEAVE);
  if (leaveSheet.length < 1) {
    leaveSheet.push(["Mã Đơn", "Mã NV", "Họ và Tên", "Loại Nghỉ", "Từ Ngày", "Đến Ngày", "Số Ngày", "Lý Do", "Trạng Thái", "Ngày Duyệt", "Người Duyệt"]);
    leaveSheet.push(["LV-2610-01", "VT-001", "Lê Thị Phương", "Nghỉ phép năm", "2026-10-14", "2026-10-15", 2, "Việc gia đình ở quê", "PENDING", "", ""]);
  }

  // 4. Sheet HoSoOmDau (Có hỗ trợ quy trình Yêu cầu bổ sung)
  let sickSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.SICK);
  if (sickSheet.length < 1) {
    sickSheet.push(["Mã Hồ Sơ", "Mã NV", "Họ và Tên", "Cơ Sở Y Tế", "Từ Ngày", "Đến Ngày", "Số Ngày", "Chứng Từ URL", "Trạng Thái", "Ngày Duyệt", "Người Duyệt", "Ghi Chú"]);
    sickSheet.push(["SC-2610-01", "VT-004", "Hoàng Khương Duy", "Bệnh viện Bạch Mai", "2026-10-12", "2026-10-13", 2, "demo:sample", "APPROVED", "13/10/2026 09:30", "Trần Minh Trí", "Đã đối chiếu chứng từ hợp lệ"]);
    sickSheet.push(["SC-2610-02", "VT-004", "Hoàng Khương Duy", "Bệnh viện Hồng Ngọc", "2026-10-20", "2026-10-21", 2, "demo:sample", "NEED_MORE_INFO", "21/10/2026 14:00", "Trần Minh Trí", "Cần bổ sung giấy chứng nhận nghỉ việc hưởng BHXH có mộc tròn"]);
  }

  // 6. Sheet CongViec (Nhiệm vụ & Tasks - E-Office)
  let taskSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.TASKS);
  if (taskSheet.length < 1) {
    taskSheet.push(["Mã CV", "Tiêu Đề Công Việc", "Loại Công Việc", "Người Giao", "Người Phụ Trách", "Ngày Bắt Đầu", "Hạn Chót", "Ngày Hoàn Thành", "Trạng Thái", "Đánh Giá", "Ghi Chú", "Mã Văn Bản"]);
    taskSheet.push(["CV-101", "Rà soát kế hoạch bảo mật dữ liệu quý IV", "Dự án", "Trần Minh Trí", "Lê Thị Phương", "01/10/2026", "15/10/2026", "", "Đang xử lý", "", "Ưu tiên cao", "01/2026/QĐ-VT"]);
    taskSheet.push(["CV-102", "Quyết toán thuế TNCN và tạm ứng lương", "Hành chính", "Ban Giám Đốc", "Nguyễn Thu Hương", "05/10/2026", "20/10/2026", "", "Đang xử lý", "", "Đúng kỳ hạn", "18/2026/TB-LUONG"]);
    taskSheet.push(["CV-103", "Triển khai hạ tầng máy chủ cho chi nhánh", "Kỹ thuật", "Trần Minh Trí", "Hoàng Khương Duy", "02/10/2026", "18/10/2026", "", "Đang xử lý", "", "Cần mua thêm license", ""]);
  }

  // 7. Sheet VanBan (Có trường Lĩnh Vực & đầy đủ Văn bản Tiền lương)
  let docSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.DOCUMENTS);
  if (docSheet.length < 1) {
    docSheet.push(["Số Hiệu", "Tiêu Đề Văn Bản", "Loại Văn Bản", "Cơ Quan Ban Hành", "Ngày Ban Hành", "Người Ký", "Link Tài Liệu", "Trạng Thái", "Lĩnh Vực"]);
    docSheet.push(["01/2026/QĐ-VT", "Quyết định ban hành Quy chế làm việc từ xa (Work From Home)", "Quy chế nội bộ", "Tổng Giám Đốc", "02/01/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
    docSheet.push(["02/2026/QC-LUONG", "Quy chế tiền lương, tiền thưởng và phụ cấp nội bộ năm 2026", "Quy chế lương", "Tổng Giám Đốc", "05/01/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["18/2026/TB-LUONG", "Thông báo chi trả kỳ lương Tháng 10/2026 và quyết toán công tác phí", "Thông báo trả lương", "Phòng Nhân Sự", "01/10/2026", "Nguyễn Thu Hương", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["22/2026/QĐ-TL", "Quyết định điều chỉnh bậc lương và phụ cấp trách nhiệm khối Kỹ thuật", "Quyết định điều chỉnh lương", "Tổng Giám Đốc", "15/09/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["45/2019/QH14", "Bộ luật Lao động năm 2019 số 45/2019/QH14", "Văn bản pháp luật", "Quốc Hội", "20/11/2019", "Chủ tịch Quốc Hội", "demo:sample", "Tài liệu tham khảo", "Chính sách Lao động & Việc làm"]);
    docSheet.push(["DEMO-BHXH", "Tình huống thực hành hồ sơ ốm đau (tài liệu giả lập)", "Văn bản pháp luật", "Bộ phận đào tạo (giả lập)", "01/10/2026", "Người biên soạn demo", "demo:sample", "Tài liệu tham khảo", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["15/2026/TB-VT", "Thông báo lịch nghỉ Lễ và tổ chức khám sức khỏe định kỳ", "Thông báo", "Phòng Nhân Sự", "15/09/2026", "Nguyễn Thu Hương", "demo:sample", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
  }

  const users = matrixToObjects_(tables[CONFIG.SHEET_NAMES.USERS]);
  const historicalPeriods = previousPayrollPeriods_(null, 2);
  const attendanceRows = tables[CONFIG.SHEET_NAMES.ATTENDANCE];
  historicalPeriods.forEach(period => users.forEach(user => {
    if (attendanceRows.slice(1).some(row=>row[0]===period && row[1]===user['Mã NV'])) return;
    const days = monthDays_(period).days;
    if (user['Mã NV'] === 'VT-004') {
      const saturdays = days.map((value,index)=>value==='T7'?index:-1).filter(index=>index>=0);
      saturdays.slice(0,2).forEach(index=>days[index]='OT');
      const weekdays = days.map((value,index)=>value==='X'?index:-1).filter(index=>index>=0);
      weekdays.slice(0,2).forEach(index=>days[index]='O');
    }
    const totals = attendanceTotals_(days);
    attendanceRows.push([period,user['Mã NV'],user['Họ và Tên'],user['Phòng Ban'],...days,totals.actualDays,totals.paidLeaveDays,totals.sickDays,totals.otDays]);
  }));
  attendanceRows.slice(1).forEach(row=>{
    const period=row[0],cutoff=attendanceCutoff_(period),calendar=emptyAttendanceDays_(period);
    for(let i=cutoff;i<31;i++)if(['X','OT'].includes(row[4+i]))row[4+i]=calendar[i];
    const totals=attendanceTotals_(actualAttendanceDays_(period,row.slice(4,35)));
    row.splice(35,4,totals.actualDays,totals.paidLeaveDays,totals.sickDays,totals.otDays);
  });
  const attendance = matrixToObjects_(attendanceRows);
  const taskRows = tables[CONFIG.SHEET_NAMES.TASKS];
  taskRows[0].push('Mã NV Phụ Trách');
  taskRows.slice(1).forEach(row => {
    const user = users.find(u => u['Họ và Tên'] === row[4]);
    row.push(user ? user['Mã NV'] : '');
  });
  const payrollKeys = Object.keys(PAYROLL_FIELDS_);
  const payrollRows = [payrollKeys.map(key => PAYROLL_FIELDS_[key])];
  historicalPeriods.forEach(period => users.forEach(user => {
    const days = rowDays_(attendance.find(row => row['Mã NV'] === user['Mã NV'] && row['Mã Kỳ Công'] === period));
    const value = payrollValue_(user, period, days);
    payrollRows.push(payrollKeys.map(key => value[key]));
  }));
  tables[CONFIG.SHEET_NAMES.PAYROLL] = payrollRows;
  return tables;
}

/** One rectangular write per table; format only populated cells. */
function setupDatabaseSheets_(customSS, forceReset) {
  const ss = customSS || getSpreadsheet_();
  const tables = demoSeedTables_();
  Object.keys(tables).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    else if (!forceReset && sheet.getLastRow() > 0) return;
    else if (forceReset) sheet.clear();
    const values = tables[name], width = values[0].length;
    const columns = sheet.getMaxColumns(), rows = sheet.getMaxRows();
    if (columns < width) sheet.insertColumnsAfter(columns, width - columns);
    if (rows < values.length) sheet.insertRowsAfter(rows, values.length - rows);
    const range = sheet.getRange(1, 1, values.length, width);
    // Invalidate before writing, so a failed write cannot leave stale cached rows.
    if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[name];
    range.setNumberFormat('@');
    range.setValues(values);
  });
  Logger.log("Đã khởi tạo hoàn tất toàn bộ 7 Bảng dữ liệu chuẩn Doanh Nghiệp trên Google Sheets!");
  return { success: true, message: "Đã khởi tạo thành công 7 bảng dữ liệu!" };
}


function rows_(name) {
  const ss = getSpreadsheet_();
  // Lives only for this RPC; never shared between workspaces or requests.
  const cache = REQUEST_CONTEXT_.rows || (REQUEST_CONTEXT_.rows = {});
  if (!Object.prototype.hasOwnProperty.call(cache, name)) cache[name] = sheetToObjects_(ss.getSheetByName(name));
  return cache[name];
}
function saveRow_(name,fields,rowIndex) {
  if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[name];
  const sheet=getSpreadsheet_().getSheetByName(name);
  const headers=sheet.getDataRange().getValues()[0].map(String);
  Object.keys(fields).forEach(key=>{if(!headers.includes(key))headers.push(key);});
  if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  const targetRow=rowIndex||sheet.getLastRow()+1;
  if(targetRow>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),targetRow-sheet.getMaxRows());
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.getRange(targetRow,1,1,headers.length).setNumberFormat("@");
  const old=rowIndex?sheet.getRange(rowIndex,1,1,headers.length).getValues()[0]:[];
  const values=headers.map((key,i)=>{
    const val=Object.prototype.hasOwnProperty.call(fields,key)?fields[key]:(old[i]===undefined?'':old[i]);
    return typeof val==='string'&&/^[=+@]/.test(val)?"'"+val:val;
  });
  sheet.getRange(rowIndex||sheet.getLastRow()+1,1,1,headers.length).setValues([values]);
}
function resetDatabase_() {
  authorized_(['manager']);
  setupDatabaseSheets_(getSpreadsheet_(), true);
  return { success: true, message: 'Đã khôi phục dữ liệu mẫu vào Google Sheet trung tâm.' };
}
function resetWorkspace_() {
  return resetDatabase_();
}
function initDatabase_() {
  return setupDatabaseSheets_(null, true);
}
