/**
 * ====================================================================
 * WANZHONG CLEAN TECHNOLOGY (VIETNAM) - ENTERPRISE HRM & E-OFFICE
 * ====================================================================
 * FILE: Server.js
 * VAI TRÒ: BỘ LÕI MÁY CHỦ & CỔNG ĐIỀU PHỐI TRUNG TÂM (CORE BACKEND ENGINE)
 * --------------------------------------------------------------------
 * MÔ TẢ CHỨC NĂNG:
 * 1. Web App Entry Points:
 *    - doGet(e), doPost(e): Khởi tạo giao diện chính từ template Index.html.
 *    - include(filename): Nhúng các file thành phần (Styles, Modals, Scripts).
 *
 * 2. Cấu hình hệ thống (CONFIG):
 *    - Quản lý ID Google Sheet trung tâm (kết nối trực tiếp hoặc qua Script Properties).
 *    - Định nghĩa cấu trúc 7 Bảng dữ liệu chuẩn: Users, ChamCong, DonNghiPhep,
 *      HoSoOmDau, BangLuong, CongViec, VanBan.
 *    - Thiết lập ngày công chuẩn (22 ngày), tỷ lệ BHXH (10.5%), múi giờ GMT+7.
 *
 * 3. Tầng kết nối Cơ sở dữ liệu (Database Layer):
 *    - getSpreadsheet_(), sheetToObjects_(), matrixToObjects_(): ORM đọc Sheet sang JSON.
 *    - saveRow_(), deleteRow_(): Ghi đè, cập nhật hoặc xóa dòng với cơ chế chống lỗi công thức.
 *    - demoSeedTables_(), setupDatabaseSheets_(), resetDatabase_(): Khởi tạo và tự động
 *      phục hồi toàn bộ 7 bảng dữ liệu chuẩn Doanh nghiệp Wanzhong khi cần demo.
 *
 * 4. Xác thực & Quản lý Phiên (Authentication & Session):
 *    - apiLogin(email, password): Xác thực tài khoản nhân sự từ bảng Users, cấp Token UUID.
 *    - apiLogout(token): Hủy Token khỏi CacheService an toàn.
 *    - verifyUserAuthorization_(): Kiểm tra quyền thực thi theo vai trò (manager, hr, employee).
 *
 * 5. Cổng điều phối API trung tâm (Central RPC Router):
 *    - apiRequest(token, action, args): Điểm đón nhận duy nhất cho toàn bộ yêu cầu từ Client.
 *    - Tự động kiểm tra Token hợp lệ, điều phối gọi hàm nghiệp vụ trong HRM.js và EOffice.js.
 *    - Quản lý khóa ghi đồng thời (LockService) để bảo vệ toàn vẹn dữ liệu Google Sheet.
 * ====================================================================
 */

/**
 * Entry point phục vụ Web App trên Google Apps Script
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Wanzhong Clean Technology - Cổng Quản Trị Nhân Sự & Văn Phòng Số Doanh Nghiệp")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

/**
 * Entry point hỗ trợ request POST
 */
function doPost(e) {
  return doGet(e);
}

/**
 * Helper để nhúng các partial HTML vào template chính (nếu dùng)
 */
function include(filename) {
  if (!['Styles', 'Modals', 'Scripts'].includes(filename)) throw new Error('Partial không hợp lệ.');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Cấu hình chung và các hằng số hệ thống
 */
const CONFIG = {
  DEFAULT_SPREADSHEET_ID: "1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA",
  SHEET_NAMES: {
    USERS: "Users",
    ATTENDANCE: "ChamCong",
    LEAVE: "DonNghiPhep",
    SICK: "HoSoOmDau",
    PAYROLL: "BangLuong",
    TASKS: "CongViec",
    DOCUMENTS: "VanBan"
  },
  ROLES: {
    EMPLOYEE: "employee",
    MANAGER: "manager",
    HR: "hr"
  },
  DEFAULT_WORKING_DAYS: 22,
  STANDARD_ALLOWANCE: 1500000,
  BHXH_RATE: 0.105, // Demo 10,5%
  TIMEZONE: "GMT+7"
};

/** Shared domain rules. Trailing underscores keep helpers private to Apps Script. */
function require_(condition, message) {
  if (!condition) throw new Error(message);
}

function safeText_(value, max) {
  const text = String(value == null ? '' : value).trim();
  require_(text.length <= (max || 1000), 'Nội dung quá dài.');
  return text;
}

function uniqueId_(prefix) { return prefix + '-' + Utilities.getUuid(); }

function roleFromTitle_(title) {
  const t = String(title || '').trim();
  if (['Quản lý', 'Tổng Giám Đốc', 'Phó Tổng Giám Đốc', 'Giám Đốc', 'Quản đốc xưởng', 'Quản đốc', 'Trưởng phòng'].includes(t)) return 'manager';
  if (['Kế toán', 'Kế toán trưởng', 'Kế toán viên', 'Kế toán tổng hợp'].includes(t)) return 'hr';
  if (['Nhân viên', 'Kỹ sư kỹ thuật', 'Kỹ sư', 'Nhân viên kinh doanh', 'Nhân viên hành chính', 'Công nhân sản xuất', 'Công nhân', 'Tổ trưởng sản xuất'].includes(t)) return 'employee';
  if (/giám đốc|quản lý|quản đốc|trưởng phòng/i.test(t)) return 'manager';
  if (/kế toán/i.test(t)) return 'hr';
  return 'employee';
}

function titleFromRole_(role) {
  if (role === 'manager') return 'Quản lý';
  if (role === 'hr') return 'Kế toán';
  if (role === 'employee') return 'Nhân viên';
  return 'Nhân viên';
}

function period_(value) {
  const match = /^(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(value || ''));
  require_(match, 'Kỳ phải có dạng MM/YYYY (2000–2099).');
  return String(value);
}

function date_(value) {
  if (value instanceof Date) value = Utilities.formatDate(value, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  let str = String(value || '');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) str = str.split('/').reverse().join('-');
  require_(/^20\d{2}-\d{2}-\d{2}$/.test(str), 'Ngày không hợp lệ.');
  const parts = str.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  require_(date.toISOString().slice(0, 10) === str, 'Ngày không tồn tại.');
  return date;
}

function workingRange_(from, to) {
  const first = date_(from), last = date_(to);
  const span = (last.getTime() - first.getTime()) / 86400000;
  require_(span >= 0 && span <= 365, 'Ngày kết thúc phải sau ngày bắt đầu; khoảng nghỉ tối đa 366 ngày.');
  const allDates = [];
  const weekdays = [];
  for (let i = 0; i <= span; i++) {
    const date = new Date(first.getTime() + i * 86400000);
    const iso = date.toISOString().slice(0, 10);
    allDates.push(iso);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) weekdays.push(iso);
  }
  const dates = weekdays.length > 0 ? weekdays : allDates;
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), days: dates.length, dates: dates };
}

