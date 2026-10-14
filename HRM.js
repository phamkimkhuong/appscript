/**
 * ====================================================================
 * WANZHONG CLEAN TECHNOLOGY (VIETNAM) - ENTERPRISE HRM & E-OFFICE
 * ====================================================================
 * FILE: HRM.js
 * VAI TRÒ: PHÂN HỆ QUẢN TRỊ NHÂN SỰ CHUYÊN SÂU (HUMAN RESOURCE MANAGEMENT)
 * --------------------------------------------------------------------
 * MÔ TẢ CHỨC NĂNG:
 * 1. Quản lý Hồ sơ Nhân sự (Employee Directory):
 *    - saveEmployee_(emp): Thêm mới / Cập nhật thông tin nhân viên, phòng ban, chức vụ, mức lương.
 *    - deleteEmployee_(id): Đổi trạng thái sang 'Đã nghỉ việc', bảo mật không xóa hẳn dòng dữ liệu.
 *
 * 2. Động cơ Chấm công đa kỳ tự động (Attendance Engine):
 *    - getAttendance_(period): Tải bảng chấm công theo kỳ (31 ngày), phân loại ký hiệu (X, CN, T7, P, O, K, OT).
 *    - updateAttendance_(...): Cập nhật ký hiệu chấm công từng ngày có kiểm tra quyền Quản lý.
 *    - updateAttendanceBatch_(...): Chấm công hàng loạt nhanh chóng cho ca làm việc.
 *
 * 3. Quy trình Đơn xin nghỉ phép (Leave Request Workflow):
 *    - submitLeave_(form): Nhân viên nộp đơn (Phép năm P, Việc riêng K, Nghỉ bù).
 *    - updateLeave_(form), cancelLeave_(id): Nhân viên sửa hoặc hủy đơn khi còn chờ duyệt (PENDING).
 *    - approveLeave_(id), rejectLeave_(id): Quản lý xét duyệt; khi duyệt tự động điền ký hiệu 'P' hoặc 'K' vào bảng Chấm công.
 *
 * 4. Quy trình Hồ sơ ốm đau BHXH & Chứng từ Drive (Sick Leave & Social Insurance):
 *    - submitSick_(form): Nhân viên gửi hồ sơ ốm đau kèm chứng từ viện phí tải lên Google Drive.
 *    - approveSick_(id), rejectSick_(id): Quản lý đối chiếu chứng từ và duyệt hưởng chế độ BHXH.
 *    - askMoreSick_(id, note), resubmitSick_(form): Yêu cầu bổ sung chứng từ và nộp lại minh chứng.
 *
 * 5. Động cơ Tính & Chốt Bảng lương hàng tháng (Payroll Calculation Engine):
 *    - calculatePayroll_(period): Tính toán lương thực lĩnh dựa trên công thực tế, phụ cấp, OT, BHXH.
 *      Hỗ trợ phân quyền cho cả Kế toán ('hr') và Ban Giám Đốc ('manager').
 *    - getPayroll_(): Truy xuất bảng lương theo kỳ, hỗ trợ phân quyền bảo mật tiền lương từng nhân sự.
 * ====================================================================
 */

/**
 * ====================================================================
 * 1. QUẢN LÝ HỒ SƠ NHÂN SỰ (EMPLOYEE)
 * ====================================================================
 */

