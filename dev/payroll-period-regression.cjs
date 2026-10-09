const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
const {createRuntime}=require('./gas-runtime.cjs'),{fixedDate}=require('./test-clock.cjs');
const runtime=createRuntime({crypto:webcrypto});
const server=vm.createContext({...runtime,Date:fixedDate('2026-10-09T05:00:00Z')});
for(const file of ['Config','Domain','Database','Auth','Attendance','Payroll','Leave','SickLeave','TasksAndDocs','Employee'])vm.runInContext(fs.readFileSync(file+'.js','utf8'),server);
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
const login=server.apiLogin('huong.nguyen@vintech.vn','123456');assert(login.success,login.message);
const rpc=(action,...args)=>server.apiRequest(login.token,action,args);
const ssId = vm.runInContext('CONFIG.DEFAULT_SPREADSHEET_ID', server);
const tables = runtime.state.sheets[ssId];
check('October 9 seeds only September and August payroll with matching attendance',()=>{
 const result=rpc('apiGetInitialAppData','','10/2026');assert(result.success,result.message);
 assert.equal(result.data.defaultPayrollPeriod,'10/2026');
 assert.deepEqual([...new Set(result.data.payroll.map(p=>p.period))].sort(),['08/2026','09/2026']);
 assert(result.data.payrollPeriods.includes('10/2026'));assert(result.data.payrollPeriods.includes('09/2026'));assert(result.data.payrollPeriods.includes('08/2026'));assert(!result.data.payrollPeriods.includes('11/2026'));
 const attendance=Object.values(tables).find(rows=>rows[0][0]==='Mã Kỳ Công');
 for(const p of result.data.payroll){const row=attendance.find(row=>row[0]===p.period&&row[1]===p.empId);assert(row);assert.equal(row.slice(4,35).filter(day=>day==='X').length,p.actualDays);}
});
check('current payroll succeeds and future payroll calculation rejected',()=>{
 const before=JSON.stringify(tables);
 for(const period of ['11/2026','12/2026'])assert.equal(rpc('apiCalculateMonthlyPayroll',period).success,false);
 assert.equal(JSON.stringify(tables),before);
 assert.equal(rpc('apiCalculateMonthlyPayroll','10/2026').success,true);
 assert.equal(rpc('apiCalculateMonthlyPayroll','09/2026').success,true);
});
check('missing historic attendance cannot silently produce a full salary',()=>{
 const before=JSON.stringify(tables);
 assert.equal(rpc('apiCalculateMonthlyPayroll','07/2026').success,false);
 assert.equal(JSON.stringify(tables),before);
});
check('legacy future payroll is hidden without deleting stored rows',()=>{
 const payroll=Object.values(tables).find(rows=>rows[0][0]==='Mã Kỳ Lương');
 const legacy=[...payroll[1]];legacy[0]='11/2026';payroll.push(legacy);
 const result=rpc('apiGetPayrollData');assert(result.success,result.message);
 assert(!result.data.some(p=>p.period==='11/2026'));
 assert(!rpc('apiGetInitialAppData','','10/2026').data.payroll.some(p=>p.period==='11/2026'));
 assert(payroll.some(row=>row[0]==='11/2026'));
});
check('payroll cutoff follows midnight in Vietnam and crosses years',()=>{
 const cases=[['2026-09-30T16:59:59Z','08/2026'],['2026-09-30T17:00:00Z','09/2026'],['2026-12-31T17:00:00Z','12/2026'],['2028-02-29T17:00:00Z','02/2028']];
 for(const [iso,expected] of cases)assert.equal(server.previousPayrollPeriods_(new Date(iso),2)[0],expected);
 assert.equal(server.isCompletedPayrollPeriod_('12/2026','01/2027'),true);
 assert.equal(server.isCompletedPayrollPeriod_('01/2027','01/2027'),true);
 assert.equal(server.isCompletedPayrollPeriod_('02/2027','01/2027'),false);
});
console.log(count+' payroll period checks passed.');
