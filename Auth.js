/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Auth.js (Đăng nhập, Phân quyền & Khởi tạo phiên làm việc)
 * ====================================================================
 */

/**
 * API Đăng nhập tài khoản
 */
function apiLogin(email, password) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const users = sheetToObjects(sheet);

    const emailNorm = (email || "").trim().toLowerCase();
    const user = users.find(u => (u["Email"] || "").toLowerCase() === emailNorm);

    if (!user) {
      return { success: false, message: "Tài khoản email không tồn tại trong hệ thống!" };
    }

    // Kiểm tra mật khẩu (mặc định 123456 nếu tài khoản chưa đặt mật khẩu trong Sheet)
    const storedPass = user["Mật Khẩu"] ? user["Mật Khẩu"].toString() : "123456";
    if (password !== storedPass) {
      return { success: false, message: "Mật khẩu không chính xác!" };
    }

    // Sanitize user object (không trả về cột mật khẩu ra frontend)
    const profile = {
      id: user["Mã NV"],
      name: user["Họ và Tên"],
      dept: user["Phòng Ban"],
      title: user["Chức Vụ"],
      role: user["Vai Trò"] || CONFIG.ROLES.EMPLOYEE,
      email: user["Email"],
      salary: Number(user["Lương Cơ Bản"]) || 0,
      avatar: user["Avatar"] || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces"
    };

    return { success: true, profile: profile };
  } catch(err) {
    return { success: false, message: "Lỗi đăng nhập: " + err.message };
  }
}

/**
 * API Lấy dữ liệu khởi tạo toàn bộ ứng dụng dựa theo quyền người dùng (Initial Payload)
 * Đảm bảo nguyên tắc bảo mật: Nhân viên thường không được xem lương người khác!
 */
