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
  require_(REQUEST_CONTEXT_ && REQUEST_CONTEXT_.ss, 'Phiên chưa được xác thực.');
  return REQUEST_CONTEXT_.ss;
}

/**
 * Chuyển đổi dữ liệu 1 Sheet thành mảng Object dựa vào dòng Header
 */
function sheetToObjects_(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
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

/**
 * Khởi tạo trọn vẹn cấu trúc 7 Bảng (Sheets) chuẩn Doanh Nghiệp
 * Chạy hàm này để tự động thiết lập toàn bộ Database
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [customSS]
 * @param {boolean} [forceReset] - Xóa sạch dữ liệu cũ và khởi tạo mới
 */
function setupDatabaseSheets_(customSS, forceReset) {
  const ss = customSS || getSpreadsheet_();

  // Helper để lấy sheet hoặc tạo mới, tùy chọn clear nếu forceReset
  const getOrCreateSheet = (name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    } else if (forceReset) {
      sheet.clear();
    }
    if(sheet.getMaxColumns()<40)sheet.insertColumnsAfter(sheet.getMaxColumns(),40-sheet.getMaxColumns());
    sheet.getRange(1,1,sheet.getMaxRows(),sheet.getMaxColumns()).setNumberFormat("@");
    return sheet;
  };

  // 1. Sheet Users (Nhân sự)
  let userSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.USERS);
  if (userSheet.getLastRow() < 1) {
    userSheet.appendRow(["Mã NV", "Họ và Tên", "Phòng Ban", "Chức Vụ", "Vai Trò", "Lương Cơ Bản", "Email", "Mật Khẩu", "Trạng Thái", "Ngày Vào Làm", "Số Điện Thoại"]);
    userSheet.appendRow(["VT-001", "Lê Thị Phương", "Kỹ thuật", "Chuyên viên Lập trình", "employee", 18000000, "phuong.le@vintech.vn", "123456", "Đang làm việc", "15/01/2024", "0901234567"]);
    userSheet.appendRow(["VT-002", "Trần Minh Trí", "Kỹ thuật", "Trưởng phòng Kỹ thuật", "manager", 28000000, "tri.tran@vintech.vn", "123456", "Đang làm việc", "01/03/2023", "0912345678"]);
    userSheet.appendRow(["VT-003", "Nguyễn Thu Hương", "Kế toán", "Kế toán trưởng / HR Lead", "hr", 24000000, "huong.nguyen@vintech.vn", "123456", "Đang làm việc", "10/05/2023", "0923456789"]);
    userSheet.appendRow(["VT-004", "Hoàng Khương Duy", "Kỹ thuật", "Kỹ sư Hệ thống", "employee", 16500000, "duy.hoang@vintech.vn", "123456", "Đang làm việc", "20/08/2024", "0934567890"]);
    userSheet.appendRow(["VT-005", "Đinh Thị Huyền Trang", "Kinh doanh", "Chuyên viên Kinh doanh", "employee", 15000000, "trang.dinh@vintech.vn", "123456", "Đang làm việc", "05/11/2024", "0945678901"]);
  }

  // 2. Sheet ChamCong (Ma trận chấm công đa kỳ tháng/năm có hỗ trợ OT)
  let attSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (attSheet.getLastRow() < 1) {
    const daysHeader = [];
    for (let d = 1; d <= 31; d++) daysHeader.push("Ngày " + d);
    attSheet.appendRow(["Mã Kỳ Công", "Mã NV", "Họ và Tên", "Phòng Ban", ...daysHeader, "Tổng Công", "Tổng Phép", "Tổng Ốm", "Tổng OT"]);

    // Dữ liệu mẫu Kỳ 10/2026 (31 ngày: 4 CN, 5 T7 => 22 ngày làm việc chuẩn "X")
    const defaultDays10 = Array(31).fill("X");
    [3, 10, 17, 24].forEach(idx => { defaultDays10[idx] = "CN"; });
    [2, 9, 16, 23, 30].forEach(idx => { defaultDays10[idx] = "T7"; });

    attSheet.appendRow(["10/2026", "VT-001", "Lê Thị Phương", "Kỹ thuật", ...defaultDays10, 22, 0, 0, 0]);
    attSheet.appendRow(["10/2026", "VT-002", "Trần Minh Trí", "Kỹ thuật", ...defaultDays10, 22, 0, 0, 0]);
    attSheet.appendRow(["10/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán", ...defaultDays10, 22, 0, 0, 0]);

    // VT-004 có 2 ngày làm thêm OT (Thứ 7 ngày 10 & 24)
    const days4 = [...defaultDays10];
    days4[9] = "OT"; days4[23] = "OT";
    attSheet.appendRow(["10/2026", "VT-004", "Hoàng Khương Duy", "Kỹ thuật", ...days4, 22, 0, 0, 2]);

    // VT-005 có 2 ngày ốm (ngày 12 & 13)
    const days5 = [...defaultDays10];
    days5[11] = "O"; days5[12] = "O";
    attSheet.appendRow(["10/2026", "VT-005", "Đinh Thị Huyền Trang", "Kinh doanh", ...days5, 20, 0, 2, 0]);

    // Dữ liệu mẫu Kỳ 11/2026 (30 ngày: Ngày 1, 8, 15, 22, 29 là CN; 7, 14, 21, 28 là T7; ngày 31 để trống)
    const defaultDays11 = Array(31).fill("X");
    [0, 7, 14, 21, 28].forEach(idx => { defaultDays11[idx] = "CN"; });
    [6, 13, 20, 27].forEach(idx => { defaultDays11[idx] = "T7"; });
    defaultDays11[30] = ""; // Tháng 11 chỉ có 30 ngày

    attSheet.appendRow(["11/2026", "VT-001", "Lê Thị Phương", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.appendRow(["11/2026", "VT-002", "Trần Minh Trí", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.appendRow(["11/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.appendRow(["11/2026", "VT-004", "Hoàng Khương Duy", "Kỹ thuật", ...defaultDays11, 21, 0, 0, 0]);
    attSheet.appendRow(["11/2026", "VT-005", "Đinh Thị Huyền Trang", "Kinh doanh", ...defaultDays11, 21, 0, 0, 0]);
  }

  // 3. Sheet DonNghiPhep
  let leaveSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.LEAVE);
  if (leaveSheet.getLastRow() < 1) {
    leaveSheet.appendRow(["Mã Đơn", "Mã NV", "Họ và Tên", "Loại Nghỉ", "Từ Ngày", "Đến Ngày", "Số Ngày", "Lý Do", "Trạng Thái", "Ngày Duyệt", "Người Duyệt"]);
    leaveSheet.appendRow(["LV-2610-01", "VT-001", "Lê Thị Phương", "Nghỉ phép năm", "2026-10-14", "2026-10-15", 2, "Việc gia đình ở quê", "PENDING", "", ""]);
  }

  // 4. Sheet HoSoOmDau (Có hỗ trợ quy trình Yêu cầu bổ sung)
  let sickSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.SICK);
  if (sickSheet.getLastRow() < 1) {
    sickSheet.appendRow(["Mã Hồ Sơ", "Mã NV", "Họ và Tên", "Cơ Sở Y Tế", "Từ Ngày", "Đến Ngày", "Số Ngày", "Chứng Từ URL", "Trạng Thái", "Ngày Duyệt", "Người Duyệt", "Ghi Chú"]);
    sickSheet.appendRow(["SC-2610-01", "VT-005", "Đinh Thị Huyền Trang", "Bệnh viện Bạch Mai", "2026-10-12", "2026-10-13", 2, "demo:sample", "APPROVED", "13/10/2026 09:30", "Nguyễn Thu Hương", "Đã đối chiếu chứng từ hợp lệ"]);
    sickSheet.appendRow(["SC-2610-02", "VT-004", "Hoàng Khương Duy", "Bệnh viện Hồng Ngọc", "2026-10-20", "2026-10-21", 2, "demo:sample", "NEED_MORE_INFO", "21/10/2026 14:00", "Nguyễn Thu Hương", "Cần bổ sung giấy chứng nhận nghỉ việc hưởng BHXH có mộc tròn"]);
  }

  // 5. Sheet BangLuong
  let payrollSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.PAYROLL);
  if (payrollSheet.getLastRow() < 1) {
    payrollSheet.appendRow(["Mã Kỳ Lương", "Mã NV", "Họ và Tên", "Chức Vụ", "Lương Cơ Bản", "Công Chuẩn", "Công Thực", "Phụ Cấp", "Khấu Trừ BHXH", "Thực Lĩnh", "Trạng Thái"]);
    payrollSheet.appendRow(["10/2026", "VT-001", "Lê Thị Phương", "Chuyên viên Lập trình", 18000000, 22, 22, 1500000, 1890000, 17610000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-002", "Trần Minh Trí", "Trưởng phòng Kỹ thuật", 28000000, 22, 22, 1500000, 2940000, 26560000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán trưởng / HR Lead", 24000000, 22, 22, 1500000, 2520000, 22980000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-004", "Hoàng Khương Duy", "Kỹ sư Hệ thống", 16500000, 22, 22, 1500000, 1732500, 18517500, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-005", "Đinh Thị Huyền Trang", "Chuyên viên Kinh doanh", 15000000, 22, 20, 1500000, 1575000, 13561364, "Đã chốt lương"]);
  }

  // 6. Sheet CongViec (Nhiệm vụ & Tasks - E-Office)
  let taskSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.TASKS);
  if (taskSheet.getLastRow() < 1) {
    taskSheet.appendRow(["Mã CV", "Tiêu Đề Công Việc", "Loại Công Việc", "Người Giao", "Người Phụ Trách", "Ngày Bắt Đầu", "Hạn Chót", "Ngày Hoàn Thành", "Trạng Thái", "Đánh Giá", "Ghi Chú", "Mã Văn Bản"]);
    taskSheet.appendRow(["CV-101", "Rà soát kế hoạch bảo mật dữ liệu quý IV", "Dự án", "Trần Minh Trí", "Lê Thị Phương", "01/10/2026", "15/10/2026", "", "Đang xử lý", "", "Ưu tiên cao", "01/2026/QĐ-VT"]);
    taskSheet.appendRow(["CV-102", "Quyết toán thuế TNCN và tạm ứng lương", "Hành chính", "Ban Giám Đốc", "Nguyễn Thu Hương", "05/10/2026", "20/10/2026", "", "Đang xử lý", "", "Đúng kỳ hạn", "18/2026/TB-LUONG"]);
    taskSheet.appendRow(["CV-103", "Triển khai hạ tầng máy chủ cho chi nhánh", "Kỹ thuật", "Trần Minh Trí", "Hoàng Khương Duy", "02/10/2026", "18/10/2026", "", "Đang xử lý", "", "Cần mua thêm license", ""]);
  }

  // 7. Sheet VanBan (Có trường Lĩnh Vực & đầy đủ Văn bản Tiền lương)
  let docSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.DOCUMENTS);
  if (docSheet.getLastRow() < 1) {
    docSheet.appendRow(["Số Hiệu", "Tiêu Đề Văn Bản", "Loại Văn Bản", "Cơ Quan Ban Hành", "Ngày Ban Hành", "Người Ký", "Link Tài Liệu", "Trạng Thái", "Lĩnh Vực"]);
    docSheet.appendRow(["01/2026/QĐ-VT", "Quyết định ban hành Quy chế làm việc từ xa (Work From Home)", "Quy chế nội bộ", "Tổng Giám Đốc", "02/01/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
    docSheet.appendRow(["02/2026/QC-LUONG", "Quy chế tiền lương, tiền thưởng và phụ cấp nội bộ năm 2026", "Quy chế lương", "Tổng Giám Đốc", "05/01/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.appendRow(["18/2026/TB-LUONG", "Thông báo chi trả kỳ lương Tháng 10/2026 và quyết toán công tác phí", "Thông báo trả lương", "Phòng Nhân Sự", "01/10/2026", "Nguyễn Thu Hương", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.appendRow(["22/2026/QĐ-TL", "Quyết định điều chỉnh bậc lương và phụ cấp trách nhiệm khối Kỹ thuật", "Quyết định điều chỉnh lương", "Tổng Giám Đốc", "15/09/2026", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.appendRow(["45/2019/QH14", "Bộ luật Lao động năm 2019 số 45/2019/QH14", "Văn bản pháp luật", "Quốc Hội", "20/11/2019", "Chủ tịch Quốc Hội", "demo:sample", "Tài liệu tham khảo", "Chính sách Lao động & Việc làm"]);
    docSheet.appendRow(["DEMO-BHXH", "Tình huống thực hành hồ sơ ốm đau (tài liệu giả lập)", "Văn bản pháp luật", "Bộ phận đào tạo (giả lập)", "01/10/2026", "Người biên soạn demo", "demo:sample", "Tài liệu tham khảo", "Tiền lương & Chế độ BHXH"]);
    docSheet.appendRow(["15/2026/TB-VT", "Thông báo lịch nghỉ Lễ và tổ chức khám sức khỏe định kỳ", "Thông báo", "Phòng Nhân Sự", "15/09/2026", "Nguyễn Thu Hương", "demo:sample", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
  }

  Logger.log("Đã khởi tạo hoàn tất toàn bộ 7 Bảng dữ liệu chuẩn Doanh Nghiệp trên Google Sheets!");
  return { success: true, message: "Đã khởi tạo thành công 7 bảng dữ liệu!" };
}


function rows_(name) { return sheetToObjects_(getSpreadsheet_().getSheetByName(name)); }
function saveRow_(name,fields,rowIndex) {
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
function resetWorkspace_() {
  require_(REQUEST_CONTEXT_&&REQUEST_CONTEXT_.workspace,'Không có không gian demo.');
  setupDatabaseSheets_(getSpreadsheet_(),true);
  const users=rows_(CONFIG.SHEET_NAMES.USERS);
  rows_(CONFIG.SHEET_NAMES.TASKS).forEach(task=>{
    const user=users.find(u=>u['Họ và Tên']===task['Người Phụ Trách']);
    saveRow_(CONFIG.SHEET_NAMES.TASKS,{'Mã NV Phụ Trách':user?user['Mã NV']:''},task._rowIndex);
  });
  ['10/2026','11/2026'].forEach(period=>calculatePayrollInternal_(period));
  return {success:true,message:'Đã khôi phục dữ liệu trong lượt trải nghiệm của bạn.'};
}
