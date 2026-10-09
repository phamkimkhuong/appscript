const PAYROLL_FIELDS_={period:'Mã Kỳ Lương',empId:'Mã NV',empName:'Họ và Tên',title:'Chức Vụ',baseSalary:'Lương Cơ Bản',standardDays:'Công Chuẩn',actualDays:'Công Thực',allowance:'Phụ Cấp',bhxh:'Khấu Trừ BHXH',netSalary:'Thực Lĩnh',status:'Trạng Thái',otDays:'Ngày OT',otPay:'Tiền OT',paidLeaveDays:'Phép Hưởng Lương',unpaidDays:'Nghỉ Không Lương',sickDays:'Ngày Ốm',salaryByDays:'Lương Theo Công'};
/** Payroll periods follow the business timezone, not the browser clock. */
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
  return Array.from({length:count || 12}, (_, i) => {
    const date = new Date(Date.UTC(year, month - 2 - i, 1));
    return String(date.getUTCMonth() + 1).padStart(2, '0') + '/' + date.getUTCFullYear();
  });
}
function availablePayrollPeriods_(now, count) {
  const [month, year] = currentBusinessPeriod_(now).split('/').map(Number);
  return Array.from({length:count || 12}, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    return String(date.getUTCMonth() + 1).padStart(2, '0') + '/' + date.getUTCFullYear();
  });
}
function savePayrollBatch_(items) {
  if (!items || !items.length) return;
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.SHEET_NAMES.PAYROLL);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const keys = Object.keys(PAYROLL_FIELDS_);

  let headerChanged = false;
  keys.forEach(k => {
    const col = PAYROLL_FIELDS_[k];
    if (!headers.includes(col)) {
      headers.push(col);
      headerChanged = true;
    }
  });
  if (headerChanged) {
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const pCol = headers.indexOf('Mã Kỳ Lương');
  const empCol = headers.indexOf('Mã NV');

  const existingMap = new Map();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[pCol] && row[empCol]) {
      existingMap.set(String(row[pCol]) + '_' + String(row[empCol]), i + 1);
    }
  }

  const appends = [];
  items.forEach(val => {
    const fields = {};
    keys.forEach(k => { fields[PAYROLL_FIELDS_[k]] = val[k]; });
    const rowValues = headers.map(h => {
      const v = fields[h] !== undefined ? fields[h] : '';
      return typeof v === 'string' && /^[=+@]/.test(v) ? "'" + v : v;
    });
    const key = String(val.period) + '_' + String(val.empId);
    const existingRow = existingMap.get(key);
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, headers.length).setNumberFormat('@').setValues([rowValues]);
    } else {
      appends.push(rowValues);
    }
  });

  if (appends.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    if (sheet.getMaxRows() < startRow + appends.length - 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), startRow + appends.length - 1 - sheet.getMaxRows());
    }
    sheet.getRange(startRow, 1, appends.length, headers.length).setNumberFormat('@').setValues(appends);
  }

  if (REQUEST_CONTEXT_) delete (REQUEST_CONTEXT_.rows || {})[CONFIG.SHEET_NAMES.PAYROLL];
}
function calculatePayrollInternal_(period) {
  period_(period);
  require_(!isFuturePayrollPeriod_(period), 'Không được tính lương cho kỳ tương lai (' + period + '). Hệ thống chỉ tính lương cho kỳ hiện tại hoặc các kỳ trước.');
  clearFutureWork_();
  const users = rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>u['Trạng Thái']!=='Đã nghỉ việc');
  require_(users.length > 0, 'Không tìm thấy nhân viên đang làm việc.');
  const attendance = rows_(CONFIG.SHEET_NAMES.ATTENDANCE);
  require_(attendance.some(row=>row['Mã Kỳ Công']===period), 'Chưa có bảng công đầy đủ cho kỳ này. Hãy kiểm tra bảng chấm công trước khi tính lương.');

  const payrollValues = users.map(user => {
    let att = attendance.find(row => row['Mã NV'] === user['Mã NV'] && row['Mã Kỳ Công'] === period);
    if (!att) att = attendanceRow_(user['Mã NV'], period);
    return payrollValue_(user, period, rowDays_(att));
  });

  savePayrollBatch_(payrollValues);
  return payrollValues;
}
function calculatePayroll_(period) {
  authorized_(['hr']); calculatePayrollInternal_(period);
  return {success:true,message:'Đã tính và lưu đầy đủ công, phép hưởng lương và OT kỳ '+period+'.',payroll:getPayroll_().data};
}
function getPayroll_() {
  const auth=authorized_();
  clearFutureWork_();
  const current = currentBusinessPeriod_();
  const data=rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>!isFuturePayrollPeriod_(p['Mã Kỳ Lương'], current) && (auth.role!=='employee'||p['Mã NV']===auth.empId)).map(row=>{
    const item={}; Object.keys(PAYROLL_FIELDS_).forEach(key=>{
      item[key]=['period','empId','empName','title','status'].includes(key)?row[PAYROLL_FIELDS_[key]]:(Number(row[PAYROLL_FIELDS_[key]])||0);
    });
    // Never expose an old full-month snapshot as current-month earned salary.
    if(item.period===current) {
      const user=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>u['Mã NV']===item.empId);
      const att=rows_(CONFIG.SHEET_NAMES.ATTENDANCE).find(r=>r['Mã NV']===item.empId && r['Mã Kỳ Công']===current);
      if(user)return payrollValue_(user,current,att?rowDays_(att):emptyAttendanceDays_(current));
    }
    return item;
  });
  const defaults = availablePayrollPeriods_();
  const periods = [...new Set([...defaults, ...data.map(row=>row.period)])]
    .filter(p => !isFuturePayrollPeriod_(p, current))
    .sort((a,b)=>periodOrderKey_(b).localeCompare(periodOrderKey_(a)));
  return {success:true,data:data,periods:periods,defaultPeriod:periods[0] || current};
}