function saveEmployee_(emp) {
  const auth=authorized_(['manager']);
  require_(/^[A-Za-z0-9_-]{1,80}$/.test(emp.id),'Mã nhân viên chỉ gồm chữ không dấu, số, gạch ngang hoặc gạch dưới.');
  require_(safeText_(emp.id,80)&&safeText_(emp.name,120),'Nhập mã và tên nhân viên.');
  require_(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email),'Email không hợp lệ.');
  const title=safeText_(emp.title);
  const validTitles=['Tổng Giám Đốc','Phó Tổng Giám Đốc','Quản đốc xưởng','Kế toán trưởng','Kế toán viên','Kỹ sư kỹ thuật','Nhân viên kinh doanh','Nhân viên hành chính','Công nhân sản xuất','Quản lý','Kế toán','Nhân viên'];
  require_(validTitles.includes(title)||Boolean(roleFromTitle_(title)),'Chức vụ không hợp lệ.');
  const role=roleFromTitle_(title);
  require_(Number.isFinite(Number(emp.salary))&&Number(emp.salary)>=0,'Lương không hợp lệ.');
  const users=rows_(CONFIG.SHEET_NAMES.USERS),old=users.find(u=>u['Mã NV']===emp.id);
  require_(emp.mode!=='add'||!old,'Mã nhân viên đã tồn tại.');
  require_(emp.mode!=='edit'||old,'Không tìm thấy nhân viên cần sửa.');
  require_(!users.some(u=>u['Mã NV']!==emp.id&&String(u['Email']).toLowerCase()===emp.email.toLowerCase()),'Email đã tồn tại.');
  if(old&&old['Mã NV']===auth.empId)require_(role===auth.role&&emp.status!=='Đã nghỉ việc'&&emp.email.toLowerCase()===REQUEST_CONTEXT_.email,'Không đổi vai trò, email hoặc khóa chính tài khoản đang dùng.');
  const fields={'Mã NV':emp.id,'Họ và Tên':emp.name,'Phòng Ban':safeText_(emp.dept),'Chức Vụ':title,'Lương Cơ Bản':Number(emp.salary),'Email':emp.email.toLowerCase(),'Trạng Thái':emp.status||'Đang làm việc','Ngày Vào Làm':emp.startDate?date_(emp.startDate).toISOString().slice(0,10):Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd'),'Số Điện Thoại':safeText_(emp.phone)};
  if(old)rows_(CONFIG.SHEET_NAMES.TASKS).filter(t=>t['Mã NV Phụ Trách']===old['Mã NV']).forEach(t=>saveRow_(CONFIG.SHEET_NAMES.TASKS,{'Người Phụ Trách':emp.name},t._rowIndex));
  if(old&&Number(old['Lương Cơ Bản'])!==Number(emp.salary))rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>p['Mã NV']===emp.id).forEach(p=>saveRow_(CONFIG.SHEET_NAMES.PAYROLL,{'Trạng Thái':'Cần tính lại'},p._rowIndex));
  if(!old)fields['Mật Khẩu']='123456';
  saveRow_(CONFIG.SHEET_NAMES.USERS,fields,old&&old._rowIndex);
  return {success:true,newId:emp.id,code:'MSG_EMP_SAVED',params:{id:emp.id},message:'Lưu thông tin nhân sự thành công!'};
}

function deleteEmployee_(id) {
  const auth=authorized_(['manager']);require_(id!==auth.empId,'Không khóa tài khoản đang sử dụng.');
  const row=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>u['Mã NV']===id);require_(row,'Không tìm thấy nhân viên.');
  saveRow_(CONFIG.SHEET_NAMES.USERS,{'Trạng Thái':'Đã nghỉ việc'},row._rowIndex);
  return {success:true,code:'MSG_EMP_RESIGNED',params:{id:id},message:'Đã chuyển trạng thái nhân viên ' + id + ' sang Đã nghỉ việc!'};
}

/**
 * ====================================================================
 * 2. QUẢN LÝ CHẤM CÔNG (ATTENDANCE)
 * ====================================================================
 */

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

function storeDays_(row,days) {
  const totals=attendanceTotals_(actualAttendanceDays_(row['Mã Kỳ Công'],days));
  const fields={'Tổng Công':totals.actualDays,'Tổng Phép':totals.paidLeaveDays,'Tổng Ốm':totals.sickDays,'Tổng OT':totals.otDays,'Tổng Không Lương':totals.unpaidDays};
  days.forEach((value,i)=>fields['Ngày '+(i+1)]=value);
  saveRow_(CONFIG.SHEET_NAMES.ATTENDANCE,fields,row._rowIndex);
  rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>p['Mã NV']===row['Mã NV']&&p['Mã Kỳ Lương']===row['Mã Kỳ Công']).forEach(p=>saveRow_(CONFIG.SHEET_NAMES.PAYROLL,{'Trạng Thái':'Cần tính lại'},p._rowIndex));
}

