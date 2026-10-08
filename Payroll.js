/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Payroll.js (Quản lý Tiền lương & Bảo mật Phiếu lương)
 * ====================================================================
 */

/**
 * Lấy dữ liệu Bảng lương có kiểm tra quyền bảo mật nghiêm ngặt (Backend RBAC)
 * - Nhân viên: CHỈ ĐƯỢC XEM BẢN GHI CỦA CHÍNH MÌNH
 * - HR / Quản lý: Được xem toàn bộ bảng lương công ty
 */
function apiGetPayrollData(userEmail) {
  try {
    const auth = verifyUserAuthorization(userEmail);
    if (!auth.authorized) {
      return { success: false, message: auth.message };
    }

    const currentUser = auth.user;
    const role = auth.role;

    const ss = getSpreadsheet();
    const payrollSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.PAYROLL);
    const rawPayroll = sheetToObjects(payrollSheet);

    let payroll = rawPayroll.map(p => ({
      period: p["Mã Kỳ Lương"],
      empId: p["Mã NV"],
      empName: p["Họ và Tên"],
      title: p["Chức Vụ"],
      baseSalary: Number(p["Lương Cơ Bản"]) || 0,
      standardDays: Number(p["Công Chuẩn"]) || CONFIG.DEFAULT_WORKING_DAYS,
      actualDays: (p["Công Thực"] !== undefined && p["Công Thực"] !== "" && !isNaN(Number(p["Công Thực"]))) ? Number(p["Công Thực"]) : 0,
      allowance: Number(p["Phụ Cấp"]) || 0,
      bhxh: Number(p["Khấu Trừ BHXH"]) || 0,
      netSalary: Number(p["Thực Lĩnh"]) || 0,
      status: p["Trạng Thái"] || "Đã chốt lương"
    }));

    if (role === CONFIG.ROLES.EMPLOYEE) {
      payroll = payroll.filter(p => p.empId === currentUser["Mã NV"]);
    } else if (role !== CONFIG.ROLES.HR && role !== CONFIG.ROLES.MANAGER) {
      payroll = [];
    }

    return { success: true, data: payroll, role: role };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Tự động tính toán và kết xuất Bảng lương từ bảng Chấm công và Lương cơ bản (Kiểm tra quyền Quản lý / HR)
 * @param {string} [period] - Kỳ lương (ví dụ: '10/2026')
 * @param {string} [callerEmail] - Email người thực hiện thao tác
 */
function apiCalculateMonthlyPayroll(period, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.MANAGER, CONFIG.ROLES.HR]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const users = sheetToObjects(userSheet);

    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const attList = sheetToObjects(attSheet);

    const payrollSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.PAYROLL);
    // Xóa dữ liệu cũ của kỳ lương này nếu đã tồn tại để cập nhật mới
    const pData = payrollSheet.getDataRange().getValues();
    const periodStr = period || "10/2026";

    // Duyệt qua từng nhân viên đang làm việc
    users.filter(u => u["Trạng Thái"] !== "Đã nghỉ việc").forEach(u => {
      const empId = u["Mã NV"];
      const attRow = attList.find(a => a["Mã NV"] === empId);
      
      const standardDays = CONFIG.DEFAULT_WORKING_DAYS;
      // Sửa lỗi P0: Ngày công bằng 0 phải giữ nguyên 0, không tự động fallback về 22
      const actualDays = (attRow && attRow["Tổng Công"] !== undefined && attRow["Tổng Công"] !== "" && !isNaN(Number(attRow["Tổng Công"])))
        ? Number(attRow["Tổng Công"])
        : 0;

      const baseSalary = Number(u["Lương Cơ Bản"]) || 0;
      const salaryPerDay = standardDays > 0 ? (baseSalary / standardDays) : 0;
      const allowance = CONFIG.STANDARD_ALLOWANCE;
      const gross = Math.round((salaryPerDay * actualDays) + allowance);
      const bhxh = Math.round(baseSalary * CONFIG.BHXH_RATE);
      const net = Math.max(0, gross - bhxh);

      let foundRow = -1;
      for (let r = 1; r < pData.length; r++) {
        if (pData[r][0] === periodStr && pData[r][1] === empId) {
          foundRow = r + 1;
          break;
        }
      }

      if (foundRow > 0) {
        payrollSheet.getRange(foundRow, 5).setValue(baseSalary);
        payrollSheet.getRange(foundRow, 6).setValue(standardDays);
        payrollSheet.getRange(foundRow, 7).setValue(actualDays);
        payrollSheet.getRange(foundRow, 8).setValue(allowance);
        payrollSheet.getRange(foundRow, 9).setValue(bhxh);
        payrollSheet.getRange(foundRow, 10).setValue(net);
        payrollSheet.getRange(foundRow, 11).setValue("Đã chốt lương");
      } else {
        payrollSheet.appendRow([
          periodStr,
          empId,
          u["Họ và Tên"],
          u["Chức Vụ"],
          baseSalary,
          standardDays,
          actualDays,
          allowance,
          bhxh,
          net,
          "Đã chốt lương"
        ]);
      }
    });

    return { success: true, message: `Đã tính toán và kết xuất Bảng lương kỳ [${periodStr}] thành công!` };
  } catch(err) {
    return { success: false, message: "Lỗi tính bảng lương: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
