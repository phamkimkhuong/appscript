/** Attendance is scoped by the authenticated RPC workspace. */
function attendanceRow_(empId,period) {
  period_(period);
  let row=rows_(CONFIG.SHEET_NAMES.ATTENDANCE).find(r=>r['Mã NV']===empId&&r['Mã Kỳ Công']===period);
  if(!row) {
    const user=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>u['Mã NV']===empId);
    require_(user,'Không tìm thấy nhân viên.');
    const info=monthDays_(period);
    const fields={'Mã Kỳ Công':period,'Mã NV':empId,'Họ và Tên':user['Họ và Tên'],'Phòng Ban':user['Phòng Ban']};
    info.days.forEach((s,i)=>fields['Ngày '+(i+1)]=s);
    saveRow_(CONFIG.SHEET_NAMES.ATTENDANCE,fields);
    row=rows_(CONFIG.SHEET_NAMES.ATTENDANCE).find(r=>r['Mã NV']===empId&&r['Mã Kỳ Công']===period);
  }
  return row;
}
function rowDays_(row) { return Array.from({length:31},(_,i)=>row['Ngày '+(i+1)]||''); }
function storeDays_(row,days) {
  const totals=attendanceTotals_(days);
  const fields={'Tổng Công':totals.actualDays,'Tổng Phép':totals.paidLeaveDays,'Tổng Ốm':totals.sickDays,'Tổng OT':totals.otDays,'Tổng Không Lương':totals.unpaidDays};
  days.forEach((value,i)=>fields['Ngày '+(i+1)]=value);
  saveRow_(CONFIG.SHEET_NAMES.ATTENDANCE,fields,row._rowIndex);
  // A payroll snapshot becomes stale when its attendance changes.
  rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>p['Mã NV']===row['Mã NV']&&p['Mã Kỳ Lương']===row['Mã Kỳ Công']).forEach(p=>saveRow_(CONFIG.SHEET_NAMES.PAYROLL,{'Trạng Thái':'Cần tính lại'},p._rowIndex));
}
function getAttendance_(period) {
  const auth=authorized_(); period=period_(period||'10/2026');
  const timesheet={};
  rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>u['Trạng Thái']!=='Đã nghỉ việc'&&(auth.role!=='employee'||u['Mã NV']===auth.empId)).forEach(u=>{
    const row=attendanceRow_(u['Mã NV'],period); timesheet[u['Mã NV']]=rowDays_(row);
  });
  return {success:true,period:period,daysInMonth:monthDays_(period).daysInMonth,timesheet:timesheet};
}
function updateAttendance_(empId,day,symbol,ignored,period) {
  authorized_(['manager','hr']); period=period_(period||'10/2026');
  require_(Number.isInteger(Number(day))&&Number(day)>=1&&Number(day)<=monthDays_(period).daysInMonth,'Ngày chấm công không hợp lệ.');
  require_(['X','OT','P','K','O','T7','CN',''].includes(symbol),'Ký hiệu công không hợp lệ.');
  const row=attendanceRow_(empId,period),days=rowDays_(row);
  const [month,year]=period.split('/');
  const iso=year+'-'+month+'-'+String(day).padStart(2,'0');
  const locked=[CONFIG.SHEET_NAMES.LEAVE,CONFIG.SHEET_NAMES.SICK].some(name=>rows_(name).some(r=>r['Mã NV']===empId&&r['Trạng Thái']==='APPROVED'&&workingRange_(r['Từ Ngày'],r['Đến Ngày']).dates.includes(iso)));
  require_(!locked,'Ngày này đã được ghi nhận từ đơn đã duyệt. Không sửa trực tiếp.');
  days[Number(day)-1]=symbol; storeDays_(row,days);
  return {success:true,message:'Đã cập nhật bảng công. Bảng lương kỳ này cần tính lại.'};
}
function syncAbsence_(empId,range,symbol) {
  const groups={};
  range.dates.forEach(iso=>{
    const period=iso.slice(5,7)+'/'+iso.slice(0,4);
    if(!groups[period])groups[period]=[];
    groups[period].push(Number(iso.slice(8,10)));
  });
  Object.keys(groups).forEach(period=>{
    const row=attendanceRow_(empId,period),days=rowDays_(row);
    groups[period].forEach(day=>days[day-1]=symbol);
    storeDays_(row,days);
  });
}
