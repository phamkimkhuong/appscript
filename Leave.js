function submitLeave_(form) {
  require_(!form.empId || form.empId===authorized_().empId,'Chỉ được nộp hồ sơ cho chính mình.');
  const checked=validateAbsence_(form,'leave','');
  require_(['Nghỉ phép năm','Việc riêng'].includes(form.type),'Loại nghỉ không hợp lệ.');
  require_(safeText_(form.reason,2000),'Vui lòng nhập lý do.');
  const id=uniqueId_('LV');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Mã Đơn':id,'Mã NV':checked.user['Mã NV'],'Họ và Tên':checked.user['Họ và Tên'],'Loại Nghỉ':form.type,'Từ Ngày':checked.range.from,'Đến Ngày':checked.range.to,'Số Ngày':checked.range.days,'Lý Do':form.reason,'Trạng Thái':'PENDING'});
  return {success:true,newId:id,message:'Đã gửi đơn nghỉ phép.'};
}
function approveLeave_(id) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.LEAVE).find(r=>r['Mã Đơn']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ duyệt đơn đang chờ.');
  const range=validateAbsence_({empId:row['Mã NV'],from:row['Từ Ngày'],to:row['Đến Ngày']},'leave',id).range;
  syncAbsence_(row['Mã NV'],range,row['Loại Nghỉ']==='Nghỉ phép năm'?'P':'K');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Trạng Thái':'APPROVED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  return {success:true,message:'Đã duyệt và đồng bộ công. Vui lòng tính lại lương kỳ liên quan.'};
}
function rejectLeave_(id,reason) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.LEAVE).find(r=>r['Mã Đơn']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ từ chối đơn đang chờ.');
  saveRow_(CONFIG.SHEET_NAMES.LEAVE,{'Trạng Thái':'REJECTED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name+' — '+safeText_(reason)},row._rowIndex);
  return {success:true,message:'Đã từ chối đơn.'};
}
