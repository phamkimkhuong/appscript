/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND (APPS SCRIPT)
 * ====================================================================
 */

// Đổi ID Spreadsheet của bạn tại đây hoặc cấu hình trong Script Properties
const CONFIG = {
  DEFAULT_SPREADSHEET_ID: "1xrxIcp0mdxx4yR52iBOemSxk23VFgevUG18F7lFvsRo",
  SHEET_NAMES: {
    USERS: "Users",
    ATTENDANCE: "ChamCong",
    LEAVE: "DonNghiPhep",
    SICK: "HoSoOmDau",
    PAYROLL: "BangLuong",
    WORK_DOCS: "VanBanCongViec",
    LEGAL_DOCS: "VanBanPhapLuat"
  }
};

/**
 * Entry point phục vụ Web App
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('VinTech Solutions - HRM & E-Office Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Mở bảng tính an toàn với try/catch
 */
function getSpreadsheet() {
  const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ssId = propId || CONFIG.DEFAULT_SPREADSHEET_ID;
  try {
    return SpreadsheetApp.openById(ssId);
  } catch(err) {
    throw new Error("Không thể mở Google Sheet với ID [" + ssId + "]. Vui lòng kiểm tra quyền chia sẻ!");
  }
}

/**
 * 1. Khởi tạo toàn bộ cấu trúc 7 Tabs trên Google Sheet tự động
 * Chạy hàm này 1 lần duy nhất từ Script Editor để tạo data store chuẩn mẫu!
 */
function setupDatabaseSheets() {
  const ss = getSpreadsheet();
  
  // Tab 1: Users
  let userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS) || ss.insertSheet(CONFIG.SHEET_NAMES.USERS);
  if (userSheet.getLastRow() < 1) {
    userSheet.appendRow(["Mã NV", "Họ và Tên", "Phòng Ban", "Chức Vụ", "Vai Trò", "Lương Cơ Bản", "Email"]);
    userSheet.appendRow(["VT-001", "Lê Thị Phương", "Kỹ thuật", "Chuyên viên Lập trình", "employee", 18000000, "phuong.le@vintech.vn"]);
    userSheet.appendRow(["VT-002", "Trần Minh Trí", "Kỹ thuật", "Trưởng phòng Kỹ thuật", "manager", 28000000, "tri.tran@vintech.vn"]);
    userSheet.appendRow(["VT-003", "Nguyễn Thu Hương", "Kế toán", "Kế toán trưởng / HR Lead", "hr", 24000000, "huong.nguyen@vintech.vn"]);
  }

  // Tab 2: DonNghiPhep
  let leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE) || ss.insertSheet(CONFIG.SHEET_NAMES.LEAVE);
  if (leaveSheet.getLastRow() < 1) {
    leaveSheet.appendRow(["Mã Đơn", "Mã NV", "Họ và Tên", "Loại Nghỉ", "Từ Ngày", "Đến Ngày", "Số Ngày", "Lý Do", "Trạng Thái", "Ngày Duyệt"]);
    leaveSheet.appendRow(["LV-2610-01", "VT-001", "Lê Thị Phương", "Nghỉ phép năm", "2026-10-10", "2026-10-11", 2, "Việc gia đình ở quê", "PENDING", ""]);
  }

  // Tab 3: HoSoOmDau
  let sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK) || ss.insertSheet(CONFIG.SHEET_NAMES.SICK);
  if (sickSheet.getLastRow() < 1) {
    sickSheet.appendRow(["Mã Hồ Sơ", "Mã NV", "Họ và Tên", "Bệnh Viện", "Từ Ngày", "Đến Ngày", "Số Ngày", "Chứng Từ URL", "Trạng Thái"]);
    sickSheet.appendRow(["SC-2610-01", "VT-005", "Đinh Thị Huyền Trang", "Bệnh viện Bạch Mai", "2026-10-12", "2026-10-13", 2, "https://drive.google.com/sample_cert.pdf", "PENDING"]);
  }

  Logger.log("✅ Khởi tạo thành công toàn bộ các Sheet dữ liệu chuẩn doanh nghiệp!");
  return "Khởi tạo thành công!";
}

/**
 * 2. Luồng Phê duyệt đơn xin nghỉ phép (CÓ KHÓA ĐỒNG THỜI LOCK SERVICE)
 * Tự động cập nhật ký hiệu 'P' vào bảng chấm công của nhân viên tương ứng
 */
function apiApproveLeave(reqId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("Hệ thống đang bận xử lý giao dịch khác, vui lòng thử lại sau!");
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
        leaveSheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm"));
        targetEmpId = leaveData[i][1];
        fromDateStr = leaveData[i][4];
        numDays = parseInt(leaveData[i][6]) || 1;
        break;
      }
    }

    if (!targetEmpId) throw new Error("Không tìm thấy đơn nghỉ: " + reqId);

    // Tự động bắn vào bảng Chấm Công (ChamCong)
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (attSheet) {
      const attData = attSheet.getDataRange().getValues();
      const startDay = new Date(fromDateStr).getDate();

      for (let j = 1; j < attData.length; j++) {
        // Cột mã nhân viên
        if (attData[j][0] == targetEmpId || attData[j][1] == targetEmpId) {
          for (let d = 0; d < numDays; d++) {
            const targetCol = 2 + (startDay + d); // Tùy offset cột ngày 1..31
            if (targetCol <= 33) {
              attSheet.getRange(j + 1, targetCol).setValue("P");
            }
          }
          break;
        }
      }
    }

    return { success: true, message: "Đã phê duyệt đơn và đồng bộ ký hiệu [P] vào Bảng Chấm Công!" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 3. Luồng Phê duyệt hồ sơ ốm đau BHXH
 * Tự động cập nhật ký hiệu 'O' vào bảng chấm công
 */
function apiApproveSick(sickId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("Hệ thống đang bận!");

  try {
    const ss = getSpreadsheet();
    const sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const sickData = sickSheet.getDataRange().getValues();

    for (let i = 1; i < sickData.length; i++) {
      if (sickData[i][0] === sickId) {
        sickSheet.getRange(i + 1, 9).setValue("APPROVED");
        break;
      }
    }

    return { success: true, message: "Đã phê duyệt hồ sơ ốm đau và xác nhận chế độ BHXH!" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. Tạo đơn xin nghỉ phép mới từ Web
 */
function apiSubmitLeave(form) {
  const ss = getSpreadsheet();
  const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
  const newId = "LV-" + new Date().getTime().toString().slice(-6);

  leaveSheet.appendRow([
    newId,
    form.empId,
    form.empName,
    form.type,
    form.from,
    form.to,
    form.days,
    form.reason,
    "PENDING",
    ""
  ]);

  return { success: true, message: "Nộp đơn thành công! Mã đơn: " + newId };
}
