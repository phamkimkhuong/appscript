function saveTask_(task) {
  const auth=authorized_(['manager']);
  require_(safeText_(task.title,300),'Vui lòng nhập tiêu đề.');
  const candidates=rows_(CONFIG.SHEET_NAMES.USERS).filter(u=>(task.assigneeId?u['Mã NV']===task.assigneeId:u['Họ và Tên']===task.assignee)&&u['Trạng Thái']!=='Đã nghỉ việc');
  require_(candidates.length===1,'Chọn chính xác mã nhân viên phụ trách.');
  const assignee=candidates[0];
  const deadline=date_(task.deadline).toISOString().slice(0,10);
  const start=task.startDate?date_(task.startDate).toISOString().slice(0,10):Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd');
  require_(deadline>=start,'Hạn hoàn thành phải từ ngày bắt đầu trở đi.');
  if(task.docId)require_(rows_(CONFIG.SHEET_NAMES.DOCUMENTS).some(d=>d['Số Hiệu']===task.docId),'Văn bản không tồn tại.');
  const id=uniqueId_('CV');
  saveRow_(CONFIG.SHEET_NAMES.TASKS,{'Mã CV':id,'Tiêu Đề Công Việc':task.title,'Loại Công Việc':safeText_(task.type),'Người Giao':auth.name,'Người Phụ Trách':assignee['Họ và Tên'],'Mã NV Phụ Trách':assignee['Mã NV'],'Ngày Bắt Đầu':start,'Hạn Chót':deadline,'Ngày Hoàn Thành':'','Trạng Thái':'Đang xử lý','Đánh Giá':'','Ghi Chú':safeText_(task.note),'Mã Văn Bản':task.docId||''});
  return {success:true,newId:id,message:'Đã giao việc.'};
}
function updateTaskStatus_(id,status,evaluation) {
  const auth=authorized_();
  const row=rows_(CONFIG.SHEET_NAMES.TASKS).find(r=>r['Mã CV']===id);
  require_(row,'Không tìm thấy công việc.');
  require_(auth.role==='manager'||row['Mã NV Phụ Trách']===auth.empId,'Bạn chỉ được cập nhật công việc được giao.');
  require_(['Đang xử lý','Hoàn thành'].includes(status),'Trạng thái không hợp lệ.');
  saveRow_(CONFIG.SHEET_NAMES.TASKS,{'Trạng Thái':status,'Ngày Hoàn Thành':status==='Hoàn thành'?Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd'):'','Đánh Giá':auth.role!=='manager'?row['Đánh Giá']:safeText_(evaluation)},row._rowIndex);
  return {success:true,message:'Đã cập nhật trạng thái công việc.'};
}
function documentFields_(doc,old) {
  const auth=authorized_(['manager','hr']);
  const salaryTypes=['Quy chế lương','Thông báo trả lương','Quyết định điều chỉnh lương'];
  require_(auth.role==='manager' || (salaryTypes.includes(doc.type) && (!old || salaryTypes.includes(old['Loại Văn Bản']))), 'Kế toán chỉ quản lý văn bản tiền lương.');
  require_(safeText_(doc.id,120)&&safeText_(doc.title,300),'Nhập số hiệu và tiêu đề văn bản.');
  require_(['Hiệu lực','Hết hiệu lực','Dự thảo','Tài liệu tham khảo'].includes(doc.status),'Trạng thái không hợp lệ.');
  const date=date_(doc.date).toISOString().slice(0,10);
  let url=String(doc.fileUrl||'').trim();
  if(doc.fileData)url=uploadAttachment_(doc.fileData,'VanBan',doc.id);
  else if(!old||url!==old['Link Tài Liệu']) require_(/^https:\/\//i.test(url),'Chọn tệp hoặc nhập liên kết HTTPS hợp lệ.');
  return {'Số Hiệu':doc.id,'Tiêu Đề Văn Bản':doc.title,'Loại Văn Bản':safeText_(doc.type),'Cơ Quan Ban Hành':safeText_(doc.issuer),'Ngày Ban Hành':date,'Người Ký':safeText_(doc.signer||authorized_().name),'Link Tài Liệu':url,'Trạng Thái':doc.status,'Lĩnh Vực':safeText_(doc.category)};
}
function saveDocument_(doc) {
  authorized_(['manager','hr']);
  require_(!rows_(CONFIG.SHEET_NAMES.DOCUMENTS).some(r=>r['Số Hiệu']===doc.id),'Số hiệu đã tồn tại. Hãy dùng chức năng sửa.');
  const fields=documentFields_(doc,null);saveRow_(CONFIG.SHEET_NAMES.DOCUMENTS,fields);
  return {success:true,newId:doc.id,fileUrl:fields['Link Tài Liệu'],message:'Đã lưu văn bản.'};
}
function updateDocument_(doc) {
  authorized_(['manager','hr']);
  const row=rows_(CONFIG.SHEET_NAMES.DOCUMENTS).find(r=>r['Số Hiệu']===doc.id);
  require_(row,'Văn bản không tồn tại.');
  const fields=documentFields_(doc,row);saveRow_(CONFIG.SHEET_NAMES.DOCUMENTS,fields,row._rowIndex);
  return {success:true,fileUrl:fields['Link Tài Liệu'],message:'Đã cập nhật văn bản.'};
}
function uploadAttachment_(file,kind,id) {
  require_(file&&typeof file.base64==='string','Vui lòng chọn tệp đính kèm.');
  const ext=String(file.name||'').split('.').pop().toLowerCase();
  require_((kind==='ChungTu'?['pdf','png','jpg','jpeg']:['pdf','png','jpg','jpeg','doc','docx','xls','xlsx']).includes(ext),'Định dạng tệp không được hỗ trợ.');
  const raw=file.base64.replace(/^data:[^;]+;base64,/,'');
  require_(raw.length<=14*1024*1024&&/^[A-Za-z0-9+/]*={0,2}$/.test(raw),'Tệp quá lớn hoặc dữ liệu không hợp lệ.');
  const bytes=Utilities.base64Decode(raw);
  require_(bytes.length>0&&bytes.length<=10*1024*1024,'Tệp phải từ 1 byte đến 10 MB.');
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('UPLOAD_FOLDER_ID');
  let folder;
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder('VinTech Upload Files');
    props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  }
  const mime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[ext];
  const created=folder.createFile(Utilities.newBlob(bytes,mime,safeText_(file.name,180)));
  // Files stay private; the authorized RPC supplies their bytes.
  return 'drive:'+created.getId();
}
function readAttachment_(kind,id) {
  const auth=authorized_();
  require_(['doc','sick'].includes(kind),'Loại tài liệu không hợp lệ.');
  const row=rows_(kind==='doc'?CONFIG.SHEET_NAMES.DOCUMENTS:CONFIG.SHEET_NAMES.SICK).find(r=>(r['Số Hiệu']||r['Mã Hồ Sơ'])===id);
  require_(row,'Không tìm thấy tài liệu.');
  if(kind==='sick')ownRecord_(row,auth);
  const url=row['Link Tài Liệu']||row['Chứng Từ URL'];
  if(String(url).startsWith('demo:')) {
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const text='<!doctype html><html lang="vi"><meta charset="utf-8"><title>Tài liệu mẫu</title><body><h1>'+esc(row['Tiêu Đề Văn Bản']||'Chứng từ thực hành')+'</h1><p>Số hiệu: '+esc(id)+'</p><p>DỮ LIỆU GIẢ LẬP — chỉ phục vụ thực hành, không phải văn bản pháp luật hoặc chứng từ y tế thật.</p><p>Tình huống: nhân viên gửi hồ sơ, HR kiểm tra, yêu cầu bổ sung và phê duyệt; sau đó đối chiếu bảng công và phiếu lương cùng kỳ.</p></body></html>';
    return {success:true,fileName:'Tai_lieu_mau.html',mimeType:'text/html',content:Utilities.base64Encode(Utilities.newBlob(text).getBytes())};
  }
  if(String(url).startsWith('drive:')) {
    const file=DriveApp.getFileById(url.slice(6)),blob=file.getBlob();
    return {success:true,fileName:file.getName(),mimeType:blob.getContentType(),content:Utilities.base64Encode(blob.getBytes())};
  }
  require_(/^https:\/\//i.test(url),'Liên kết không hợp lệ.');
  return {success:true,url:url};
}
