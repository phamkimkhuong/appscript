/** Authenticated demo workspaces; private helpers end with underscore. */
/** @type {{ ss?: any; email?: string; rows?: Record<string, any>; writeLocked?: boolean } | null} */
let REQUEST_CONTEXT_ = null;
function demoAccounts_() { return ['phuong.le@vintech.vn','tri.tran@vintech.vn','huong.nguyen@vintech.vn','duy.hoang@vintech.vn']; }
function apiLogin(email, password) {
  const startedAt = Date.now(), timing = {};
  const mark = stage => { timing[stage] = Date.now() - startedAt; };
  try {
    const normalized = String(email || '').trim().toLowerCase();
    const ss = getSpreadsheet_();
    REQUEST_CONTEXT_ = { ss: ss, email: normalized, rows: {} };
    mark('openSpreadsheetMs');

    const user = rows_(CONFIG.SHEET_NAMES.USERS).find(u=>String(u['Email']).toLowerCase()===normalized);
    require_(user && String(user['Mật Khẩu'])===password && user['Trạng Thái']!=='Đã nghỉ việc','Email, mật khẩu hoặc trạng thái tài khoản không hợp lệ.');
    const token = Utilities.getUuid()+Utilities.getUuid();
    CacheService.getScriptCache().put('AUTH_'+token,JSON.stringify({email:normalized}),21600);
    mark('totalMs');
    return {success:true,profile:profile_(user,true),token:token};
  } catch(err) { return {success:false,message:err.message}; }
  finally {
    REQUEST_CONTEXT_=null;
    mark('finishedMs');
    Logger.log('apiLogin timing (elapsed ms): ' + JSON.stringify(timing));
  }
}
function apiLogout(token) { CacheService.getScriptCache().remove('AUTH_'+String(token||'')); return {success:true}; }
function apiRequest(token, action, args) {
  const routes={
    apiGetInitialAppData:initialData_,apiGetAttendance:getAttendance_,apiGetPayrollData:getPayroll_,apiCalculateMonthlyPayroll:calculatePayroll_,
    apiUpdateAttendanceCell:updateAttendance_,apiSubmitLeave:submitLeave_,apiApproveLeave:approveLeave_,apiRejectLeave:rejectLeave_,
    apiSubmitSick:submitSick_,apiApproveSick:approveSick_,apiRejectSick:rejectSick_,apiAskMoreInfoSick:askMoreSick_,apiResubmitSick:resubmitSick_,
    apiSaveDocument:saveDocument_,apiUpdateDocument:updateDocument_,apiSaveTask:saveTask_,apiUpdateTaskStatus:updateTaskStatus_,
    apiSaveEmployee:saveEmployee_,apiDeleteEmployee:deleteEmployee_,apiResetDatabase:resetDatabase_,apiReadAttachment:readAttachment_
  };
  require_(Object.prototype.hasOwnProperty.call(routes,action),'Thao tác không được hỗ trợ.');
  require_(Array.isArray(args||[]),'Tham số không hợp lệ.');

  // Chỉ dùng Lock khi ghi dữ liệu (Lưu đơn, Tính lương, Cập nhật trạng thái...). Luồng đọc chạy trực tiếp không chờ khóa.
  const writeActions = [
    'apiCalculateMonthlyPayroll','apiUpdateAttendanceCell','apiSubmitLeave','apiApproveLeave','apiRejectLeave',
    'apiSubmitSick','apiApproveSick','apiRejectSick','apiAskMoreInfoSick','apiResubmitSick',
    'apiSaveDocument','apiUpdateDocument','apiSaveTask','apiUpdateTaskStatus',
    'apiSaveEmployee','apiDeleteEmployee','apiResetDatabase'
  ];
  const isWrite = writeActions.includes(action);
  const lock = isWrite ? LockService.getScriptLock() : null;
  if(lock && !lock.tryLock(30000)) return {success:false,message:'Hệ thống đang bận.'};

  try {
    const cached=CacheService.getScriptCache().get('AUTH_'+String(token||''));
    require_(cached,'Phiên hết hạn. Vui lòng đăng nhập lại.');
    const session=JSON.parse(cached);
    REQUEST_CONTEXT_={ss:getSpreadsheet_(),email:session.email,rows:{},writeLocked:isWrite};
    authorized_();
    return routes[action].apply(null,args||[]);
  } catch(err) { return {success:false,message:err.message}; }
  finally {
    REQUEST_CONTEXT_=null;
    if(lock) { try { lock.releaseLock(); } catch(e) {} }
  }
}
function verifyUserAuthorization_(ignored,roles) {
  if(!REQUEST_CONTEXT_) return {authorized:false,message:'Chưa đăng nhập.'};
  const user=rows_(CONFIG.SHEET_NAMES.USERS).find(u=>String(u['Email']).toLowerCase()===REQUEST_CONTEXT_.email);
  if(!user||user['Trạng Thái']==='Đã nghỉ việc') return {authorized:false,message:'Tài khoản đã bị khóa.'};
  const role=roleFromTitle_(user['Chức Vụ']);
  if(roles&&!roles.includes(role)) return {authorized:false,message:'Bạn không có quyền thực hiện thao tác này.'};
  return {authorized:true,user:user,role:role,name:user['Họ và Tên'],empId:user['Mã NV']};
}
function profile_(u,showSalary) {
  return {id:u['Mã NV'],name:u['Họ và Tên'],email:u['Email'],dept:u['Phòng Ban'],title:u['Chức Vụ'],role:roleFromTitle_(u['Chức Vụ']),salary:showSalary?Number(u['Lương Cơ Bản']):0,status:u['Trạng Thái'],startDate:u['Ngày Vào Làm'],phone:u['Số Điện Thoại']};
}
function initialData_(ignored,period) {
  const auth=authorized_(); period=period_(period||'10/2026');
  const users=rows_(CONFIG.SHEET_NAMES.USERS).map(u=>profile_(u,auth.role!=='employee'||u['Mã NV']===auth.empId));
  const visible=r=>auth.role==='manager'||r['Mã NV']===auth.empId;
  const leaves=rows_(CONFIG.SHEET_NAMES.LEAVE).filter(visible).map(r=>({id:r['Mã Đơn'],empId:r['Mã NV'],empName:r['Họ và Tên'],type:r['Loại Nghỉ'],from:r['Từ Ngày'],to:r['Đến Ngày'],days:Number(r['Số Ngày']),reason:r['Lý Do'],status:r['Trạng Thái'],approvedAt:r['Ngày Duyệt'],approvedBy:r['Người Duyệt']}));
  const sick=rows_(CONFIG.SHEET_NAMES.SICK).filter(visible).map(r=>({id:r['Mã Hồ Sơ'],empId:r['Mã NV'],empName:r['Họ và Tên'],hospital:r['Cơ Sở Y Tế'],from:r['Từ Ngày'],to:r['Đến Ngày'],days:Number(r['Số Ngày']),docUrl:r['Chứng Từ URL'],status:r['Trạng Thái'],note:r['Ghi Chú'],approvedAt:r['Ngày Duyệt'],approvedBy:r['Người Duyệt']}));
  const tasks=rows_(CONFIG.SHEET_NAMES.TASKS).filter(t=>auth.role==='manager'||t['Mã NV Phụ Trách']===auth.empId).map(t=>({id:t['Mã CV'],title:t['Tiêu Đề Công Việc'],type:t['Loại Công Việc'],assigner:t['Người Giao'],assignee:t['Người Phụ Trách'],assigneeId:t['Mã NV Phụ Trách'],startDate:t['Ngày Bắt Đầu'],deadline:t['Hạn Chót'],doneDate:t['Ngày Hoàn Thành'],status:t['Trạng Thái'],note:t['Ghi Chú'],docId:t['Mã Văn Bản']}));
  const documents=rows_(CONFIG.SHEET_NAMES.DOCUMENTS).map(d=>({id:d['Số Hiệu'],title:d['Tiêu Đề Văn Bản'],type:d['Loại Văn Bản'],issuer:d['Cơ Quan Ban Hành'],date:d['Ngày Ban Hành'],signer:d['Người Ký'],fileUrl:d['Link Tài Liệu'],status:d['Trạng Thái'],category:d['Lĩnh Vực']}));
  const payroll = getPayroll_();
  const attendance = getAttendance_(period);
  return {success:true,data:{payrollPeriods:payroll.periods,defaultPayrollPeriod:payroll.defaultPeriod,users:users,period:period,timesheet:attendance.timesheet,attendanceCutoff:attendance.cutoff,attendanceAsOf:attendance.asOf,plannedTimesheet:attendance.plannedTimesheet,leaves:leaves,sickCases:sick,payroll:payroll.data,tasks:tasks,documents:documents}};
}

/** Owner-only maintenance: clean up legacy workspaces if any exist. */
function cleanupExpiredWorkspaces_() {
  return { removed: 0 };
}