function getAttendance_(period) {
  const auth=authorized_(); period=period_(period||'10/2026');
  clearFutureWork_();
  const asOf=businessToday_(), cutoff=attendanceCutoff_(period,asOf), timesheet={}, plannedTimesheet={};
  const attRows=rows_(CONFIG.SHEET_NAMES.ATTENDANCE);
  rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>u['Trạng Thái']!=='Đã nghỉ việc'&&(auth.role!=='employee'||u['Mã NV']===auth.empId)).forEach(u=>{
    const row=attRows.find(r=>r['Mã NV']===u['Mã NV']&&r['Mã Kỳ Công']===period);
    const days=row ? rowDays_(row) : emptyAttendanceDays_(period);
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
  return {success:true,code:'MSG_TS_CELL_UPDATED',params:{day:day,symbol:symbol,empId:empId},message:'Đã cập nhật công ngày ' + day + ' (' + empId + ') thành [' + symbol + ']!'};
}

function updateAttendanceBatch_(changes, period) {
  authorized_(['manager']); period=period_(period||'10/2026');
  require_(Array.isArray(changes) && changes.length > 0, 'Danh sách thay đổi không hợp lệ.');
  const daysInMonth = monthDays_(period).daysInMonth;
  const cutoff = attendanceCutoff_(period);
  const validSymbols = ['X','OT','P','K','O','T7','CN',''];
  const byEmp = {};
  changes.forEach(c => {
    require_(c && c.empId, 'Thiếu mã nhân viên.');
    const d = Number(c.day);
    require_(Number.isInteger(d) && d >= 1 && d <= daysInMonth, 'Ngày chấm công không hợp lệ: ' + d);
    require_(d <= cutoff, 'Không chấm công thực tế cho ngày tương lai (' + d + ').');
    const sym = String(c.symbol == null ? '' : c.symbol).trim();
    require_(validSymbols.includes(sym), 'Ký hiệu công không hợp lệ: ' + sym);
    if (!byEmp[c.empId]) byEmp[c.empId] = [];
    byEmp[c.empId].push({ day: d, symbol: sym });
  });

  let totalCount = 0;
  Object.keys(byEmp).forEach(empId => {
    const row = attendanceRow_(empId, period);
    const days = rowDays_(row);
    byEmp[empId].forEach(item => {
      days[item.day - 1] = item.symbol;
      totalCount++;
    });
    storeDays_(row, days);
  });
  return { success: true, count: totalCount, code: 'MSG_TS_SAVED_BATCH', params: { count: totalCount }, message: 'Đã lưu thành công ' + totalCount + ' thay đổi trên bảng chấm công. Bảng lương kỳ này cần tính lại.' };
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

/**
 * ====================================================================
 * 3. QUẢN LÝ ĐƠN NGHỈ PHÉP (LEAVE)
 * ====================================================================
 */

function submitLeave_(form) {
  require_(!form.empId || form.empId===authorized_().empId,'Chỉ được nộp hồ sơ cho chính mình.');
  const checked=validateAbsence_(form,'leave','');
  require_(['Nghỉ phép năm','Việc riêng'].includes(form.type),'Loại nghỉ không hợp lệ.');
  require_(safeText_(form.reason,2000),'Vui lòng nhập lý do.');
  const id=uniqueId_('LV');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Mã Đơn':id,'Mã NV':checked.user['Mã NV'],'Họ và Tên':checked.user['Họ và Tên'],'Loại Nghỉ':form.type,'Từ Ngày':checked.range.from,'Đến Ngày':checked.range.to,'Số Ngày':checked.range.days,'Lý Do':form.reason,'Trạng Thái':'PENDING'});
  return {success:true,newId:id,code:'MSG_LEAVE_SUBMITTED',params:{id:id},message:'Đã gửi đơn nghỉ phép.'};
}

function updateLeave_(form) {
  const auth = authorized_();
  require_(form && form.id, 'Thiếu mã đơn nghỉ phép.');
  const row = rows_(CONFIG.SHEET_NAMES.LEAVE).find(r => r['Mã Đơn'] === form.id);
  require_(row, 'Không tìm thấy đơn nghỉ phép.');
  require_(row['Mã NV'] === auth.empId, 'Chỉ được sửa đơn của chính mình.');
  require_(row['Trạng Thái'] === 'PENDING', 'Chỉ được chỉnh sửa đơn khi còn chờ duyệt.');
  const checked = validateAbsence_(form, 'leave', form.id);
  require_(['Nghỉ phép năm', 'Việc riêng'].includes(form.type), 'Loại nghỉ không hợp lệ.');
  require_(safeText_(form.reason, 2000), 'Vui lòng nhập lý do.');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE, {
    'Loại Nghỉ': form.type,
    'Từ Ngày': checked.range.from,
    'Đến Ngày': checked.range.to,
    'Số Ngày': checked.range.days,
    'Lý Do': form.reason
  }, row._rowIndex);
  return { success: true, code: 'MSG_LEAVE_UPDATED', params: { id: form.id }, message: 'Đã cập nhật đơn nghỉ phép thành công.' };
}

function cancelLeave_(id) {
  const auth = authorized_();
  require_(id, 'Thiếu mã đơn nghỉ phép.');
  const row = rows_(CONFIG.SHEET_NAMES.LEAVE).find(r => r['Mã Đơn'] === id);
  require_(row, 'Không tìm thấy đơn nghỉ phép.');
  require_(row['Mã NV'] === auth.empId || auth.role === 'manager', 'Chỉ được hủy đơn của chính mình.');
  require_(row['Trạng Thái'] === 'PENDING', 'Chỉ được hủy đơn khi còn chờ duyệt.');
  deleteRow_(CONFIG.SHEET_NAMES.LEAVE, row._rowIndex);
  return { success: true, code: 'MSG_LEAVE_CANCELLED', params: { id: id }, message: 'Đã hủy và xóa đơn nghỉ phép.' };
}

function approveLeave_(id) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.LEAVE).find(r=>r['Mã Đơn']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ duyệt đơn đang chờ.');
  const range=validateAbsence_({empId:row['Mã NV'],from:row['Từ Ngày'],to:row['Đến Ngày']},'leave',id).range;
  syncAbsence_(row['Mã NV'],range,row['Loại Nghỉ']==='Nghỉ phép năm'?'P':'K');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Trạng Thái':'APPROVED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  return {success:true,code:'MSG_LEAVE_APPROVED',params:{id:id},message:'Đã duyệt đơn ' + id + ' thành công!'};
}

