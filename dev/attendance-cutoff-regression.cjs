const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
const {createRuntime}=require('./gas-runtime.cjs'),{fixedDate}=require('./test-clock.cjs');
const runtime=createRuntime({crypto:webcrypto});
const server=vm.createContext({...runtime,Date:fixedDate('2026-10-09T05:00:00Z')});
for(const file of ['Config','Domain','Database','Auth','Attendance','Payroll','Leave','SickLeave','TasksAndDocs','Employee'])vm.runInContext(fs.readFileSync(file+'.js','utf8'),server);
const login=email=>{const r=server.apiLogin(email,'123456');assert(r.success,r.message);return r;};
const manager=login('tri.tran@vintech.vn'),hr=login('huong.nguyen@vintech.vn');
const rpc=(who,action,...args)=>server.apiRequest(who.token,action,args);
const attendance=period=>{const r=rpc(hr,'apiGetAttendance',period);assert(r.success,r.message);return r;};
const tables=runtime.state.sheets[vm.runInContext('CONFIG.DEFAULT_SPREADSHEET_ID',server)];
const table=Object.values(tables).find(rows=>rows[0][0]==='Mã Kỳ Công');
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
check('October 9 has seven actual days, zero future OT and scheduled sick leave',()=>{
 const d=attendance('10/2026');assert.equal(d.cutoff,9);assert.equal(d.asOf,'2026-10-09');
 for(const days of Object.values(d.timesheet)){assert.equal(days.filter(v=>v==='X').length,7);assert(days.slice(9).every(v=>['','T7','CN'].includes(v)));}
 assert.equal(d.plannedTimesheet['VT-004'][11],'O');assert.equal(d.timesheet['VT-004'][11],'');
 assert.equal(server.monthDays_('10/2026').standardWorkingDays,22);
});
check('future direct entry is rejected without changing data',()=>{
 const before=JSON.stringify(tables);
 for(const symbol of ['X','OT','P','O','K'])assert.equal(rpc(manager,'apiUpdateAttendanceCell','VT-001',12,symbol,'','10/2026').success,false);
 assert.equal(JSON.stringify(tables),before);
 assert.equal(rpc(manager,'apiUpdateAttendanceCell','VT-001',9,'X','','10/2026').success,true);
});
check('opening new periods does not manufacture attendance',()=>{
 for(const period of ['07/2026','12/2026'])assert(attendance(period).timesheet['VT-001'].every(v=>['','T7','CN'].includes(v)));
 assert.equal(attendance('11/2026').cutoff,0);
});
check('legacy future work is removed from storage and does not become actual tomorrow',()=>{
 const row=table.find(row=>row[0]==='10/2026'&&row[1]==='VT-001');
 row[4+9]='OT';row[4+11]='X';
 const d=attendance('10/2026');assert.equal(d.timesheet['VT-001'][9],'T7');
 assert.equal(row[4+9],'T7');assert.equal(row[4+11],'');
 server.Date=fixedDate('2026-10-12T05:00:00Z');
 assert.equal(attendance('10/2026').timesheet['VT-001'][11],'');
 server.Date=fixedDate('2026-10-09T05:00:00Z');
});
check('current payroll and saved legacy snapshot use actual days only',()=>{
 const result=rpc(hr,'apiCalculateMonthlyPayroll','10/2026');assert(result.success,result.message);
 const p=result.payroll.find(p=>p.empId==='VT-001'&&p.period==='10/2026');assert.equal(p.actualDays,7);assert.equal(p.otDays,0);assert.equal(p.standardDays,22);
 assert.equal(p.salaryByDays,Math.round(p.baseSalary*7/22));assert.match(p.status,/Tạm tính đến 09\/10\/2026/);
 const payroll=Object.values(tables).find(rows=>rows[0][0]==='Mã Kỳ Lương');const stored=payroll.find(row=>row[0]==='10/2026'&&row[1]==='VT-001');
 stored[payroll[0].indexOf('Công Thực')]=22;stored[payroll[0].indexOf('Thực Lĩnh')]=99999999;
 const loaded=rpc(hr,'apiGetPayrollData').data.find(p=>p.empId==='VT-001'&&p.period==='10/2026');assert.equal(loaded.actualDays,7);assert.notEqual(loaded.netSalary,99999999);
});
check('approved future leave is planned until its date and historical months remain intact',()=>{
 const leave=rpc(hr,'apiSubmitLeave',{from:'2026-10-14',to:'2026-10-14',type:'Nghỉ phép năm',reason:'Test'});assert(leave.success,leave.message);
 assert.equal(rpc(manager,'apiApproveLeave',leave.newId).success,true);
 let d=attendance('10/2026');assert.equal(d.timesheet['VT-003'][13],'');assert.equal(d.plannedTimesheet['VT-003'][13],'P');
 rpc(hr,'apiCalculateMonthlyPayroll','10/2026');let p=rpc(hr,'apiGetPayrollData').data.find(p=>p.empId==='VT-003'&&p.period==='10/2026');assert.equal(p.paidLeaveDays,0);
 server.Date=fixedDate('2026-10-14T05:00:00Z');d=attendance('10/2026');assert.equal(d.timesheet['VT-003'][13],'P');assert.equal(d.plannedTimesheet['VT-003'][13],'');
 assert.equal(attendance('09/2026').timesheet['VT-001'].filter(v=>v==='X').length,22);
});
check('cutoffs respect Vietnam midnight, new years and leap February',()=>{
 server.Date=fixedDate('2026-10-09T16:59:59Z');assert.equal(server.attendanceCutoff_('10/2026'),9);
 server.Date=fixedDate('2026-10-09T17:00:00Z');assert.equal(server.attendanceCutoff_('10/2026'),10);
 server.Date=fixedDate('2026-12-31T17:00:00Z');assert.equal(server.attendanceCutoff_('01/2027'),1);assert.equal(server.attendanceCutoff_('12/2026'),31);
 server.Date=fixedDate('2028-02-29T17:00:00Z');assert.equal(server.attendanceCutoff_('02/2028'),29);
});
console.log(count+' attendance cutoff checks passed.');
