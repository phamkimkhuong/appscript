/** Remove old prefilled future work once, preserving scheduled absences. */
function clearFutureWork_() {
  const name=CONFIG.SHEET_NAMES.ATTENDANCE, today=businessToday_();
  const needsRepair=rows_(name).some(row=>rowDays_(row).some((symbol,index)=>index>=attendanceCutoff_(row['Mã Kỳ Công'],today) && ['X','OT'].includes(symbol)));
  if (!needsRepair) return;
  const lock=REQUEST_CONTEXT_.writeLocked ? null : LockService.getScriptLock();
  require_(!lock || lock.tryLock(3000),'Đang cập nhật bảng công. Vui lòng tải lại.');
  try {
    const sheet=getSpreadsheet_().getSheetByName(name), matrix=sheet.getDataRange().getValues(), headers=matrix[0];
    const column=key=>headers.indexOf(key);
    matrix.slice(1).forEach(row=>{
      const period=row[column('Mã Kỳ Công')]; if(!period) return;
      const cutoff=attendanceCutoff_(period,today),calendar=emptyAttendanceDays_(period);
      for(let i=cutoff;i<31;i++) {
        const col=column('Ngày '+(i+1));
        if(col>=0 && ['X','OT'].includes(row[col])) row[col]=calendar[i];
      }
      const days=Array.from({length:31},(_,i)=>row[column('Ngày '+(i+1))]||'');
      const totals=attendanceTotals_(actualAttendanceDays_(period,days,today));
      Object.entries({'Tổng Công':totals.actualDays,'Tổng Phép':totals.paidLeaveDays,'Tổng Ốm':totals.sickDays,'Tổng OT':totals.otDays,'Tổng Không Lương':totals.unpaidDays}).forEach(([key,value])=>{if(column(key)>=0)row[column(key)]=value;});
    });
    sheet.getRange(1,1,matrix.length,headers.length).setValues(matrix);
    delete (REQUEST_CONTEXT_.rows||{})[name];
  } finally { if(lock) lock.releaseLock(); }
}
/** Attendance is scoped by the authenticated RPC workspace. */
function attendanceRow_(empId,period) {
  period_(period);
  let row=rows_(CONFIG.SHEET_NAMES.ATTENDANCE).find(r=>r['Mã NV']===empId&&r['Mã Kỳ Công']===period);
  if(!row) {
    const user=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>u['Mã NV']===empId);
    require_(user,'Không tìm thấy nhân viên.');
    const info=monthDays_(period);
    const fields={'Mã Kỳ Công':period,'Mã NV':empId,'Họ và Tên':user['Họ và Tên'],'Phòng Ban':user['Phòng Ban']};
    emptyAttendanceDays_(period).forEach((s,i)=>fields['Ngày '+(i+1)]=s);
    saveRow_(CONFIG.SHEET_NAMES.ATTENDANCE,fields);
    row=rows_(CONFIG.SHEET_NAMES.ATTENDANCE).find(r=>r['Mã NV']===empId&&r['Mã Kỳ Công']===period);
  }
  return row;
}
function rowDays_(row) { return Array.from({length:31},(_,i)=>row['Ngày '+(i+1)]||''); }
function storeDays_(row,days) {
  const totals=attendanceTotals_(actualAttendanceDays_(row['Mã Kỳ Công'],days));
  const fields={'Tổng Công':totals.actualDays,'Tổng Phép':totals.paidLeaveDays,'Tổng Ốm':totals.sickDays,'Tổng OT':totals.otDays,'Tổng Không Lương':totals.unpaidDays};
  days.forEach((value,i)=>fields['Ngày '+(i+1)]=value);
  saveRow_(CONFIG.SHEET_NAMES.ATTENDANCE,fields,row._rowIndex);
  // A payroll snapshot becomes stale when its attendance changes.
  rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>p['Mã NV']===row['Mã NV']&&p['Mã Kỳ Lương']===row['Mã Kỳ Công']).forEach(p=>saveRow_(CONFIG.SHEET_NAMES.PAYROLL,{'Trạng Thái':'Cần tính lại'},p._rowIndex));
}
function getAttendance_(period) {
  const auth=authorized_(); period=period_(period||'10/2026');
  clearFutureWork_();
  const asOf=businessToday_(), cutoff=attendanceCutoff_(period,asOf), timesheet={}, plannedTimesheet={};
  rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>u['Trạng Thái']!=='Đã nghỉ việc'&&(auth.role!=='employee'||u['Mã NV']===auth.empId)).forEach(u=>{
    const row=attendanceRow_(u['Mã NV'],period), days=rowDays_(row);
    timesheet[u['Mã NV']]=actualAttendanceDays_(period,days,asOf);
    plannedTimesheet[u['Mã NV']]=days.map((symbol,index)=>index>=cutoff && ['P','K','O'].includes(symbol)?symbol:'');
  });
  return {success:true,period:period,asOf:asOf,cutoff:cutoff,plannedTimesheet:plannedTimesheet,daysInMonth:monthDays_(period).daysInMonth,timesheet:timesheet};
}
function updateAttendance_(empId,day,symbol,ignored,period) {
  authorized_(['manager']); period=period_(period||'10/2026');
  require_(Number.isInteger(Number(day))&&Number(day)>=1&&Number(day)<=monthDays_(period).daysInMonth,'Ngày chấm công không hợp lệ.');
  require_(Number(day)<=attendanceCutoff_(period),'Không chấm công thực tế cho ngày tương lai. Hãy dùng đơn nghỉ nếu cần lên lịch nghỉ.');
  require_(['X','OT','P','K','O','T7','CN',''].includes(symbol),'Ký hiệu công không hợp lệ.');
  const row=attendanceRow_(empId,period),days=rowDays_(row);
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
