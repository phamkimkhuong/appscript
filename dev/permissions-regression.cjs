const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
const {createRuntime}=require('./gas-runtime.cjs');
const runtime=createRuntime({crypto:webcrypto}),server=vm.createContext({...runtime,Date:require('./test-clock.cjs').fixedDate('2026-10-09T05:00:00Z')});
for(const file of ['Config','Domain','Database','Auth','Attendance','Payroll','Leave','SickLeave','TasksAndDocs','Employee'])vm.runInContext(fs.readFileSync(file+'.js','utf8'),server);
const login=email=>{const r=server.apiLogin(email,'123456');assert(r.success,r.message);return r;};
const manager=login('tri.tran@vintech.vn'),accountant=login('huong.nguyen@vintech.vn'),employee=login('phuong.le@vintech.vn');
const rpc=(who,action,...args)=>server.apiRequest(who.token,action,args);
const data=who=>rpc(who,'apiGetInitialAppData','','10/2026').data;
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
check('accountant cannot mutate management data even through direct API calls',()=>{
 const before=JSON.stringify(runtime.state.sheets);
 for(const [action,args] of [
 ['apiApproveLeave',['LV-2610-01']],['apiRejectLeave',['LV-2610-01','reason']],
 ['apiApproveSick',['SC-2610-02']],['apiRejectSick',['SC-2610-02','reason']],['apiAskMoreInfoSick',['SC-2610-02','reason']],
 ['apiSaveEmployee',[{id:'VT-NEW',name:'Demo',email:'demo@example.test',title:'Nhân viên',salary:1000}]],['apiDeleteEmployee',['VT-001']],
 ['apiUpdateAttendanceCell',['VT-001',1,'K','','10/2026']],
 ['apiSaveTask',[{title:'Forbidden',assigneeId:'VT-001',startDate:'2026-10-01',deadline:'2026-10-12'}]],
 ['apiUpdateTaskStatus',['CV-101','Hoàn thành']],['apiResetDatabase',[]],
 ['apiSubmitLeave',[{empId:'VT-001',from:'2026-10-26',to:'2026-10-26',type:'Việc riêng',reason:'Other'}]]
 ])assert.equal(rpc(accountant,action,...args).success,false,action);
 assert.equal(JSON.stringify(runtime.state.sheets),before);
});
check('accountant reads all payroll and attendance but only own leave, sick and tasks',()=>{
 const d=data(accountant);assert(d.payroll.length>2);assert(Object.keys(d.timesheet).length>1);
 assert(d.tasks.length>0);assert(d.tasks.every(t=>t.assigneeId==='VT-003'));
 assert(d.leaves.every(r=>r.empId==='VT-003'));assert(d.sickCases.every(r=>r.empId==='VT-003'));
 assert.equal(rpc(accountant,'apiReadAttachment','sick','SC-2610-01').success,false);
});
check('accountant can calculate payroll and update own assigned task',()=>{
 assert.equal(rpc(accountant,'apiCalculateMonthlyPayroll','09/2026').success,true);
 assert.equal(rpc(manager,'apiCalculateMonthlyPayroll','09/2026').success,false);
 assert.equal(rpc(employee,'apiCalculateMonthlyPayroll','09/2026').success,false);
 assert.equal(rpc(accountant,'apiUpdateTaskStatus','CV-102','Hoàn thành','Injected evaluation').success,true);
});
check('accountant documents are limited by both original and submitted types',()=>{
 const doc={id:'ROLE-DOC',title:'Salary',type:'Thông báo trả lương',date:'2026-10-09',status:'Hiệu lực',fileUrl:'https://example.com/demo.pdf'};
 assert.equal(rpc(accountant,'apiSaveDocument',doc).success,true);
 assert.equal(rpc(accountant,'apiUpdateDocument',{...doc,title:'Salary updated'}).success,true);
 assert.equal(rpc(accountant,'apiUpdateDocument',{...doc,type:'Thông báo'}).success,false);
 assert.equal(rpc(accountant,'apiSaveDocument',{...doc,id:'ROLE-BAD',type:'Thông báo'}).success,false);
 const general=data(accountant).documents.find(d=>d.type==='Quy chế nội bộ');
 assert.equal(rpc(accountant,'apiUpdateDocument',{...general,type:'Quy chế lương'}).success,false);
 assert.equal(rpc(employee,'apiSaveDocument',{...doc,id:'EMP-DOC'}).success,false);
 assert.equal(rpc(manager,'apiSaveDocument',{...doc,id:'MGR-DOC',type:'Thông báo'}).success,true);
});
check('accountant personal leave and sick follow manager approval and attendance sync',()=>{
 const form={from:'2026-10-26',to:'2026-10-26',type:'Việc riêng',reason:'Personal'};
 const leave=rpc(accountant,'apiSubmitLeave',form);assert(leave.success,leave.message);
 assert(data(accountant).leaves.some(r=>r.id===leave.newId));
 assert.equal(rpc(manager,'apiApproveLeave',leave.newId).success,true);
 assert.equal(data(accountant).timesheet['VT-003'][25],'');
 assert.equal(data(accountant).plannedTimesheet['VT-003'][25],'K');
 const sick=rpc(accountant,'apiSubmitSick',{hospital:'Demo',from:'2026-10-27',to:'2026-10-27',fileData:{name:'demo.pdf',base64:Buffer.from('demo').toString('base64')}});assert(sick.success,sick.message);
 assert.equal(rpc(manager,'apiAskMoreInfoSick',sick.newId,'Bổ sung').success,true);
 assert.equal(rpc(accountant,'apiResubmitSick',sick.newId,{hospital:'Demo',from:'2026-10-27',to:'2026-10-27',fileData:{name:'demo.pdf',base64:Buffer.from('updated').toString('base64')}}).success,true);
 assert.equal(rpc(manager,'apiApproveSick',sick.newId).success,true);
 assert.equal(data(accountant).timesheet['VT-003'][26],'');
 assert.equal(data(accountant).plannedTimesheet['VT-003'][26],'O');
 assert.equal(rpc(employee,'apiApproveLeave',leave.newId).success,false);
});
console.log(count+' role permission checks passed.');