function monthDays_(period) {
  period_(period);
  const [month, year] = period.split('/').map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array(31).fill('');
  let standardWorkingDays = 0;
  for (let d = 1; d <= count; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    days[d - 1] = dow === 0 ? 'CN' : dow === 6 ? 'T7' : 'X';
    if (days[d - 1] === 'X') standardWorkingDays++;
  }
  return { days: days, daysInMonth: count, standardWorkingDays: standardWorkingDays };
}

function businessToday_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function attendanceCutoff_(period, today) {
  period_(period); today = today || businessToday_();
  const month = period.slice(3) + '-' + period.slice(0, 2);
  return month < today.slice(0, 7) ? monthDays_(period).daysInMonth : month > today.slice(0, 7) ? 0 : Number(today.slice(8, 10));
}

function emptyAttendanceDays_(period) {
  return monthDays_(period).days.map(symbol => symbol === 'X' ? '' : symbol);
}

function actualAttendanceDays_(period, days, today) {
  const cutoff = attendanceCutoff_(period, today), calendar = emptyAttendanceDays_(period);
  return calendar.map((symbol, index) => index < cutoff ? (days[index] || '') : symbol);
}

function attendanceTotals_(days) {
  return {
    actualDays: days.filter(x => x === 'X').length,
    paidLeaveDays: days.filter(x => x === 'P').length,
    sickDays: days.filter(x => x === 'O').length,
    unpaidDays: days.filter(x => x === 'K').length,
    otDays: days.filter(x => x === 'OT').length
  };
}

const PAYROLL_FIELDS_ = { period: 'Mã Kỳ Lương', empId: 'Mã NV', empName: 'Họ và Tên', title: 'Chức Vụ', baseSalary: 'Lương Cơ Bản', standardDays: 'Công Chuẩn', actualDays: 'Công Thực', allowance: 'Phụ Cấp', bhxh: 'Khấu Trừ BHXH', netSalary: 'Thực Lĩnh', status: 'Trạng Thái', otDays: 'Ngày OT', otPay: 'Tiền OT', paidLeaveDays: 'Phép Hưởng Lương', unpaidDays: 'Nghỉ Không Lương', sickDays: 'Ngày Ốm', salaryByDays: 'Lương Theo Công' };

function currentBusinessPeriod_(now) {
  return Utilities.formatDate(now || new Date(), CONFIG.TIMEZONE, 'MM/yyyy');
}
function periodOrderKey_(period) {
  const p = String(period || '');
  return p.slice(3) + p.slice(0, 2);
}
function isFuturePayrollPeriod_(period, current) {
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(String(period))) return true;
  return periodOrderKey_(period) > periodOrderKey_(current || currentBusinessPeriod_());
}
function isCompletedPayrollPeriod_(period, current) {
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(String(period))) return false;
  return !isFuturePayrollPeriod_(period, current);
}
function previousPayrollPeriods_(now, count) {
  const [month, year] = currentBusinessPeriod_(now).split('/').map(Number);
  return Array.from({ length: count || 12 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 2 - i, 1));
    return String(date.getUTCMonth() + 1).padStart(2, '0') + '/' + date.getUTCFullYear();
  });
}
function availablePayrollPeriods_(now, count) {
  const [month, year] = currentBusinessPeriod_(now).split('/').map(Number);
  return Array.from({ length: count || 12 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    return String(date.getUTCMonth() + 1).padStart(2, '0') + '/' + date.getUTCFullYear();
  });
}