function apiGetInitialAppData(userEmail, requestedPeriod) {
  try {
    const ss = getSpreadsheet();

    // 1. Users
    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const rawUsers = sheetToObjects(userSheet);
    
    const emailNorm = (userEmail || "").trim().toLowerCase();
    if (!emailNorm) {
      return { success: false, message: "Yêu cầu xác định danh tính email người dùng!" };
    }
    const currentUser = rawUsers.find(u => (u["Email"] || "").toLowerCase() === emailNorm);
    if (!currentUser) {
      return { success: false, message: "Tài khoản không tồn tại trong hệ thống. Quyền truy cập bị từ chối!" };
    }
    const role = currentUser["Vai Trò"] || CONFIG.ROLES.EMPLOYEE;

    // Danh sách nhân viên trả về: nếu không phải Manager/HR thì ẩn cột Lương
    const sanitizedUsers = rawUsers.map(u => ({
      id: u["Mã NV"],
      name: u["Họ và Tên"],
      dept: u["Phòng Ban"],
      title: u["Chức Vụ"],
      role: u["Vai Trò"],
      email: u["Email"],
      salary: (role === CONFIG.ROLES.HR || role === CONFIG.ROLES.MANAGER || (currentUser && currentUser["Mã NV"] === u["Mã NV"])) ? Number(u["Lương Cơ Bản"]) : 0,
      status: u["Trạng Thái"] || "Đang làm việc",
      startDate: u["Ngày Vào Làm"] || "",
      phone: u["Số Điện Thoại"] || ""
    }));

    // 2. Chấm công (Timesheet map theo kỳ tháng/năm)
    const targetPeriod = (requestedPeriod || "10/2026").trim();
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const timesheetMap = {};
    if (attSheet) {
      ensureAttendancePeriodColumn(attSheet);
      initPeriodAttendanceIfMissing(attSheet, targetPeriod, rawUsers);
      const rawAtt = sheetToObjects(attSheet);
      const periodRows = rawAtt.filter(r => (r["Mã Kỳ Công"] || "10/2026") === targetPeriod);
      periodRows.forEach(row => {
        const empId = row["Mã NV"];
        if (!empId) return;
        const days = [];
        for (let d = 1; d <= 31; d++) {
          days.push(row["Ngày " + d] || "");
        }
        timesheetMap[empId] = days;
      });
    }

    // 3. Đơn nghỉ phép
    const leaveSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LEAVE);
    const rawLeaves = sheetToObjects(leaveSheet);
    const leaves = rawLeaves.map(l => ({
      id: l["Mã Đơn"],
      empId: l["Mã NV"],
      empName: l["Họ và Tên"],
      type: l["Loại Nghỉ"],
      from: l["Từ Ngày"],
      to: l["Đến Ngày"],
      days: Number(l["Số Ngày"]) || 1,
      reason: l["Lý Do"],
      status: l["Trạng Thái"] || "PENDING",
      approvedAt: l["Ngày Duyệt"],
      approvedBy: l["Người Duyệt"]
    }));

    // 4. Hồ sơ ốm đau
    const sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const rawSick = sheetToObjects(sickSheet);
    const sickCases = rawSick.map(s => ({
      id: s["Mã Hồ Sơ"],
      empId: s["Mã NV"],
      empName: s["Họ và Tên"],
      hospital: s["Cơ Sở Y Tế"],
      from: s["Từ Ngày"],
      to: s["Đến Ngày"],
      days: Number(s["Số Ngày"]) || 1,
      docUrl: s["Chứng Từ URL"],
      status: s["Trạng Thái"] || "PENDING",
      approvedAt: s["Ngày Duyệt"],
      approvedBy: s["Người Duyệt"],
      note: s["Ghi Chú"] || ""
    }));

    // 5. Bảng lương
    const payrollSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.PAYROLL);
    const rawPayroll = sheetToObjects(payrollSheet);
    let payroll = rawPayroll.map(p => ({
      period: p["Mã Kỳ Lương"],
      empId: p["Mã NV"],
      empName: p["Họ và Tên"],
      title: p["Chức Vụ"],
      baseSalary: Number(p["Lương Cơ Bản"]) || 0,
      standardDays: Number(p["Công Chuẩn"]) || 22,
      actualDays: (p["Công Thực"] !== undefined && p["Công Thực"] !== "" && !isNaN(Number(p["Công Thực"]))) ? Number(p["Công Thực"]) : 0,
      allowance: Number(p["Phụ Cấp"]) || 0,
      bhxh: Number(p["Khấu Trừ BHXH"]) || 0,
      netSalary: Number(p["Thực Lĩnh"]) || 0,
      status: p["Trạng Thái"] || "Đã chốt lương"
    }));

    // Nếu là Employee: CHỈ trả về phiếu lương của chính mình!
    // Chỉ Manager và HR mới có quyền xem toàn bộ bảng lương công ty
    if (role === CONFIG.ROLES.EMPLOYEE) {
      payroll = payroll.filter(p => p.empId === currentUser["Mã NV"]);
    } else if (role !== CONFIG.ROLES.HR && role !== CONFIG.ROLES.MANAGER) {
      payroll = [];
    }

    // 6. Công việc
    const taskSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.TASKS);
    const rawTasks = sheetToObjects(taskSheet);
    const tasks = rawTasks.map(t => ({
      id: t["Mã CV"],
      title: t["Tiêu Đề Công Việc"],
      type: t["Loại Công Việc"],
      assigner: t["Người Giao"],
      assignee: t["Người Phụ Trách"],
      startDate: t["Ngày Bắt Đầu"],
      deadline: t["Hạn Chót"],
      doneDate: t["Ngày Hoàn Thành"],
      status: t["Trạng Thái"] || "Đang xử lý",
      evaluation: t["Đánh Giá"],
      note: t["Ghi Chú"],
      docId: t["Mã Văn Bản"] || t["Mã VB"] || ""
    }));

    // 7. Văn bản
    const docSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DOCUMENTS);
    const rawDocs = sheetToObjects(docSheet);
    const documents = rawDocs.map(d => ({
      id: d["Số Hiệu"],
      title: d["Tiêu Đề Văn Bản"],
      type: d["Loại Văn Bản"],
      issuer: d["Cơ Quan Ban Hành"],
      date: d["Ngày Ban Hành"],
      signer: d["Người Ký"],
      fileUrl: d["Link Tài Liệu"],
      status: d["Trạng Thái"] || "Hiệu lực",
      category: d["Lĩnh Vực"] || "Quản trị nội bộ"
    }));

    return {
      success: true,
      data: {
        users: sanitizedUsers,
        period: targetPeriod,
        timesheet: timesheetMap,
        leaves: leaves,
        sickCases: sickCases,
        payroll: payroll,
        tasks: tasks,
        documents: documents
      }
    };
  } catch(err) {
    return { success: false, message: "Lỗi tải dữ liệu: " + err.message };
  }
}

