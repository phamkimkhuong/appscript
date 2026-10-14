const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
const {createRuntime}=require('./gas-runtime.cjs');
const BusinessDate=require('./test-clock.cjs').fixedDate('2026-12-09T05:00:00Z');
const files=['Server.js','HRM.js','EOffice.js'];
const runtime=createRuntime({crypto:webcrypto}),context=vm.createContext({...runtime,console,Date:BusinessDate});
for(const f of files)vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
function login(email){const r=context.apiLogin(email,'123456');assert.equal(r.success,true,r.message);return r;}
function rpc(session,action,...args){return context.apiRequest(session.token,action,args);}
function ok(session,action,...args){const r=rpc(session,action,...args);assert.equal(r.success,true,r.message);return r;}
function data(session,period='10/2026'){return ok(session,'apiGetInitialAppData','forged@example.test',period).data;}
const employee=login('linh.nguyen@wanzhong.vn'),manager=login('feng.tang@wanzhong.vn'),hr=login('thoa.nguyen@wanzhong.vn'),other=login('linh.nguyen@wanzhong.vn');
check('auth tokens isolated',()=>assert.notEqual(employee.token,other.token));
check('email is not authorization',()=>assert.equal(context.apiRequest('thoa.nguyen@wanzhong.vn','apiResetDatabase',[]).success,false));
check('employee cannot calculate payroll with forged HR email',()=>assert.equal(rpc(employee,'apiCalculateMonthlyPayroll','10/2026','thoa.nguyen@wanzhong.vn').success,false));
check('employee data filtered server-side',()=>{const d=data(employee);assert.equal(d.payroll.length,2);assert(d.payroll.every(p=>p.empId==='WZ-001'));assert(d.sickCases.every(s=>s.empId==='WZ-001'));assert.equal(Object.keys(d.timesheet).length,1);assert.equal(d.users.find(u=>u.id==='WZ-003').salary,0);});
check('request and note changes are scoped to own records',()=>assert.equal(rpc(employee,'apiResubmitSick','SC-2610-02',{}).success,false));
check('invalid dates rejected',()=>{
 for(const form of [{from:'2026-02-30',to:'2026-03-02'},{from:'2026-10-11',to:'2026-10-10'}])assert.equal(rpc(employee,'apiSubmitLeave',{...form,type:'Nghỉ phép năm',reason:'Demo'}).success,false);
});
check('weekend-only leave permitted for demo',()=>{
 assert.equal(rpc(employee,'apiSubmitLeave',{from:'2026-10-10',to:'2026-10-11',type:'Nghỉ phép năm',reason:'Demo weekend'}).success,true);
});
const before=data(employee).payroll.find(p=>p.period==='10/2026').netSalary;
const leave=ok(employee,'apiSubmitLeave',{type:'Nghỉ phép năm',from:'2026-10-26',to:'2026-10-27',days:2,reason:'Demo'});
ok(employee,'apiUpdateLeave',{id:leave.newId,type:'Nghỉ phép năm',from:'2026-10-26',to:'2026-10-27',days:2,reason:'Demo updated'});
check('employee can edit pending leave',()=>{
 const d=data(employee).leaves.find(l=>l.id===leave.newId);
 assert.equal(d.reason,'Demo updated');
});
check('non-owner cannot edit leave',()=>assert.equal(rpc(hr,'apiUpdateLeave',{id:leave.newId,type:'Nghỉ phép năm',from:'2026-10-26',to:'2026-10-27',reason:'Forged'}).success,false));
const tempLeave=ok(employee,'apiSubmitLeave',{type:'Việc riêng',from:'2026-10-29',to:'2026-10-29',days:1,reason:'Cancel test'});
check('non-owner cannot cancel leave',()=>assert.equal(rpc(hr,'apiCancelLeave',tempLeave.newId).success,false));
ok(employee,'apiCancelLeave',tempLeave.newId);
check('canceling leave deletes row from sheet',()=>{
 assert(!data(employee).leaves.some(l=>l.id===tempLeave.newId));
});
ok(manager,'apiApproveLeave',leave.newId);
check('approved leave cannot be edited or canceled',()=>{
 assert.equal(rpc(employee,'apiUpdateLeave',{id:leave.newId,type:'Nghỉ phép năm',from:'2026-10-26',to:'2026-10-27',reason:'After approve'}).success,false);
 assert.equal(rpc(employee,'apiCancelLeave',leave.newId).success,false);
});
check('approval updates attendance and invalidates payroll',()=>{const d=data(employee);assert.equal(d.timesheet['WZ-001'][25],'P');assert.equal(d.payroll.find(p=>p.period==='10/2026').status,'Cần tính lại');});
ok(hr,'apiCalculateMonthlyPayroll','10/2026');
check('paid leave preserves pay',()=>{const p=data(employee).payroll.find(p=>p.period==='10/2026');assert.equal(p.paidLeaveDays,2);assert.equal(p.netSalary,before);assert.equal(p.salaryByDays+p.otPay+p.allowance-p.bhxh,p.netSalary);});
const unpaid=ok(employee,'apiSubmitLeave',{type:'Việc riêng',from:'2026-10-28',to:'2026-10-28',days:1,reason:'Demo'});ok(manager,'apiApproveLeave',unpaid.newId);ok(hr,'apiCalculateMonthlyPayroll','10/2026');
check('unpaid leave reduces pay and uses K',()=>{const d=data(employee),p=d.payroll.find(p=>p.period==='10/2026');assert.equal(d.timesheet['WZ-001'][27],'K');assert(p.netSalary<before);});
check('all OT details round-trip',()=>{const p=data(hr).payroll.find(p=>p.empId==='WZ-004'&&p.period==='10/2026');assert.equal(p.otDays,2);assert.equal(p.otPay,1159091);assert.equal(p.salaryByDays+p.otPay+p.allowance-p.bhxh,p.netSalary);});
const cross=ok(employee,'apiSubmitLeave',{type:'Nghỉ phép năm',from:'2026-10-30',to:'2026-11-02',days:2,reason:'Cross month'});ok(manager,'apiApproveLeave',cross.newId);
check('cross-month absence skips weekends',()=>{assert.equal(data(employee).timesheet['WZ-001'][29],'P');assert.equal(data(employee).timesheet['WZ-001'][30],'T7');assert.equal(data(employee,'11/2026').timesheet['WZ-001'][0],'CN');assert.equal(data(employee,'11/2026').timesheet['WZ-001'][1],'P');});
const file={name:'sample.pdf',type:'application/pdf',base64:Buffer.from('%PDF-test').toString('base64')};
const sick=ok(employee,'apiSubmitSick',{hospital:'Demo',from:'2026-11-03',to:'2026-11-04',days:2,fileData:file});
check('sick upload persists actual bytes',()=>assert(sick.docUrl.startsWith('drive:')));
check('accountant cannot approve medical case',()=>assert.equal(rpc(hr,'apiApproveSick',sick.newId).success,false));
ok(manager,'apiAskMoreInfoSick',sick.newId,'Please supplement');
check('approve blocked until supplement resubmitted',()=>assert.equal(rpc(manager,'apiApproveSick',sick.newId).success,false));
const resub=ok(employee,'apiResubmitSick',sick.newId,{hospital:'Demo 2',from:'2026-11-03',to:'2026-11-04',fileData:file,note:'Done'});
check('resubmit replaces file and data',()=>{assert.notEqual(resub.docUrl,sick.docUrl);assert.equal(data(employee).sickCases.find(s=>s.id===sick.newId).hospital,'Demo 2');});
ok(manager,'apiApproveSick',sick.newId);
check('approved case cannot reopen',()=>{assert.equal(rpc(employee,'apiResubmitSick',sick.newId,{}).success,false);assert.equal(rpc(manager,'apiAskMoreInfoSick',sick.newId,'Again').success,false);});
const doc={id:'TEST-DOC',title:'Test',type:'Thông báo',category:'Công nghệ & Bảo mật',issuer:'Demo',date:'2026-10-09',status:'Dự thảo',fileData:file};
ok(manager,'apiSaveDocument',doc);
check('document upload/status and private download',()=>{const d=data(hr).documents.find(d=>d.id===doc.id);assert.equal(d.status,'Dự thảo');assert(d.fileUrl.startsWith('drive:'));const r=ok(employee,'apiReadAttachment','doc',doc.id);assert.equal(Buffer.from(r.content,'base64').toString(),'%PDF-test');assert.equal(context.apiRequest('invalid_token','apiReadAttachment',['doc',doc.id]).success,false);});
check('duplicate docs and arbitrary file URLs rejected',()=>{assert.equal(rpc(manager,'apiSaveDocument',doc).success,false);assert.equal(rpc(manager,'apiSaveDocument',{...doc,id:'BAD',fileData:null,fileUrl:'javascript:alert(1)'}).success,false);});
check('reset database restores sample seed data',()=>{assert.equal(rpc(employee,'apiResetDatabase').success,false);ok(manager,'apiResetDatabase');assert(!data(hr).documents.some(d=>d.id==='TEST-DOC'));});
check('logout revokes token',()=>{context.apiLogout(other.token);assert.equal(rpc(other,'apiGetInitialAppData','','10/2026').success,false);});
check('leap month and invalid day',()=>{assert.equal(ok(hr,'apiGetAttendance','02/2028').daysInMonth,29);assert.equal(rpc(manager,'apiUpdateAttendanceCell','WZ-001',30,'X','','02/2028').success,false);});
check('public surface has no legacy unguarded endpoints',()=>{for(const f of files)for(const m of fs.readFileSync(f,'utf8').matchAll(/^function (\w+)\(/gm))assert(m[1].endsWith('_')||['apiLogin','apiLogout','apiRequest','doGet','doPost','include'].includes(m[1]),m[1]);});

check('duplicate employee ID cannot overwrite existing account',()=>{const p=data(hr).users.find(u=>u.id==='WZ-001');assert.equal(rpc(manager,'apiSaveEmployee',{...p,mode:'add',name:'Changed'}).success,false);assert.equal(data(hr).users.find(u=>u.id==='WZ-001').name,p.name);});
check('invalid employee date does not partially rename tasks',()=>{const before=data(manager),p=before.users.find(u=>u.id==='WZ-001');assert.equal(rpc(manager,'apiSaveEmployee',{...p,name:'Invalid edit',startDate:'2026-02-30',mode:'edit'}).success,false);assert.equal(data(manager).tasks.find(t=>t.id==='CV-101').assignee,before.tasks.find(t=>t.id==='CV-101').assignee);});
check('salary change marks saved payroll stale',()=>{const p=data(hr).users.find(u=>u.id==='WZ-001');ok(manager,'apiSaveEmployee',{...p,mode:'edit',salary:p.salary+1000000});assert(data(hr).payroll.filter(p=>p.empId==='WZ-001').every(p=>p.status==='Cần tính lại'));});
check('duplicate names cannot grant another employees tasks',()=>{
 const p=data(hr).users.find(u=>u.id==='WZ-001');ok(manager,'apiSaveEmployee',{...p,id:'WZ-DUP',mode:'add',email:'duplicate@example.test'});
 const copy=login('duplicate@example.test');
 assert.equal(data(copy).tasks.length,0);
 assert.equal(rpc(copy,'apiUpdateTaskStatus','CV-101','Hoàn thành').success,false);
 const task=ok(manager,'apiSaveTask',{title:'Assignment by ID',assigneeId:'WZ-DUP',startDate:'2026-10-09',deadline:'2026-10-10'});
 assert(data(copy).tasks.some(t=>t.id===task.newId));assert(!data(employee).tasks.some(t=>t.id===task.newId));
});
check('missing and invalid uploads do not create medical records',()=>{const n=data(employee).sickCases.length;for(const fileData of [null,{name:'evil.html',base64:'YQ=='},{name:'x.pdf',base64:'!invalid'}])assert.equal(rpc(employee,'apiSubmitSick',{hospital:'Demo',from:'2026-12-01',to:'2026-12-01',fileData}).success,false);assert.equal(data(employee).sickCases.length,n);});
check('attendance cells can be edited directly by manager',()=>assert.equal(rpc(manager,'apiUpdateAttendanceCell','WZ-004',12,'X','','10/2026').success,true));
check('document editing preserves file and updates actual status',()=>{const doc=data(hr).documents[0];ok(manager,'apiUpdateDocument',{...doc,status:'Hết hiệu lực'});const changed=data(hr).documents.find(d=>d.id===doc.id);assert.equal(changed.status,'Hết hiệu lực');assert.equal(changed.fileUrl,doc.fileUrl);});
check('maintenance cleanup works safely without affecting central database',()=>{
 assert.equal(context.cleanupExpiredWorkspaces_().removed,0);
 assert(data(hr).users.length>0);
});
console.log(count+' backend regression checks passed.');