function rowDays_(row) { return Array.from({ length: 31 }, (_, i) => row['Ngày ' + (i + 1)] || ''); }

function payrollValue_(user, period, days) {
  const totals = attendanceTotals_(actualAttendanceDays_(period, days));
  const standardDays = monthDays_(period).standardWorkingDays;
  const baseSalary = Number(user['Lương Cơ Bản']) || 0;
  const salaryByDays = Math.round(baseSalary / standardDays * (totals.actualDays + totals.paidLeaveDays));
  const otPay = Math.round(baseSalary / standardDays * 1.5 * totals.otDays);
  const allowance = CONFIG.STANDARD_ALLOWANCE;
  const bhxh = Math.round(baseSalary * CONFIG.BHXH_RATE);
  return Object.assign({
    period: period, empId: user['Mã NV'], empName: user['Họ và Tên'],
    title: user['Chức Vụ'], baseSalary: baseSalary, standardDays: standardDays,
    salaryByDays: salaryByDays, otPay: otPay, allowance: allowance, bhxh: bhxh,
    netSalary: Math.max(0, salaryByDays + otPay + allowance - bhxh), status: period === businessToday_().slice(5, 7) + '/' + businessToday_().slice(0, 4) ? 'Tạm tính đến ' + businessToday_().split('-').reverse().join('/') + ' (chưa chốt)' : 'Đã tính lương'
  }, totals);
}

function authorized_(roles) {
  const auth = verifyUserAuthorization_('', roles);
  require_(auth.authorized, auth.message);
  return auth;
}

function ownRecord_(record, auth) {
  require_(record, 'Không tìm thấy bản ghi.');
  require_(auth.role === 'manager' || record['Mã NV'] === auth.empId, 'Bạn chỉ được thao tác hồ sơ của mình.');
}

function validateAbsence_(form, kind, excludeId) {
  const auth = authorized_();
  const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u => u['Mã NV'] === (form.empId || auth.empId));
  require_(user && user['Trạng Thái'] !== 'Đã nghỉ việc', 'Nhân viên không hợp lệ.');
  ownRecord_(user, auth);
  const range = workingRange_(form.from, form.to);
  const submittedDays = Number(form.days);
  if (Number.isFinite(submittedDays) && submittedDays > 0) {
    range.days = submittedDays;
  }
  return { user: user, range: range };
}