function rejectLeave_(id,reason) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.LEAVE).find(r=>r['Mã Đơn']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ từ chối đơn đang chờ.');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Trạng Thái':'REJECTED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name+' — '+safeText_(reason)},row._rowIndex);
  return {success:true,code:'MSG_LEAVE_REJECTED',params:{id:id},message:'Đã từ chối đơn ' + id + '!'};
}

/**
 * ====================================================================
 * 4. QUẢN LÝ HỒ SƠ NGHỈ ỐM HƯỞNG BHXH (SICK LEAVE)
 * ====================================================================
 */

function submitSick_(form) {
  require_(!form.empId || form.empId===authorized_().empId,'Chỉ được nộp hồ sơ cho chính mình.');
  const checked=validateAbsence_(form,'sick','');
  require_(safeText_(form.hospital),'Vui lòng nhập cơ sở y tế.');
  const id=uniqueId_('SC');
  const url=uploadAttachment_(form.fileData,'ChungTu',id);
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Mã Hồ Sơ':id,'Mã NV':checked.user['Mã NV'],'Họ và Tên':checked.user['Họ và Tên'],'Cơ Sở Y Tế':form.hospital,'Từ Ngày':checked.range.from,'Đến Ngày':checked.range.to,'Số Ngày':checked.range.days,'Chứng Từ URL':url,'Trạng Thái':'PENDING','Ghi Chú':''});
  return {success:true,newId:id,docUrl:url,code:'MSG_SICK_SUBMITTED',params:{id:id,days:checked.range.days},message:'Nộp hồ sơ ốm đau ' + id + ' (' + checked.range.days + ' ngày) thành công!'};
}

