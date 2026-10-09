function submitSick_(form) {
  require_(!form.empId || form.empId===authorized_().empId,'Chỉ được nộp hồ sơ cho chính mình.');
  const checked=validateAbsence_(form,'sick','');
  require_(safeText_(form.hospital),'Vui lòng nhập cơ sở y tế.');
  const id=uniqueId_('SC');
  const url=uploadAttachment_(form.fileData,'ChungTu',id);
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Mã Hồ Sơ':id,'Mã NV':checked.user['Mã NV'],'Họ và Tên':checked.user['Họ và Tên'],'Cơ Sở Y Tế':form.hospital,'Từ Ngày':checked.range.from,'Đến Ngày':checked.range.to,'Số Ngày':checked.range.days,'Chứng Từ URL':url,'Trạng Thái':'PENDING','Ghi Chú':''});
  return {success:true,newId:id,docUrl:url,message:'Đã tải chứng từ và gửi hồ sơ.'};
}
function approveSick_(id) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.SICK).find(r=>r['Mã Hồ Sơ']===id);
  require_(row&&row['Trạng Thái']==='PENDING','Chỉ duyệt hồ sơ đang chờ; hồ sơ cần bổ sung phải được nộp lại trước.');
  const range=validateAbsence_({empId:row['Mã NV'],from:row['Từ Ngày'],to:row['Đến Ngày']},'sick',id).range;
  syncAbsence_(row['Mã NV'],range,'O');
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Trạng Thái':'APPROVED','Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  return {success:true,message:'Đã duyệt hồ sơ và đồng bộ công ốm.'};
}
function rejectSick_(id,reason) { return reviewSick_(id,'REJECTED',reason); }
function askMoreSick_(id,note) { return reviewSick_(id,'NEED_MORE_INFO',note); }
function reviewSick_(id,status,note) {
  const auth=authorized_(['manager']);
  const row=rows_(CONFIG.SHEET_NAMES.SICK).find(r=>r['Mã Hồ Sơ']===id);
  require_(row&&['PENDING','NEED_MORE_INFO'].includes(row['Trạng Thái']),'Không thay đổi hồ sơ đã duyệt hoặc đã từ chối.');
  require_(safeText_(note,2000),'Vui lòng nhập lý do.');
  saveRow_(CONFIG.SHEET_NAMES.SICK,{'Trạng Thái':status,'Ghi Chú':note,'Ngày Duyệt':formatDateVN_(new Date()),'Người Duyệt':auth.name},row._rowIndex);
  return {success:true,message:'Đã cập nhật yêu cầu xử lý hồ sơ.'};
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
  return {success:true,docUrl:url,message:'Đã nhận chứng từ mới. Hồ sơ đang chờ Quản lý duyệt.'};
}