/**
 * ====================================================================
 * TẦNG KẾT NỐI VÀ THAO TÁC GOOGLE SHEETS DATABASE
 * ====================================================================
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
    if (!row[0] && !row[1]) continue;
    const item = { _rowIndex: i + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c].toString().trim();
      let val = row[c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, CONFIG.TIMEZONE || "GMT+7", "yyyy-MM-dd");
      }
      item[key] = val;
    }
    results.push(item);
  }
  return results;
}

function formatDateVN_(date) {
  if (!date) return "";
  const d = new Date(date);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm");
}

function demoSeedTables_() {
  const tables = {};
  const getOrCreateSheet = name => (tables[name] = []);

  // 1. Sheet Users
  let userSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.USERS);
  if (userSheet.length < 1) {
    userSheet.push(["Mã NV", "Họ và Tên", "Phòng Ban", "Chức Vụ", "Lương Cơ Bản", "Email", "Mật Khẩu", "Trạng Thái", "Ngày Vào Làm", "Số Điện Thoại"]);
    userSheet.push(["WZ-001", "Nguyễn Thuỳ Linh", "Hành chính", "Nhân viên", 8000000, "linh.nguyen@wanzhong.vn", "123456", "Đang làm việc", "15/01/2024", "0901234567"]);
    userSheet.push(["WZ-002", "Tang Qi Feng", "Ban Giám Đốc", "Quản lý", 10500000, "feng.tang@wanzhong.vn", "123456", "Đang làm việc", "01/01/2024", "0912345678"]);
    userSheet.push(["WZ-003", "Nguyễn Thị Kim Thoa", "Kế toán", "Kế toán", 10000000, "thoa.nguyen@wanzhong.vn", "123456", "Đang làm việc", "01/01/2024", "0923456789"]);
    userSheet.push(["WZ-004", "CHEN CONG XING", "Kỹ thuật", "Nhân viên", 8500000, "xing.chen@wanzhong.vn", "123456", "Đang làm việc", "15/02/2024", "0934567890"]);
    userSheet.push(["WZ-005", "Chen SongMao", "Kinh doanh", "Quản lý", 10000000, "mao.chen@wanzhong.vn", "123456", "Đang làm việc", "01/02/2024", "0941000005"]);
    userSheet.push(["WZ-006", "HE XIE YAN", "Kỹ thuật", "Nhân viên", 8500000, "yan.he@wanzhong.vn", "123456", "Đang làm việc", "01/03/2024", "0941000006"]);
    userSheet.push(["WZ-007", "Xu JunCheng", "Kỹ thuật", "Nhân viên", 8500000, "cheng.xu@wanzhong.vn", "123456", "Đang làm việc", "01/03/2024", "0941000007"]);
    userSheet.push(["WZ-008", "Đỗ Thị Hồng Ngọc", "Kế toán", "Kế toán", 5500000, "ngoc.do@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000008"]);
    userSheet.push(["WZ-009", "Phạm Thị Cúc", "Kinh doanh", "Nhân viên", 6000000, "cuc.pham@wanzhong.vn", "123456", "Đang làm việc", "01/03/2024", "0941000009"]);
    userSheet.push(["WZ-010", "Nguyễn Thảo Vân", "Kinh doanh", "Nhân viên", 6000000, "van.nguyen@wanzhong.vn", "123456", "Đang làm việc", "01/03/2024", "0941000010"]);
    userSheet.push(["WZ-011", "Chu Huy Hải", "Sản xuất", "Quản lý", 4810000, "hai.chu@wanzhong.vn", "123456", "Đang làm việc", "01/01/2024", "0941000011"]);
    userSheet.push(["WZ-012", "Lương Minh Tuấn", "Sản xuất", "Nhân viên", 4810000, "tuan.luong@wanzhong.vn", "123456", "Đang làm việc", "15/02/2024", "0941000012"]);
    userSheet.push(["WZ-013", "Trần Thị Liên", "Sản xuất", "Nhân viên", 4810000, "lien.tran@wanzhong.vn", "123456", "Đang làm việc", "01/03/2024", "0941000013"]);
    userSheet.push(["WZ-014", "Đinh Thị Vắn", "Sản xuất", "Nhân viên", 4750000, "van.dinh@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000014"]);
    userSheet.push(["WZ-015", "Đinh Văn Bắc", "Sản xuất", "Nhân viên", 4750000, "bac.dinh@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000015"]);
    userSheet.push(["WZ-016", "Hoàng Thị Dữ", "Sản xuất", "Nhân viên", 4750000, "du.hoang@wanzhong.vn", "123456", "Đang làm việc", "15/04/2024", "0941000016"]);
    userSheet.push(["WZ-017", "Hạng Thị Mẩy", "Sản xuất", "Nhân viên", 4750000, "may.hang@wanzhong.vn", "123456", "Đang làm việc", "01/05/2024", "0941000017"]);
    userSheet.push(["WZ-018", "Đinh Văn Nam", "Sản xuất", "Nhân viên", 4750000, "nam.dinh@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000018"]);
    userSheet.push(["WZ-019", "Đinh Văn Sưởng", "Sản xuất", "Nhân viên", 4750000, "suong.dinh@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000019"]);
    userSheet.push(["WZ-020", "Đinh Thị Sinh", "Sản xuất", "Nhân viên", 4750000, "sinh.dinh@wanzhong.vn", "123456", "Đang làm việc", "01/04/2024", "0941000020"]);
  }

  // 2. Sheet ChamCong
  let attSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.ATTENDANCE);
  if (attSheet.length < 1) {
    const daysHeader = [];
    for (let d = 1; d <= 31; d++) daysHeader.push("Ngày " + d);
    attSheet.push(["Mã Kỳ Công", "Mã NV", "Họ và Tên", "Phòng Ban", ...daysHeader, "Tổng Công", "Tổng Phép", "Tổng Ốm", "Tổng OT"]);

    const defaultDays10 = Array(31).fill("X");
    [3, 10, 17, 24].forEach(idx => { defaultDays10[idx] = "CN"; });
    [2, 9, 16, 23, 30].forEach(idx => { defaultDays10[idx] = "T7"; });

    userSheet.slice(1).forEach(u => {
      const empId = u[0], empName = u[1], dept = u[2];
      if (empId === "WZ-004") {
        const days4 = [...defaultDays10];
        days4[9] = "OT"; days4[23] = "OT";
        days4[11] = "O"; days4[12] = "O";
        attSheet.push(["10/2026", empId, empName, dept, ...days4, 20, 0, 2, 2]);
      } else {
        attSheet.push(["10/2026", empId, empName, dept, ...defaultDays10, 22, 0, 0, 0]);
      }
    });

    const defaultDays11 = Array(31).fill("X");
    [0, 7, 14, 21, 28].forEach(idx => { defaultDays11[idx] = "CN"; });
    [6, 13, 20, 27].forEach(idx => { defaultDays11[idx] = "T7"; });
    defaultDays11[30] = "";

    userSheet.slice(1).forEach(u => {
      const empId = u[0], empName = u[1], dept = u[2];
      attSheet.push(["11/2026", empId, empName, dept, ...defaultDays11, 21, 0, 0, 0]);
    });
  }

  // 3. Sheet DonNghiPhep
  let leaveSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.LEAVE);
  if (leaveSheet.length < 1) {
    leaveSheet.push(["Mã Đơn", "Mã NV", "Họ và Tên", "Loại Nghỉ", "Từ Ngày", "Đến Ngày", "Số Ngày", "Lý Do", "Trạng Thái", "Ngày Duyệt", "Người Duyệt"]);
    leaveSheet.push(["LV-2610-01", "WZ-001", "Nguyễn Thuỳ Linh", "Nghỉ phép năm", "2026-10-14", "2026-10-15", 2, "Việc gia đình ở quê", "PENDING", "", ""]);
  }

  // 4. Sheet HoSoOmDau
  let sickSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.SICK);
  if (sickSheet.length < 1) {
    sickSheet.push(["Mã Hồ Sơ", "Mã NV", "Họ và Tên", "Cơ Sở Y Tế", "Từ Ngày", "Đến Ngày", "Số Ngày", "Chứng Từ URL", "Trạng Thái", "Ngày Duyệt", "Người Duyệt", "Ghi Chú"]);
    sickSheet.push(["SC-2610-01", "WZ-004", "CHEN CONG XING", "Bệnh viện Bạch Mai", "2026-10-12", "2026-10-13", 2, "demo:sample", "APPROVED", "13/10/2026 09:30", "Tang Qi Feng", "Đã đối chiếu chứng từ hợp lệ"]);
    sickSheet.push(["SC-2610-02", "WZ-004", "CHEN CONG XING", "Bệnh viện Hồng Ngọc", "2026-10-20", "2026-10-21", 2, "demo:sample", "NEED_MORE_INFO", "21/10/2026 14:00", "Tang Qi Feng", "Cần bổ sung giấy chứng nhận nghỉ việc hưởng BHXH có mộc tròn"]);
  }

  // 5. Sheet CongViec
  let taskSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.TASKS);
  if (taskSheet.length < 1) {
    taskSheet.push(["Mã CV", "Tiêu Đề Công Việc", "Loại Công Việc", "Người Giao", "Người Phụ Trách", "Ngày Bắt Đầu", "Hạn Chót", "Ngày Hoàn Thành", "Trạng Thái", "Đánh Giá", "Ghi Chú", "Mã Văn Bản"]);
    taskSheet.push(["CV-101", "Rà soát kế hoạch bảo mật dữ liệu quý IV", "Dự án", "Tang Qi Feng", "Nguyễn Thuỳ Linh", "01/10/2026", "15/10/2026", "", "Đang xử lý", "", "Ưu tiên cao", "01/2024/QĐ-WZ"]);
    taskSheet.push(["CV-102", "Quyết toán thuế TNCN và tạm ứng lương", "Hành chính", "Ban Giám Đốc", "Nguyễn Thị Kim Thoa", "05/10/2026", "20/10/2026", "", "Đang xử lý", "", "Đúng kỳ hạn", "PL01/2024/ĐC-LƯƠNG"]);
    taskSheet.push(["CV-103", "Triển khai hạ tầng máy chủ cho chi nhánh", "Kỹ thuật", "Tang Qi Feng", "CHEN CONG XING", "02/10/2026", "18/10/2026", "", "Đang xử lý", "", "Cần mua thêm license", ""]);
  }

  // 6. Sheet VanBan (Chứng từ & Văn bản chuẩn Doanh nghiệp)
  let docSheet = getOrCreateSheet(CONFIG.SHEET_NAMES.DOCUMENTS);
  if (docSheet.length < 1) {
    docSheet.push(["Số Hiệu", "Tiêu Đề Văn Bản", "Loại Văn Bản", "Cơ Quan Ban Hành", "Ngày Ban Hành", "Người Ký", "Link Tài Liệu", "Trạng Thái", "Lĩnh Vực"]);
    // Bộ văn bản thực tế trích xuất từ hồ sơ doanh nghiệp khách gửi:
    docSheet.push(["01/2024/QĐ-WZ", "Quyết định V/v thay đổi mức phụ cấp cho các bộ phận năm 2024", "Quyết định điều chỉnh lương", "Công Ty TNHH Công Nghệ Sạch Wanzhong Việt Nam", "2024-01-02", "Tổng Giám Đốc", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["0107/2024/QĐ-ĐC", "Quyết định V/v điều chỉnh mức lương cho cán bộ CNV kỳ Tháng 7/2024", "Quyết định điều chỉnh lương", "Công Ty TNHH Công Nghệ Sạch Wanzhong Việt Nam", "2024-07-01", "Tổng Giám Đốc", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["3008/2024/QĐ-WZ", "Quyết định V/v chi thưởng Lễ Quốc khánh 2/9 cho CBCNV", "Thông báo trả lương", "Công Ty TNHH Công Nghệ Sạch Wanzhong Việt Nam", "2024-08-30", "Tổng Giám Đốc", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["2604/2024/QĐ-WZ", "Quyết định V/v chi thưởng dịp Lễ 30/4 và Quốc tế Lao động 1/5", "Quy chế lương", "Công Ty TNHH Công Nghệ Sạch Wanzhong Việt Nam", "2024-04-26", "Tổng Giám Đốc", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["0109/2024/QĐ-WZ", "Quyết định V/v điều chỉnh tăng bậc lương nhân viên đợt 2 kỳ Tháng 9/2024", "Quyết định điều chỉnh lương", "Công Ty TNHH Công Nghệ Sạch Wanzhong Việt Nam", "2024-09-01", "Tổng Giám Đốc", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["1507/2024/QĐ-TV", "Quyết định chấm dứt HĐLĐ và giải quyết chế độ thôi việc năm 2024", "Quy chế nội bộ", "Phòng Nhân Sự", "2024-07-15", "Trưởng phòng Nhân sự", "", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
    docSheet.push(["D02-LT-595", "Báo cáo danh sách lao động tham gia BHXH, BHYT, BHTN theo QĐ 1040/QĐ-BHXH", "Văn bản pháp luật", "Cơ quan Bảo hiểm Xã hội Huyện Văn Lâm", "2024-07-01", "Giám đốc BHXH", "", "Tài liệu tham khảo", "Chính sách Lao động & Việc làm"]);
    docSheet.push(["PL01/2024/ĐC-LƯƠNG", "Phụ lục bảng kê chi tiết điều chỉnh hệ số và mức lương cán bộ CNV Tháng 7/2024", "Quy chế lương", "Phòng Kế toán - Tài chính", "2024-07-01", "Kế toán trưởng", "", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    // Bộ quy chế & văn bản pháp lý nền tảng:
    docSheet.push(["01/2026/QĐ-WZ", "Quyết định ban hành Quy chế làm việc từ xa (Work From Home)", "Quy chế nội bộ", "Tổng Giám Đốc", "2026-01-02", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Quản trị & Quy chế Nội bộ"]);
    docSheet.push(["02/2026/QC-LUONG", "Quy chế tiền lương, tiền thưởng và phụ cấp nội bộ năm 2026", "Quy chế lương", "Tổng Giám Đốc", "2026-01-05", "Nguyễn Văn An", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["18/2026/TB-LUONG", "Thông báo chi trả kỳ lương Tháng 10/2026 và quyết toán công tác phí", "Thông báo trả lương", "Phòng Nhân Sự", "2026-10-01", "Nguyễn Thị Kim Thoa", "demo:sample", "Hiệu lực", "Tiền lương & Chế độ BHXH"]);
    docSheet.push(["45/2019/QH14", "Bộ luật Lao động năm 2019 số 45/2019/QH14", "Văn bản pháp luật", "Quốc Hội", "2019-11-20", "Chủ tịch Quốc Hội", "demo:sample", "Tài liệu tham khảo", "Chính sách Lao động & Việc làm"]);
    docSheet.push(["DEMO-BHXH", "Tình huống thực hành hồ sơ ốm đau (tài liệu giả lập)", "Văn bản pháp luật", "Bộ phận đào tạo (giả lập)", "2026-10-01", "Người biên soạn demo", "demo:sample", "Tài liệu tham khảo", "Tiền lương & Chế độ BHXH"]);
  }

  const users = matrixToObjects_(tables[CONFIG.SHEET_NAMES.USERS]);
  const historicalPeriods = previousPayrollPeriods_(null, 2);
  const attendanceRows = tables[CONFIG.SHEET_NAMES.ATTENDANCE];
  historicalPeriods.forEach(period => users.forEach(user => {
    if (attendanceRows.slice(1).some(row => row[0] === period && row[1] === user['Mã NV'])) return;
    const days = monthDays_(period).days;
    if (user['Mã NV'] === 'WZ-004') {
      const saturdays = days.map((value, index) => value === 'T7' ? index : -1).filter(index => index >= 0);
      saturdays.slice(0, 2).forEach(index => days[index] = 'OT');
      const weekdays = days.map((value, index) => value === 'X' ? index : -1).filter(index => index >= 0);
      weekdays.slice(0, 2).forEach(index => days[index] = 'O');
    }
    const totals = attendanceTotals_(days);
    attendanceRows.push([period, user['Mã NV'], user['Họ và Tên'], user['Phòng Ban'], ...days, totals.actualDays, totals.paidLeaveDays, totals.sickDays, totals.otDays]);
  }));
  attendanceRows.slice(1).forEach(row => {
    const period = row[0], cutoff = attendanceCutoff_(period), calendar = emptyAttendanceDays_(period);
    for (let i = cutoff; i < 31; i++)if (['X', 'OT'].includes(row[4 + i])) row[4 + i] = calendar[i];
    const totals = attendanceTotals_(actualAttendanceDays_(period, row.slice(4, 35)));
    row.splice(35, 4, totals.actualDays, totals.paidLeaveDays, totals.sickDays, totals.otDays);
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
    if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[name];
    range.setNumberFormat('@');
    range.setValues(values);
  });
  Logger.log("Đã khởi tạo hoàn tất toàn bộ 7 Bảng dữ liệu chuẩn Doanh Nghiệp trên Google Sheets!");
  return { success: true, message: "Đã khởi tạo thành công 7 bảng dữ liệu!" };
}

function rows_(name) {
  const ss = getSpreadsheet_();
  const cache = REQUEST_CONTEXT_.rows || (REQUEST_CONTEXT_.rows = {});
  if (!Object.prototype.hasOwnProperty.call(cache, name)) cache[name] = sheetToObjects_(ss.getSheetByName(name));
  return cache[name];
}

function saveRow_(name, fields, rowIndex) {
  if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  const headers = sheet.getDataRange().getValues()[0].map(String);
  Object.keys(fields).forEach(key => { if (!headers.includes(key)) headers.push(key); });
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  const targetRow = rowIndex || sheet.getLastRow() + 1;
  if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(targetRow, 1, 1, headers.length).setNumberFormat("@");
  const old = rowIndex ? sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0] : [];
  const values = headers.map((key, i) => {
    const val = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : (old[i] === undefined ? '' : old[i]);
    return typeof val === 'string' && /^[=+@]/.test(val) ? "'" + val : val;
  });
  sheet.getRange(rowIndex || sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
}

function deleteRow_(name, rowIndex) {
  if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet || !rowIndex || rowIndex <= 1 || rowIndex > sheet.getLastRow()) return false;
  sheet.deleteRow(rowIndex);
  return true;
}

function resetDatabase_() {
  authorized_(['manager']);
  setupDatabaseSheets_(getSpreadsheet_(), true);
  return { success: true, code: 'MSG_RESET_SUCCESS', message: 'Đã khôi phục dữ liệu mẫu vào Google Sheet trung tâm.' };
}

function resetWorkspace_() {
  return resetDatabase_();
}

function initDatabase_() {
  return setupDatabaseSheets_(null, true);
}
/**
 * ====================================================================
 * TẦNG XÁC THỰC, PHÂN QUYỀN VÀ BỘ ĐIỀU PHỐI RPC (API ROUTER)
 * ====================================================================
 */

