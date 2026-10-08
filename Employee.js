/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Employee.js (Quản lý Nhân sự - CRUD, Phòng ban, Chức vụ)
 * ====================================================================
 */

/**
 * Lấy toàn bộ danh sách nhân viên
 */
function apiGetEmployees() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const users = sheetToObjects(sheet);

    // Sanitize: Tuyệt đối không để lộ cột Mật Khẩu ra bên ngoài API
    const sanitized = users.map(u => ({
      id: u["Mã NV"],
      name: u["Họ và Tên"],
      dept: u["Phòng Ban"],
      title: u["Chức Vụ"],
      role: u["Vai Trò"],
      salary: Number(u["Lương Cơ Bản"]) || 0,
      email: u["Email"],
      status: u["Trạng Thái"] || "Đang làm việc",
      startDate: u["Ngày Vào Làm"] || "",
      phone: u["Số Điện Thoại"] || ""
    }));

    return { success: true, data: sanitized };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Thêm mới hoặc Cập nhật thông tin nhân viên (Sử dụng LockService)
 */
function apiSaveEmployee(emp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, message: "Hệ thống đang bận ghi dữ liệu, vui lòng thử lại sau giây lát!" };
  }

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const data = sheet.getDataRange().getValues();

    let existingRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === emp.id) {
        existingRowIndex = i + 1; // 1-indexed trong Sheets
        break;
      }
    }

    if (existingRowIndex > 0) {
      // Cập nhật thông tin nhân viên hiện có
      // Header: Mã NV | Họ và Tên | Phòng Ban | Chức Vụ | Vai Trò | Lương Cơ Bản | Email | Mật Khẩu | Trạng Thái | Ngày Vào Làm | Số Điện Thoại
      sheet.getRange(existingRowIndex, 2).setValue(emp.name);
      sheet.getRange(existingRowIndex, 3).setValue(emp.dept);
      sheet.getRange(existingRowIndex, 4).setValue(emp.title);
      sheet.getRange(existingRowIndex, 5).setValue(emp.role);
      sheet.getRange(existingRowIndex, 6).setValue(Number(emp.salary) || 0);
      sheet.getRange(existingRowIndex, 7).setValue(emp.email);
      if (emp.status) sheet.getRange(existingRowIndex, 9).setValue(emp.status);
      if (emp.startDate) sheet.getRange(existingRowIndex, 10).setValue(emp.startDate);
      if (emp.phone) sheet.getRange(existingRowIndex, 11).setValue(emp.phone);

      return { success: true, message: `Cập nhật thành công nhân viên ${emp.id} - ${emp.name}!` };
    } else {
      // Thêm nhân viên mới
      const newId = emp.id || ("VT-" + String(data.length).padStart(3, "0"));
      const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");

      sheet.appendRow([
        newId,
        emp.name,
        emp.dept,
        emp.title,
        emp.role || CONFIG.ROLES.EMPLOYEE,
        Number(emp.salary) || 0,
        emp.email,
        "123456", // Mật khẩu mặc định
        emp.status || "Đang làm việc",
        emp.startDate || today,
        emp.phone || ""
      ]);

      // Đồng thời thêm 1 dòng trống trên Sheet ChamCong cho nhân viên mới
      const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
      if (attSheet) {
        const defaultDays = Array(31).fill("X");
        [3, 10, 17, 24].forEach(idx => { defaultDays[idx] = "CN"; });
        [2, 9, 16, 23, 30].forEach(idx => { defaultDays[idx] = "T7"; });
        attSheet.appendRow([newId, emp.name, emp.dept, ...defaultDays, 22, 0, 0]);
      }

      return { success: true, message: `Thêm mới thành công nhân sự [${newId}] ${emp.name}!`, newId: newId };
    }
  } catch(err) {
    return { success: false, message: "Lỗi lưu nhân sự: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Xóa hoặc Khóa nhân viên (Đổi trạng thái sang 'Đã nghỉ việc')
 */
function apiDeleteEmployee(empId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === empId) {
        // Đổi trạng thái sang Đã nghỉ việc thay vì xóa cứng để lưu lịch sử công/lương
        sheet.getRange(i + 1, 9).setValue("Đã nghỉ việc");
        return { success: true, message: `Đã chuyển trạng thái nhân viên ${empId} sang 'Đã nghỉ việc'!` };
      }
    }
    return { success: false, message: "Không tìm thấy nhân viên: " + empId };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}