function approveSick_(id) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.SICK).find(r=>r['Mã Hồ Sơ']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ duyệt hồ sơ đang chờ; hồ sơ cần bổ sung phải được nộp lại trước.');
  const range=validateAbsence_({empId:row['Mã NV'],from:row['Từ Ngày'],to:row['Đến Ngày']},'sick',id).range;
  syncAbsence_(row['Mã NV'],range,'O');
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Trạng Thái':'APPROVED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  return {success:true,code:'MSG_SICK_APPROVED',params:{id:id},message:'Đã xác nhận hồ sơ BHXH ' + id + ' thành công!'};
}

function rejectSick_(id,reason) { return reviewSick_(id,'REJECTED',reason); }
function askMoreSick_(id,note) { return reviewSick_(id,'NEED_MORE_INFO',note); }

function reviewSick_(id,status,note) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.SICK).find(r=>r['Mã Hồ Sơ']===id);
  require_(row&&['PENDING','NEED_MORE_INFO'].includes(row['Trạng Thái']),'Không thay đổi hồ sơ đã duyệt hoặc đã từ chối.');
  require_(safeText_(note,2000),'Vui lòng nhập lý do.');
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Trạng Thái':status,'Ghi Chú':note,'Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  const code = status==='REJECTED'?'MSG_SICK_REJECTED':'MSG_SICK_MOREINFO';
  return {success:true,code:code,params:{id:id},message:status==='REJECTED'?'Đã từ chối hồ sơ ' + id + '!':'Đã gửi yêu cầu bổ sung chứng từ cho hồ sơ ' + id + '!'};
}

function resubmitSick_(id,form) {
  const auth=authorized_();
  const row=rows_(CONFIG.SHEET_NAMES.SICK).find(r=>r['Mã Hồ Sơ']===id);
  require_(row && row['Mã NV']===auth.empId,'Chỉ được bổ sung hồ sơ của chính mình.');
  require_(row['Trạng Thái']==='NEED_MORE_INFO','Chỉ nộp lại hồ sơ đang yêu cầu bổ sung.');
  const checked=validateAbsence_({empId:row['Mã NV'],from:form.from,to:form.to,days:form.days},'sick',id);
  require_(safeText_(form.hospital),'Vui lòng nhập cơ sở y tế.');
  const url=uploadAttachment_(form.fileData,'ChungTu',id);
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Cơ Sở Y Tế':form.hospital,'Từ Ngày':checked.range.from,'Đến Ngày':checked.range.to,'Số Ngày':checked.range.days,'Chứng Từ URL':url,'Trạng Thái':'PENDING','Ngày Duyệt':'','Người Duyệt':'','Ghi Chú':safeText_(row['Ghi Chú'],4000)+'\nBổ sung: '+safeText_(form.note,2000)},row._rowIndex);
  return {success:true,docUrl:url,code:'MSG_SICK_RESUBMITTED',params:{id:id},message:'Đã nộp lại chứng từ cho hồ sơ ' + id + ' thành công!'};
}

/**
 * ====================================================================
 * 5. QUẢN LÝ TÍNH LƯƠNG & BẢNG LƯƠNG (PAYROLL)
 * ====================================================================
 */

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
  authorized_(['hr', 'manager']); calculatePayrollInternal_(period);
  return {success:true,code:'MSG_PAYROLL_CALCULATED',params:{period:period},message:'Đã tính toán và lưu Bảng Lương kỳ '+period+' vào Google Sheet thành công!',payroll:getPayroll_().data};
}

function getPayroll_() {
  const auth=authorized_();
  clearFutureWork_();
  const current = currentBusinessPeriod_();
  const data=rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>!isFuturePayrollPeriod_(p['Mã Kỳ Lương'], current) && (auth.role!=='employee'||p['Mã NV']===auth.empId)).map(row=>{
    const item={}; Object.keys(PAYROLL_FIELDS_).forEach(key=>{
      item[key]=['period','empId','empName','title','status'].includes(key)?row[PAYROLL_FIELDS_[key]]:(Number(row[PAYROLL_FIELDS_[key]])||0);
    });
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