/**
 * Xác thực danh tính và phân quyền phía Server (Backend RBAC)
 * Đảm bảo mọi thao tác ghi/duyệt đều được xác minh danh tính và quyền hạn trước khi ghi vào Google Sheets.
 * @param {string} callerEmail - Email hoặc danh tính người gọi
 * @param {string[]} [allowedRoles] - Mảng các vai trò được phép (ví dụ: ['manager', 'hr'])
 * @returns {{ authorized: boolean, user?: Object, role?: string, name?: string, empId?: string, message?: string }}
 */
function verifyUserAuthorization(callerEmail, allowedRoles) {
  try {
    let identifier = (callerEmail || "").toString().trim();

    // Fallback qua Google Session nếu có
    if (!identifier && typeof Session !== "undefined" && Session.getActiveUser) {
      try {
        identifier = (Session.getActiveUser().getEmail() || "").trim();
      } catch (e) {
        // Ignored
      }
    }

    if (!identifier) {
      return {
        authorized: false,
        message: "Từ chối truy cập: Thiếu thông tin email/danh tính người thực hiện (Caller Identity)!"
      };
    }

    const ss = getSpreadsheet();
    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    if (!userSheet) {
      return {
        authorized: false,
        message: "Lỗi hệ thống: Không tìm thấy bảng Users để xác thực quyền!"
      };
    }

    const users = sheetToObjects(userSheet);
    const idLower = identifier.toLowerCase();
    const user = users.find(u => 
      (u["Email"] || "").toString().trim().toLowerCase() === idLower ||
      (u["Họ và Tên"] || "").toString().trim().toLowerCase() === idLower
    );

    if (!user) {
      return {
        authorized: false,
        message: `Từ chối truy cập: Tài khoản [${identifier}] không tồn tại trong hệ thống doanh nghiệp!`
      };
    }

    const status = (user["Trạng Thái"] || "").toString().trim();
    if (status === "Đã nghỉ việc") {
      return {
        authorized: false,
        message: `Từ chối truy cập: Tài khoản [${user["Họ và Tên"] || identifier}] đã nghỉ việc và bị vô hiệu hóa!`
      };
    }

    const userRole = (user["Vai Trò"] || CONFIG.ROLES.EMPLOYEE).toString().trim().toLowerCase();

    // Nếu yêu cầu vai trò cụ thể
    if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      const normalizedAllowed = allowedRoles.map(r => r.toString().trim().toLowerCase());
      if (!normalizedAllowed.includes(userRole)) {
        return {
          authorized: false,
          user: user,
          role: userRole,
          name: user["Họ và Tên"],
          empId: user["Mã NV"],
          message: `Từ chối truy cập: Bạn không có quyền thực hiện thao tác này! Yêu cầu vai trò: [${allowedRoles.join(", ")}], vai trò của bạn: [${userRole}].`
        };
      }
    }

    return {
      authorized: true,
      user: user,
      role: userRole,
      name: user["Họ và Tên"] || identifier,
      empId: user["Mã NV"] || ""
    };
  } catch (err) {
    return {
      authorized: false,
      message: "Lỗi kiểm tra quyền hạn hệ thống: " + err.message
    };
  }
}

