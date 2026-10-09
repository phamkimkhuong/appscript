function saveEmployee_(emp) {
  const auth=authorized_(['manager','hr']);
  require_(/^[A-Za-z0-9_-]{1,80}$/.test(emp.id),'Mã nhân viên chỉ gồm chữ không dấu, số, gạch ngang hoặc gạch dưới.');
  require_(safeText_(emp.id,80)&&safeText_(emp.name,120),'Nhập mã và tên nhân viên.');
  require_(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email),'Email không hợp lệ.');
  require_(['employee','manager','hr'].includes(emp.role),'Vai trò không hợp lệ.');
  require_(Number.isFinite(Number(emp.salary))&&Number(emp.salary)>=0,'Lương không hợp lệ.');
  const users=rows_(CONFIG.SHEET_NAMES.USERS),old=users.find(u=>u['Mã NV']===emp.id);
  require_(emp.mode!=='add'||!old,'Mã nhân viên đã tồn tại.');
  require_(emp.mode!=='edit'||old,'Không tìm thấy nhân viên cần sửa.');
  require_(!users.some(u=>u['Mã NV']!==emp.id&&String(u['Email']).toLowerCase()===emp.email.toLowerCase()),'Email đã tồn tại.');
  if(old&&old['Mã NV']===auth.empId)require_(emp.role===auth.role&&emp.status!=='Đã nghỉ việc'&&emp.email.toLowerCase()===REQUEST_CONTEXT_.email,'Không đổi vai trò, email hoặc khóa chính tài khoản đang dùng.');
  const fields={'Mã NV':emp.id,'Họ và Tên':emp.name,'Phòng Ban':safeText_(emp.dept),'Chức Vụ':safeText_(emp.title),'Vai Trò':emp.role,'Lương Cơ Bản':Number(emp.salary),'Email':emp.email.toLowerCase(),'Trạng Thái':emp.status||'Đang làm việc','Ngày Vào Làm':emp.startDate?date_(emp.startDate).toISOString().slice(0,10):Utilities.formatDate(new Date(),CONFIG.TIMEZONE,'yyyy-MM-dd'),'Số Điện Thoại':safeText_(emp.phone)};
  if(old)rows_(CONFIG.SHEET_NAMES.TASKS).filter(t=>t['Mã NV Phụ Trách']===old['Mã NV']).forEach(t=>saveRow_(CONFIG.SHEET_NAMES.TASKS,{'Người Phụ Trách':emp.name},t._rowIndex));
  if(old&&Number(old['Lương Cơ Bản'])!==Number(emp.salary))rows_(CONFIG.SHEET_NAMES.PAYROLL).filter(p=>p['Mã NV']===emp.id).forEach(p=>saveRow_(CONFIG.SHEET_NAMES.PAYROLL,{'Trạng Thái':'Cần tính lại'},p._rowIndex));
  if(!old)fields['Mật Khẩu']='123456';
  saveRow_(CONFIG.SHEET_NAMES.USERS,fields,old&&old._rowIndex);
  return {success:true,newId:emp.id,message:'Đã lưu nhân viên trong lượt demo.'};
}
function deleteEmployee_(id) {
  const auth=authorized_(['manager','hr']);require_(id!==auth.empId,'Không khóa tài khoản đang sử dụng.');
  const row=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>u['Mã NV']===id);require_(row,'Không tìm thấy nhân viên.');
  saveRow_(CONFIG.SHEET_NAMES.USERS,{'Trạng Thái':'Đã nghỉ việc'},row._rowIndex);
  return {success:true,message:'Đã khóa nhân viên.'};
}
