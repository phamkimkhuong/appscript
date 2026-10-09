/** Authenticated demo workspaces; private helpers end with underscore. */
let REQUEST_CONTEXT_ = null;
function demoAccounts_() { return ['phuong.le@vintech.vn','tri.tran@vintech.vn','huong.nguyen@vintech.vn','duy.hoang@vintech.vn','trang.dinh@vintech.vn']; }
function apiLogin(email, password, workspaceKey) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {success:false,message:'Hệ thống đang bận.'};
  try {
    const normalized = String(email || '').trim().toLowerCase();
    const props = PropertiesService.getScriptProperties();
    const raw = workspaceKey && props.getProperty('DEMO_' + workspaceKey);
    let workspace = raw ? JSON.parse(raw) : null;
    if (!workspace || workspace.expiresAt < Date.now()) {
      require_(demoAccounts_().includes(normalized) && password === '123456', 'Email hoặc mật khẩu demo không đúng.');
      workspaceKey = Utilities.getUuid() + Utilities.getUuid();
      const ss = SpreadsheetApp.create('VinTech Demo - ' + workspaceKey.slice(0,8));
      workspace = {id:ss.getId(), createdAt:Date.now(), expiresAt:Date.now()+86400000};
      REQUEST_CONTEXT_ = {ss:ss,workspace:workspace,workspaceKey:workspaceKey,email:normalized};
      resetWorkspace_();
      props.setProperty('DEMO_'+workspaceKey,JSON.stringify(workspace));
    } else {
      REQUEST_CONTEXT_ = {ss:SpreadsheetApp.openById(workspace.id),workspace:workspace,workspaceKey:workspaceKey,email:normalized};
    }
    const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u=>String(u['Email']).toLowerCase()===normalized);
    require_(user && String(user['Mật Khẩu'])===password && user['Trạng Thái']!=='Đã nghỉ việc','Email, mật khẩu hoặc trạng thái tài khoản không hợp lệ.');
    const token = Utilities.getUuid()+Utilities.getUuid();
    CacheService.getScriptCache().put('AUTH_'+token,JSON.stringify({workspaceKey:workspaceKey,email:normalized}),21600);
    return {success:true,profile:profile_(user,true),token:token,workspaceKey:workspaceKey};
  } catch(err) { return {success:false,message:err.message}; }
  finally { REQUEST_CONTEXT_=null; lock.releaseLock(); }
}
function apiLogout(token) { CacheService.getScriptCache().remove('AUTH_'+String(token||'')); return {success:true}; }
function apiRequest(token, action, args) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000)) return {success:false,message:'Hệ thống đang bận.'};
  try {
    const cached=CacheService.getScriptCache().get('AUTH_'+String(token||''));
    require_(cached,'Phiên hết hạn. Vui lòng đăng nhập lại.');
    const session=JSON.parse(cached);
    const raw=PropertiesService.getScriptProperties().getProperty('DEMO_'+session.workspaceKey);
    const workspace=raw&&JSON.parse(raw);
    require_(workspace&&workspace.expiresAt>Date.now(),'Lượt trải nghiệm đã hết hạn. Vui lòng đăng nhập lại.');
    REQUEST_CONTEXT_={ss:SpreadsheetApp.openById(workspace.id),workspace:workspace,workspaceKey:session.workspaceKey,email:session.email};
    authorized_();
    const routes={
      apiGetInitialAppData:initialData_,apiGetAttendance:getAttendance_,apiGetPayrollData:getPayroll_,apiCalculateMonthlyPayroll:calculatePayroll_,
      apiUpdateAttendanceCell:updateAttendance_,apiSubmitLeave:submitLeave_,apiApproveLeave:approveLeave_,apiRejectLeave:rejectLeave_,
      apiSubmitSick:submitSick_,apiApproveSick:approveSick_,apiRejectSick:rejectSick_,apiAskMoreInfoSick:askMoreSick_,apiResubmitSick:resubmitSick_,
      apiSaveDocument:saveDocument_,apiUpdateDocument:updateDocument_,apiSaveTask:saveTask_,apiUpdateTaskStatus:updateTaskStatus_,
      apiSaveEmployee:saveEmployee_,apiDeleteEmployee:deleteEmployee_,apiResetDatabase:resetWorkspace_,apiReadAttachment:readAttachment_
    };
    require_(Object.prototype.hasOwnProperty.call(routes,action),'Thao tác không được hỗ trợ.');
    require_(Array.isArray(args||[]),'Tham số không hợp lệ.');
    return routes[action].apply(null,args||[]);
  } catch(err) { return {success:false,message:err.message}; }
  finally { REQUEST_CONTEXT_=null;lock.releaseLock(); }
}
function verifyUserAuthorization_(ignored,roles) {
  if(!REQUEST_CONTEXT_) return {authorized:false,message:'Chưa đăng nhập.'};
  const user=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>String(u['Email']).toLowerCase()===REQUEST_CONTEXT_.email);
  if(!user||user['Trạng Thái']==='Đã nghỉ việc') return {authorized:false,message:'Tài khoản đã bị khóa.'};
  const role=user['Vai Trò'];
  if(roles&&!roles.includes(role)) return {authorized:false,message:'Bạn không có quyền thực hiện thao tác này.'};
  return {authorized:true,user:user,role:role,name:user['Họ và Tên'],empId:user['Mã NV']};
}
function profile_(u,showSalary) {
  return {id:u['Mã NV'],name:u['Họ và Tên'],email:u['Email'],dept:u['Phòng Ban'],title:u['Chức Vụ'],role:u['Vai Trò'],salary:showSalary?Number(u['Lương Cơ Bản']):0,status:u['Trạng Thái'],startDate:u['Ngày Vào Làm'],phone:u['Số Điện Thoại']};
}
function initialData_(ignored,period) {
  const auth=authorized_(); period=period_(period||'10/2026');
  const users=rows_(CONFIG.SHEET_NAMES.USERS).map(u=>profile_(u,auth.role!=='employee'||u['Mã NV']===auth.empId));
  const visible=r=>auth.role!=='employee'||r['Mã NV']===auth.empId;
  const leaves=rows_(CONFIG.SHEET_NAMES.LEAVE).filter(visible).map(r=>({id:r['Mã Đơn'],empId:r['Mã NV'],empName:r['Họ và Tên'],type:r['Loại Nghỉ'],from:r['Từ Ngày'],to:r['Đến Ngày'],days:Number(r['Số Ngày']),reason:r['Lý Do'],status:r['Trạng Thái'],approvedAt:r['Ngày Duyệt'],approvedBy:r['Người Duyệt']}));
  const sick=rows_(CONFIG.SHEET_NAMES.SICK).filter(visible).map(r=>({id:r['Mã Hồ Sơ'],empId:r['Mã NV'],empName:r['Họ và Tên'],hospital:r['Cơ Sở Y Tế'],from:r['Từ Ngày'],to:r['Đến Ngày'],days:Number(r['Số Ngày']),docUrl:r['Chứng Từ URL'],status:r['Trạng Thái'],note:r['Ghi Chú'],approvedAt:r['Ngày Duyệt'],approvedBy:r['Người Duyệt']}));
  const tasks=rows_(CONFIG.SHEET_NAMES.TASKS).filter(t=>auth.role!=='employee'||t['Mã NV Phụ Trách']===auth.empId).map(t=>({id:t['Mã CV'],title:t['Tiêu Đề Công Việc'],type:t['Loại Công Việc'],assigner:t['Người Giao'],assignee:t['Người Phụ Trách'],assigneeId:t['Mã NV Phụ Trách'],startDate:t['Ngày Bắt Đầu'],deadline:t['Hạn Chót'],doneDate:t['Ngày Hoàn Thành'],status:t['Trạng Thái'],note:t['Ghi Chú'],docId:t['Mã Văn Bản']}));
  const documents=rows_(CONFIG.SHEET_NAMES.DOCUMENTS).map(d=>({id:d['Số Hiệu'],title:d['Tiêu Đề Văn Bản'],type:d['Loại Văn Bản'],issuer:d['Cơ Quan Ban Hành'],date:d['Ngày Ban Hành'],signer:d['Người Ký'],fileUrl:d['Link Tài Liệu'],status:d['Trạng Thái'],category:d['Lĩnh Vực']}));
  return {success:true,data:{users:users,period:period,timesheet:getAttendance_(period).timesheet,leaves:leaves,sickCases:sick,payroll:getPayroll_().data,tasks:tasks,documents:documents}};
}

/** Owner-only maintenance: run manually or attach an owner-created daily trigger. */
function cleanupExpiredWorkspaces_() {
  const lock=LockService.getScriptLock();
  require_(lock.tryLock(30000),'Hệ thống đang bận.');
  let removed=0;
  try {
    const props=PropertiesService.getScriptProperties(),all=props.getProperties();
    for(const key of Object.keys(all).filter(k=>k.startsWith('DEMO_'))) {
      if(removed>=20)break;
      try {
        const workspace=JSON.parse(all[key]);
        if(!workspace.id||!Number.isFinite(workspace.expiresAt)||workspace.expiresAt>=Date.now())continue;
        // Only IDs registered by this app and already expired are eligible.
        DriveApp.getFileById(workspace.id).setTrashed(true);
        if(workspace.folderId)DriveApp.getFolderById(workspace.folderId).setTrashed(true);
        props.deleteProperty(key); removed++;
      } catch(err) { Logger.log('Không dọn được '+key+': '+err.message); }
    }
    return {removed:removed};
  } finally {lock.releaseLock();}
}
