const PAYROLL_FIELDS_={period:'Mã Kỳ Lương',empId:'Mã NV',empName:'Họ và Tên',title:'Chức Vụ',baseSalary:'Lương Cơ Bản',standardDays:'Công Chuẩn',actualDays:'Công Thực',allowance:'Phụ Cấp',bhxh:'Khấu Trừ BHXH',netSalary:'Thực Lĩnh',status:'Trạng Thái',otDays:'Ngày OT',otPay:'Tiền OT',paidLeaveDays:'Phép Hưởng Lương',unpaidDays:'Nghỉ Không Lương',sickDays:'Ngày Ốm',salaryByDays:'Lương Theo Công'};
function calculatePayrollInternal_(period) {
  period_(period);
  rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>u['Trạng Thái']!=='Đã nghỉ việc').forEach(user=>{
    const value=payrollValue_(user,period,rowDays_(attendanceRow_(user['Mã NV'],period)));
    const old=rows_(CONFIG.SHEET_NAMES.PAYROLL).find(p=>p['Mã NV']===value.empId&&p['Mã Kỳ Lương']===period);
    const fields={}; Object.keys(PAYROLL_FIELDS_).forEach(key=>fields[PAYROLL_FIELDS_[key]]=value[key]);
    saveRow_(CONFIG.SHEET_NAMES.PAYROLL,fields,old&&old._rowIndex);
  });
}
function calculatePayroll_(period) {
  authorized_(['manager','hr']); calculatePayrollInternal_(period);
  return {success:true,message:'Đã tính và lưu đầy đủ công, phép hưởng lương và OT kỳ '+period+'.'};
}
function getPayroll_() {
  const auth=authorized_();
  const data=rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>auth.role!=='employee'||p['Mã NV']===auth.empId).map(row=>{
    const item={}; Object.keys(PAYROLL_FIELDS_).forEach(key=>{
      item[key]=['period','empId','empName','title','status'].includes(key)?row[PAYROLL_FIELDS_[key]]:(Number(row[PAYROLL_FIELDS_[key]])||0);
    }); return item;
  });
  return {success:true,data:data};
}