/** @type {{ ss?: any; email?: string; rows?: Record<string, any>; writeLocked?: boolean } | null} */
let REQUEST_CONTEXT_ = null;

function demoAccounts_() { return ['linh.nguyen@wanzhong.vn', 'feng.tang@wanzhong.vn', 'thoa.nguyen@wanzhong.vn', 'xing.chen@wanzhong.vn']; }

function apiLogin(email, password) {
  const startedAt = Date.now(), timing = {};
  const mark = stage => { timing[stage] = Date.now() - startedAt; };
  try {
    const normalized = String(email || '').trim().toLowerCase();
    const ss = getSpreadsheet_();
    REQUEST_CONTEXT_ = { ss: ss, email: normalized, rows: {} };
    mark('openSpreadsheetMs');

    const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u => String(u['Email']).toLowerCase() === normalized);
    require_(user && String(user['Mật Khẩu']) === password && user['Trạng Thái'] !== 'Đã nghỉ việc', 'Email, mật khẩu hoặc trạng thái tài khoản không hợp lệ.');
    const token = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put('AUTH_' + token, JSON.stringify({ email: normalized }), 21600);
    mark('totalMs');
    return { success: true, code: 'MSG_LOGIN_SUCCESS', params: { name: user['Họ và Tên'] }, profile: profile_(user, true), token: token };
  } catch (err) { return { success: false, code: 'ERR_AUTH_INVALID', message: err.message }; }
  finally {
    REQUEST_CONTEXT_ = null;
    mark('finishedMs');
    Logger.log('apiLogin timing (elapsed ms): ' + JSON.stringify(timing));
  }
}

