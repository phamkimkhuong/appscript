const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {webcrypto} = require('crypto');
const {createRuntime} = require('./gas-runtime.cjs');
const runtime = createRuntime({crypto:webcrypto});
let calls = {}, lockBusy = false, lockAttempts = 0, releases = 0;
const formats = [];
function instrument(target) {
  if (!target || typeof target !== 'object') return target;
  return new Proxy(target, {get(obj, key) {
    const member = obj[key];
    if (typeof member !== 'function') return member;
    return (...args) => {
      calls[key] = (calls[key] || 0) + 1;
      const result = member.apply(obj, args);
      if (key === 'getRange') formats.push(args);
      return instrument(result);
    };
  }});
}
const context = vm.createContext({...runtime,Date:require('./test-clock.cjs').fixedDate('2026-10-09T05:00:00Z'),
  SpreadsheetApp:instrument(runtime.SpreadsheetApp),
  LockService:{getScriptLock:()=>({tryLock(){lockAttempts++;return !lockBusy;},releaseLock(){releases++;}})}
});
for (const file of ['Config','Domain','Database','Auth','Attendance','Payroll','Leave','SickLeave','TasksAndDocs','Employee']) {
  vm.runInContext(fs.readFileSync(file+'.js','utf8'),context,{filename:file+'.js'});
}
let count=0;
function check(name, fn) {fn();count++;console.log('PASS',name);}
const login = () => context.apiLogin('phuong.le@vintech.vn','123456');
let session;
check('invalid credentials create no spreadsheet',()=>{
  assert.equal(context.apiLogin('phuong.le@vintech.vn','wrong').success,false);
  assert.equal(calls.create || 0,0);
});
check('login connects directly to central database without creating spreadsheets',()=>{
  calls={};lockBusy=true;session=login();
  assert.equal(session.success,true,session.message);
  assert.equal(calls.create || 0,0);
  assert.equal(calls.openById,1);
  assert.equal(calls.getValues,1);
  console.log('Central database login Sheets method counts:',JSON.stringify(calls));
  lockBusy=false;
});
check('subsequent login reads users without rewriting seed data or creating files',()=>{
  calls={};const result=login();
  assert.equal(result.success,true,result.message);
  assert.equal(calls.create || 0,0);assert.equal(calls.setValues || 0,0);
  assert.equal(calls.getValues,1);
});
check('initial dashboard reads each table once and scopes data',()=>{
  calls={};const result=context.apiRequest(session.token,'apiGetInitialAppData',['','10/2026']);
  assert.equal(result.success,true,result.message);
  assert.equal(calls.getValues,7);assert.equal(calls.setValues || 0,0);
  assert.equal(result.data.payroll.length,2);
  assert(result.data.tasks.every(task=>task.assigneeId==='VT-001'));
});
check('cache does not survive RPCs or hide account locking',()=>{
  const ssId = vm.runInContext('CONFIG.DEFAULT_SPREADSHEET_ID', context);
  const users = runtime.state.sheets[ssId].Users;
  const table = users || Object.values(runtime.state.sheets[ssId]).find(rows=>rows[0].includes('Mật Khẩu'));
  const headers = table[0], row = table.find(row=>row.includes('phuong.le@vintech.vn'));
  row[headers.indexOf('Trạng Thái')]='Đã nghỉ việc';
  assert.equal(context.apiRequest(session.token,'apiGetInitialAppData',['','10/2026']).success,false);
  row[headers.indexOf('Trạng Thái')]='Đang làm việc';
});
check('read operations never wait for LockService even when lock is busy',()=>{
  lockBusy = true; lockAttempts = 0;
  const readRes = context.apiRequest(session.token,'apiGetAttendance',['10/2026']);
  assert.equal(readRes.success, true);
  assert.equal(lockAttempts, 0);
  lockBusy = false;
});
console.log(count+' login performance checks passed (centralized database model).');
