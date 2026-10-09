/** Shared domain rules. Trailing underscores keep helpers private to Apps Script. */
function require_(condition, message) {
  if (!condition) throw new Error(message);
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
  const dates = [];
  for (let i = 0; i <= span; i++) {
    const date = new Date(first.getTime() + i * 86400000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
  }
  require_(dates.length > 0, 'Khoảng nghỉ không có ngày làm việc (thứ Hai–thứ Sáu).');
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

function attendanceTotals_(days) {
  return { actualDays: days.filter(x => x === 'X').length,
    paidLeaveDays: days.filter(x => x === 'P').length,
    sickDays: days.filter(x => x === 'O').length,
    unpaidDays: days.filter(x => x === 'K').length,
    otDays: days.filter(x => x === 'OT').length };
}

function payrollValue_(user, period, days) {
  const totals = attendanceTotals_(days);
  const standardDays = monthDays_(period).standardWorkingDays;
  const baseSalary = Number(user['Lương Cơ Bản']) || 0;
  const salaryByDays = Math.round(baseSalary / standardDays * (totals.actualDays + totals.paidLeaveDays));
  // Educational demo policy: each OT cell is a day paid at 1.5, replacing X; no hourly overtime.
  const otPay = Math.round(baseSalary / standardDays * 1.5 * totals.otDays);
  const allowance = CONFIG.STANDARD_ALLOWANCE;
  const bhxh = Math.round(baseSalary * CONFIG.BHXH_RATE);
  return Object.assign({ period: period, empId: user['Mã NV'], empName: user['Họ và Tên'],
    title: user['Chức Vụ'], baseSalary: baseSalary, standardDays: standardDays,
    salaryByDays: salaryByDays, otPay: otPay, allowance: allowance, bhxh: bhxh,
    netSalary: Math.max(0, salaryByDays + otPay + allowance - bhxh), status: 'Đã tính lương' }, totals);
}

function safeText_(value, max) {
  const text = String(value == null ? '' : value).trim();
  require_(text.length <= (max || 1000), 'Nội dung quá dài.');
  return text;
}

function uniqueId_(prefix) { return prefix + '-' + Utilities.getUuid(); }

function authorized_(roles) {
  const auth = verifyUserAuthorization_('', roles);
  require_(auth.authorized, auth.message);
  return auth;
}

function ownRecord_(record, auth) {
  require_(record, 'Không tìm thấy bản ghi.');
  require_(auth.role !== 'employee' || record['Mã NV'] === auth.empId, 'Bạn chỉ được thao tác hồ sơ của mình.');
}

function validateAbsence_(form, kind, excludeId) {
  const auth = authorized_();
  const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u => u['Mã NV'] === (form.empId || auth.empId));
  require_(user && user['Trạng Thái'] !== 'Đã nghỉ việc', 'Nhân viên không hợp lệ.');
  ownRecord_(user, auth);
  const range = workingRange_(form.from, form.to);
  if (form.days !== undefined && form.days !== '') require_(Number(form.days) === range.days, 'Số ngày phải bằng số ngày làm việc trong khoảng đã chọn: ' + range.days);
  [CONFIG.SHEET_NAMES.LEAVE, CONFIG.SHEET_NAMES.SICK].forEach(name => {
    rows_(name).forEach(row => {
      const id = row['Mã Đơn'] || row['Mã Hồ Sơ'];
      if (id === excludeId || row['Mã NV'] !== user['Mã NV'] || row['Trạng Thái'] === 'REJECTED') return;
      const other = workingRange_(row['Từ Ngày'], row['Đến Ngày']);
      require_(!range.dates.some(d => other.dates.includes(d)), 'Khoảng nghỉ trùng đơn/hồ sơ ' + id + '.');
    });
  });
  return { user: user, range: range };
}