function apiLogout(token) { CacheService.getScriptCache().remove('AUTH_' + String(token || '')); return { success: true, code: 'MSG_LOGOUT_SUCCESS', message: 'Đã đăng xuất thành công.' }; }

function apiRequest(token, action, args) {
  const routes = {
    apiGetInitialAppData: initialData_, apiGetAttendance: getAttendance_, apiGetPayrollData: getPayroll_, apiCalculateMonthlyPayroll: calculatePayroll_,
    apiUpdateAttendanceCell: updateAttendance_, apiUpdateAttendanceBatch: updateAttendanceBatch_, apiSubmitLeave: submitLeave_, apiUpdateLeave: updateLeave_, apiCancelLeave: cancelLeave_, apiApproveLeave: approveLeave_, apiRejectLeave: rejectLeave_,
    apiSubmitSick: submitSick_, apiApproveSick: approveSick_, apiRejectSick: rejectSick_, apiAskMoreInfoSick: askMoreSick_, apiResubmitSick: resubmitSick_,
    apiSaveDocument: saveDocument_, apiUpdateDocument: updateDocument_, apiSaveTask: saveTask_, apiUpdateTaskStatus: updateTaskStatus_,
    apiSaveEmployee: saveEmployee_, apiDeleteEmployee: deleteEmployee_, apiResetDatabase: resetDatabase_, apiReadAttachment: readAttachment_
  };
  require_(Object.prototype.hasOwnProperty.call(routes, action), 'Thao tác không được hỗ trợ.');
  require_(Array.isArray(args || []), 'Tham số không hợp lệ.');

  const writeActions = [
    'apiCalculateMonthlyPayroll', 'apiUpdateAttendanceCell', 'apiUpdateAttendanceBatch', 'apiSubmitLeave', 'apiUpdateLeave', 'apiCancelLeave', 'apiApproveLeave', 'apiRejectLeave',
    'apiSubmitSick', 'apiApproveSick', 'apiRejectSick', 'apiAskMoreInfoSick', 'apiResubmitSick',
    'apiSaveDocument', 'apiUpdateDocument', 'apiSaveTask', 'apiUpdateTaskStatus',
    'apiSaveEmployee', 'apiDeleteEmployee', 'apiResetDatabase'
  ];
  const isWrite = writeActions.includes(action);
  const lock = isWrite ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(30000)) return { success: false, code: 'ERR_SYSTEM_BUSY', message: 'Hệ thống đang bận.' };

  try {
    const cached = CacheService.getScriptCache().get('AUTH_' + String(token || ''));
    require_(cached, 'Phiên hết hạn. Vui lòng đăng nhập lại.');
    const session = JSON.parse(cached);
    REQUEST_CONTEXT_ = { ss: getSpreadsheet_(), email: session.email, rows: {}, writeLocked: isWrite };
    authorized_();
    return routes[action].apply(null, args || []);
  } catch (err) {
    const code = err.message === 'Phiên hết hạn. Vui lòng đăng nhập lại.' ? 'ERR_SESSION_EXPIRED' : (err.message === 'Hệ thống đang bận.' ? 'ERR_SYSTEM_BUSY' : null);
    return { success: false, code: code, message: err.message };
  }
  finally {
    REQUEST_CONTEXT_ = null;
    if (lock) { try { lock.releaseLock(); } catch (e) { } }
  }
}

