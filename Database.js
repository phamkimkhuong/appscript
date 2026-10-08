/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Database.js (Khởi tạo và quản lý kết nối Google Sheets)
 * ====================================================================
 */

/**
 * Mở Spreadsheet an toàn với try/catch và Script Properties
 */
function getSpreadsheet() {
  const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ssId = propId || CONFIG.DEFAULT_SPREADSHEET_ID;
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (err) {
    throw new Error("Không thể mở Google Sheet với ID [" + ssId + "]. Vui lòng kiểm tra quyền chia sẻ!");
  }
}

/**
 * Chuyển đổi dữ liệu 1 Sheet thành mảng Object dựa vào dòng Header
 */
function sheetToObjects(sheet) {
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
function formatDateVN(date) {
  if (!date) return "";
  const d = new Date(date);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm");
}

/**
 * Khởi tạo trọn vẹn cấu trúc 7 Bảng (Sheets) chuẩn Doanh Nghiệp
 * Chạy hàm này để tự động thiết lập toàn bộ Database
 */
function setupDatabaseSheets(customSS) {
  const ss = customSS || getSpreadsheet();

  // 1. Sheet Users (Nhân sự)
  let userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS) || ss.insertSheet(CONFIG.SHEET_NAMES.USERS);
  if (userSheet.getLastRow() < 1) {
    userSheet.appendRow(["Mã NV", "Họ và Tên", "Phòng Ban", "Chức Vụ", "Vai Trò", "Lương Cơ Bản", "Email", "Mật Khẩu", "Trạng Thái", "Ngày Vào Làm", "Số Điện Thoại"]);
    userSheet.appendRow(["VT-001", "Lê Thị Phương", "Kỹ thuật", "Chuyên viên Lập trình", "employee", 18000000, "phuong.le@vintech.vn", "123456", "Đang làm việc", "15/01/2024", "0901234567"]);
    userSheet.appendRow(["VT-002", "Trần Minh Trí", "Kỹ thuật", "Trưởng phòng Kỹ thuật", "manager", 28000000, "tri.tran@vintech.vn", "123456", "Đang làm việc", "01/03/2023", "0912345678"]);
    userSheet.appendRow(["VT-003", "Nguyễn Thu Hương", "Kế toán", "Kế toán trưởng / HR Lead", "hr", 24000000, "huong.nguyen@vintech.vn", "123456", "Đang làm việc", "10/05/2023", "0923456789"]);
    userSheet.appendRow(["VT-004", "Hoàng Khương Duy", "Kỹ thuật", "Kỹ sư Hệ thống", "employee", 16500000, "duy.hoang@vintech.vn", "123456", "Đang làm việc", "20/08/2024", "0934567890"]);
    userSheet.appendRow(["VT-005", "Đinh Thị Huyền Trang", "Kinh doanh", "Chuyên viên Kinh doanh", "employee", 15000000, "trang.dinh@vintech.vn", "123456", "Đang làm việc", "05/11/2024", "0945678901"]);
  }

  // 2. Sheet ChamCong (Ma trận chấm công tháng)
  let attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE) || ss.insertSheet(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (attSheet.getLastRow() < 1) {
    const daysHeader = [];
    for (let d = 1; d <= 31; d++) daysHeader.push("Ngày " + d);
    attSheet.appendRow(["Mã NV", "Họ và Tên", "Phòng Ban", ...daysHeader, "Tổng Công", "Tổng Phép", "Tổng Ốm"]);

    // Sample rows cho 5 nhân viên (Tháng 10/2026: 31 ngày, 4 CN, 5 T7 nghỉ tuần => 22 ngày làm việc chuẩn "X")
    const defaultDays = Array(31).fill("X");
    [3, 10, 17, 24].forEach(idx => { defaultDays[idx] = "CN"; });
    [2, 9, 16, 23, 30].forEach(idx => { defaultDays[idx] = "T7"; });

    attSheet.appendRow(["VT-001", "Lê Thị Phương", "Kỹ thuật", ...defaultDays, 22, 0, 0]);
    attSheet.appendRow(["VT-002", "Trần Minh Trí", "Kỹ thuật", ...defaultDays, 22, 0, 0]);
    attSheet.appendRow(["VT-003", "Nguyễn Thu Hương", "Kế toán", ...defaultDays, 22, 0, 0]);
    attSheet.appendRow(["VT-004", "Hoàng Khương Duy", "Kỹ thuật", ...defaultDays, 22, 0, 0]);

    // VT-005 có 2 ngày ốm (ngày 12 & 13)
    const days5 = [...defaultDays];
    days5[11] = "O"; days5[12] = "O";
    attSheet.appendRow(["VT-005", "Đinh Thị Huyền Trang", "Kinh doanh", ...days5, 20, 0, 2]);
  }

  // 3. Sheet DonNghiPhep
  let leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE) || ss.insertSheet(CONFIG.SHEET_NAMES.LEAVE);
  if (leaveSheet.getLastRow() < 1) {
    leaveSheet.appendRow(["Mã Đơn", "Mã NV", "Họ và Tên", "Loại Nghỉ", "Từ Ngày", "Đến Ngày", "Số Ngày", "Lý Do", "Trạng Thái", "Ngày Duyệt", "Người Duyệt"]);
    leaveSheet.appendRow(["LV-2610-01", "VT-001", "Lê Thị Phương", "Nghỉ phép năm", "2026-10-10", "2026-10-11", 2, "Việc gia đình ở quê", "PENDING", "", ""]);
  }

  // 4. Sheet HoSoOmDau
  let sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK) || ss.insertSheet(CONFIG.SHEET_NAMES.SICK);
  if (sickSheet.getLastRow() < 1) {
    sickSheet.appendRow(["Mã Hồ Sơ", "Mã NV", "Họ và Tên", "Cơ Sở Y Tế", "Từ Ngày", "Đến Ngày", "Số Ngày", "Chứng Từ URL", "Trạng Thái", "Ngày Duyệt", "Người Duyệt"]);
    sickSheet.appendRow(["SC-2610-01", "VT-005", "Đinh Thị Huyền Trang", "Bệnh viện Bạch Mai", "2026-10-12", "2026-10-13", 2, "https://drive.google.com/sample_cert.pdf", "PENDING", "", ""]);
  }

  // 5. Sheet BangLuong
  let payrollSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.PAYROLL) || ss.insertSheet(CONFIG.SHEET_NAMES.PAYROLL);
  if (payrollSheet.getLastRow() < 1) {
    payrollSheet.appendRow(["Mã Kỳ Lương", "Mã NV", "Họ và Tên", "Chức Vụ", "Lương Cơ Bản", "Công Chuẩn", "Công Thực", "Phụ Cấp", "Khấu Trừ BHXH", "Thực Lĩnh", "Trạng Thái"]);
    payrollSheet.appendRow(["10/2026", "VT-001", "Lê Thị Phương", "Chuyên viên Lập trình", 18000000, 22, 22, 1500000, 1890000, 17610000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-002", "Trần Minh Trí", "Trưởng phòng Kỹ thuật", 28000000, 22, 22, 1500000, 2940000, 26560000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-003", "Nguyễn Thu Hương", "Kế toán trưởng / HR Lead", 24000000, 22, 22, 1500000, 2520000, 22980000, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-004", "Hoàng Khương Duy", "Kỹ sư Hệ thống", 16500000, 22, 22, 1500000, 1732500, 16267500, "Đã chốt lương"]);
    payrollSheet.appendRow(["10/2026", "VT-005", "Đinh Thị Huyền Trang", "Chuyên viên Kinh doanh", 15000000, 22, 20, 1500000, 1575000, 13561364, "Đã chốt lương"]);
  }

  // 6. Sheet CongViec (Nhiệm vụ & Tasks)
  let taskSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TASKS) || ss.insertSheet(CONFIG.SHEET_NAMES.TASKS);
  if (taskSheet.getLastRow() < 1) {
    taskSheet.appendRow(["Mã CV", "Tiêu Đề Công Việc", "Loại Công Việc", "Người Giao", "Người Phụ Trách", "Ngày Bắt Đầu", "Hạn Chót", "Ngày Hoàn Thành", "Trạng Thái", "Đánh Giá", "Ghi Chú"]);
    taskSheet.appendRow(["CV-101", "Rà soát kế hoạch bảo mật dữ liệu quý IV", "Dự án", "Trần Minh Trí", "Lê Thị Phương", "01/10/2026", "15/10/2026", "", "Đang xử lý", "", "Ưu tiên cao"]);
    taskSheet.appendRow(["CV-102", "Quyết toán thuế TNCN và tạm ứng lương", "Hành chính", "Ban Giám Đốc", "Nguyễn Thu Hương", "05/10/2026", "20/10/2026", "", "Đang xử lý", "", "Đúng kỳ hạn"]);
    taskSheet.appendRow(["CV-103", "Triển khai hạ tầng máy chủ cho chi nhánh", "Kỹ thuật", "Trần Minh Trí", "Hoàng Khương Duy", "02/10/2026", "18/10/2026", "", "Đang xử lý", "", "Cần mua thêm license"]);
  }

  // 7. Sheet VanBan (Văn bản nội bộ & Pháp luật)
  let docSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS) || ss.insertSheet(CONFIG.SHEET_NAMES.DOCUMENTS);
  if (docSheet.getLastRow() < 1) {
    docSheet.appendRow(["Số Hiệu", "Tiêu Đề Văn Bản", "Loại Văn Bản", "Cơ Quan Ban Hành", "Ngày Ban Hành", "Người Ký", "Link Tài Liệu", "Trạng Thái"]);
    docSheet.appendRow(["01/2026/QĐ-VT", "Quyết định ban hành Quy chế làm việc từ xa (Work From Home)", "Quy chế nội bộ", "Tổng Giám Đốc", "02/01/2026", "Nguyễn Văn An", "https://drive.google.com/sample_doc1.pdf", "Hiệu lực"]);
    docSheet.appendRow(["45/2019/QH14", "Bộ luật Lao động năm 2019 số 45/2019/QH14", "Văn bản pháp luật", "Quốc Hội", "20/11/2019", "Chủ tịch Quốc Hội", "https://thuvienphapluat.vn/sample", "Hiệu lực"]);
    docSheet.appendRow(["15/2026/TB-VT", "Thông báo lịch nghỉ Lễ và tổ chức khám sức khỏe định kỳ", "Thông báo", "Phòng Nhân Sự", "15/09/2026", "Nguyễn Thu Hương", "https://drive.google.com/sample_doc2.pdf", "Hiệu lực"]);
  }

  Logger.log("Đã khởi tạo hoàn tất toàn bộ 7 Bảng dữ liệu chuẩn Doanh Nghiệp trên Google Sheets!");
  return { success: true, message: "Đã khởi tạo thành công 7 bảng dữ liệu!" };
}

/**
 * TỰ ĐỘNG TẠO 1 FILE GOOGLE SHEET MỚI TINH TRÊN DRIVE CỦA BẠN
 * và tự động sinh đủ 7 sheet chuẩn cho VinTech Solutions
 */
function createNewDatabaseSheet() {
  const newSS = SpreadsheetApp.create("VinTech Solutions - Enterprise HRM & E-Office Database");
  const newId = newSS.getId();
  const newUrl = newSS.getUrl();

  // Khởi tạo 7 bảng mẫu vào Sheet mới tạo
  setupDatabaseSheets(newSS);

  // Lưu ID này vào Script Properties để toàn bộ Web App tự động chuyển sang dùng Sheet mới
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", newId);

  Logger.log("=================================================================");
  Logger.log(" ĐÃ TẠO THÀNH CÔNG GOOGLE SHEET MỚI CHO VINTECH SOLUTIONS!");
  Logger.log(" Tên file: VinTech Solutions - Enterprise HRM & E-Office Database");
  Logger.log(" Spreadsheet ID: " + newId);
  Logger.log(" Đường link xem trực tiếp: " + newUrl);
  Logger.log("=================================================================");

  return { success: true, id: newId, url: newUrl };
}
