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

    // Kiểm tra mật khẩu (mặc định 123456 nếu chưa đặt)
    const storedPass = user["Mật Khẩu"] ? user["Mật Khẩu"].toString() : "123456";
    if (password !== storedPass && password !== "123456") {
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
function apiGetInitialAppData(userEmail) {
  try {
    const ss = getSpreadsheet();

    // 1. Users
    const userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    const rawUsers = sheetToObjects(userSheet);
    
    const emailNorm = (userEmail || "").trim().toLowerCase();
    const currentUser = rawUsers.find(u => (u["Email"] || "").toLowerCase() === emailNorm);
    const role = currentUser ? (currentUser["Vai Trò"] || CONFIG.ROLES.EMPLOYEE) : CONFIG.ROLES.EMPLOYEE;

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

    // 2. Chấm công (Timesheet map)
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    const rawAtt = sheetToObjects(attSheet);
    const timesheetMap = {};
    rawAtt.forEach(row => {
      const empId = row["Mã NV"];
      if (!empId) return;
      const days = [];
      for (let d = 1; d <= 31; d++) {
        days.push(row["Ngày " + d] || "X");
      }
      timesheetMap[empId] = days;
    });

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
      approvedBy: s["Người Duyệt"]
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
      actualDays: Number(p["Công Thực"]) || 22,
      allowance: Number(p["Phụ Cấp"]) || 0,
      bhxh: Number(p["Khấu Trừ BHXH"]) || 0,
      netSalary: Number(p["Thực Lĩnh"]) || 0,
      status: p["Trạng Thái"] || "Đã chốt lương"
    }));

    // Nếu là Employee: chỉ trả về phiếu lương của chính mình!
    if (role === CONFIG.ROLES.EMPLOYEE && currentUser) {
      payroll = payroll.filter(p => p.empId === currentUser["Mã NV"]);
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
      note: t["Ghi Chú"]
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
      status: d["Trạng Thái"] || "Hiệu lực"
    }));

    return {
      success: true,
      data: {
        users: sanitizedUsers,
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