function verifyUserAuthorization_(ignored, roles) {
  if (!REQUEST_CONTEXT_) return { authorized: false, message: 'Chưa đăng nhập.' };
  const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u => String(u['Email']).toLowerCase() === REQUEST_CONTEXT_.email);
  if (!user || user['Trạng Thái'] === 'Đã nghỉ việc') return { authorized: false, message: 'Tài khoản đã bị khóa.' };
  const role = roleFromTitle_(user['Chức Vụ']);
  if (roles && !roles.includes(role)) return { authorized: false, message: 'Bạn không có quyền thực hiện thao tác này.' };
  return { authorized: true, user: user, role: role, name: user['Họ và Tên'], empId: user['Mã NV'] };
}

function profile_(u, showSalary) {
  return { id: u['Mã NV'], name: u['Họ và Tên'], email: u['Email'], dept: u['Phòng Ban'], title: u['Chức Vụ'], role: roleFromTitle_(u['Chức Vụ']), salary: showSalary ? Number(u['Lương Cơ Bản']) : 0, status: u['Trạng Thái'], startDate: u['Ngày Vào Làm'], phone: u['Số Điện Thoại'] };
}

function initialData_(ignored, period) {
  const auth = authorized_(); period = period_(period || '10/2026');
  const users = rows_(CONFIG.SHEET_NAMES.USERS).map(u => profile_(u, auth.role !== 'employee' || u['Mã NV'] === auth.empId));
  const visible = r => auth.role === 'manager' || r['Mã NV'] === auth.empId;
  const leaves = rows_(CONFIG.SHEET_NAMES.LEAVE).filter(visible).map(r => ({ id: r['Mã Đơn'], empId: r['Mã NV'], empName: r['Họ và Tên'], type: r['Loại Nghỉ'], from: r['Từ Ngày'], to: r['Đến Ngày'], days: Number(r['Số Ngày']), reason: r['Lý Do'], status: r['Trạng Thái'], approvedAt: r['Ngày Duyệt'], approvedBy: r['Người Duyệt'] }));
  const sick = rows_(CONFIG.SHEET_NAMES.SICK).filter(visible).map(r => ({ id: r['Mã Hồ Sơ'], empId: r['Mã NV'], empName: r['Họ và Tên'], hospital: r['Cơ Sở Y Tế'], from: r['Từ Ngày'], to: r['Đến Ngày'], days: Number(r['Số Ngày']), docUrl: r['Chứng Từ URL'], status: r['Trạng Thái'], note: r['Ghi Chú'], approvedAt: r['Ngày Duyệt'], approvedBy: r['Người Duyệt'] }));
  const tasks = rows_(CONFIG.SHEET_NAMES.TASKS).filter(t => auth.role === 'manager' || t['Mã NV Phụ Trách'] === auth.empId).map(t => ({ id: t['Mã CV'], title: t['Tiêu Đề Công Việc'], type: t['Loại Công Việc'], assigner: t['Người Giao'], assignee: t['Người Phụ Trách'], assigneeId: t['Mã NV Phụ Trách'], startDate: t['Ngày Bắt Đầu'], deadline: t['Hạn Chót'], doneDate: t['Ngày Hoàn Thành'], status: t['Trạng Thái'], note: t['Ghi Chú'], docId: t['Mã Văn Bản'] }));
  const documents = rows_(CONFIG.SHEET_NAMES.DOCUMENTS).map(d => ({ id: d['Số Hiệu'], title: d['Tiêu Đề Văn Bản'], type: d['Loại Văn Bản'], issuer: d['Cơ Quan Ban Hành'], date: d['Ngày Ban Hành'], signer: d['Người Ký'], fileUrl: d['Link Tài Liệu'], status: d['Trạng Thái'], category: d['Lĩnh Vực'] }));
  const payroll = getPayroll_();
  const attendance = getAttendance_(period);
  return { success: true, data: { payrollPeriods: payroll.periods, defaultPayrollPeriod: payroll.defaultPeriod, users: users, period: period, timesheet: attendance.timesheet, attendanceCutoff: attendance.cutoff, attendanceAsOf: attendance.asOf, plannedTimesheet: attendance.plannedTimesheet, leaves: leaves, sickCases: sick, payroll: payroll.data, tasks: tasks, documents: documents } };
}

function cleanupExpiredWorkspaces_() {
  return { removed: 0 };
}
