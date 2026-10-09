const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('crypto');
const {createRuntime}=require('./gas-runtime.cjs');
const html=fs.readFileSync('Index.html','utf8')+fs.readFileSync('Modals.html','utf8');
const source=fs.readFileSync('Scripts.html','utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,'');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
check('static DOM references resolve and IDs are unique',()=>{
 assert.equal(new Set(ids).size,ids.length);
 for(const [,id]of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g))assert(ids.includes(id),'Missing #'+id);
});
const nodes=new Map();
function element(id=''){
 const classes=new Set();return {id,value:'',innerHTML:'',innerText:'',textContent:'',disabled:false,style:{},dataset:{},options:[],files:[],
 classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
 addEventListener(){},querySelector(){return element();},querySelectorAll(){return [];},appendChild(){},remove(){},click(){},add(o){this.options.push(o);},reset(){},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];}};
}
ids.forEach(id=>nodes.set(id,element(id)));
const document={getElementById:id=>nodes.get(id)||null,querySelector:()=>element(),querySelectorAll:()=>[],addEventListener(){},createElement:()=>element(),body:element()};
const storage=new Map();const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
let exported=null;const URL={createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}};
const runtime=createRuntime({crypto:webcrypto}),server=vm.createContext({...runtime,Date:require('./test-clock.cjs').fixedDate('2026-10-09T05:00:00Z')});
for(const f of ['Config','Domain','Database','Auth','Attendance','Payroll','Leave','SickLeave','TasksAndDocs','Employee'])vm.runInContext(fs.readFileSync(f+'.js','utf8'),server);
const calls=[];let deferred=false,queue=[];
function runner(){let done,fail;return {withSuccessHandler(fn){done=fn;return this;},withFailureHandler(fn){fail=fn;return this;},apiLogin(...args){calls.push(['apiLogin',...args]);try{done(server.apiLogin(...args));}catch(e){fail(e);}},apiRequest(...args){calls.push([args[1],...args[2]]);const run=()=>{try{done(server.apiRequest(...args));}catch(e){fail(e);}};if(deferred)queue.push(run);else run();},apiLogout:server.apiLogout};}
const google={script:{get run(){return runner();}}};
const sandbox={console,document,sessionStorage,google,confirm:()=>true,setTimeout:()=>0,clearTimeout(){},Option:function(text,value){return {text,value};},Blob,TextEncoder,Uint8Array,DataView,URL,atob,btoa,FileReader:class{readAsDataURL(file){this.onload({target:{result:'data:'+file.type+';base64,'+btoa(file.content)}});}}};
sandbox.window=sandbox;sandbox.open=()=>({location:{},close(){}});
const client=vm.createContext(sandbox),run=code=>vm.runInContext(code,client);
run(source);
check('all inline handlers reference existing functions',()=>{for(const [,body]of html.matchAll(/\bon(?:click|change|submit)="([^"]*)"/g)){for(const [,name]of body.matchAll(/(?<![.\w])([A-Za-z_]\w*)\(/g))if(!['if'].includes(name))assert.equal(typeof client[name],'function',name);}});
check('employee login renders authoritative scoped data',()=>{run("fillAndLogin('phuong.le@vintech.vn')");assert.equal(run('appData.payroll.length'),2);assert.equal(run('currentUser.id'),'VT-001');assert(!nodes.get('payroll-tbody').innerHTML.includes('Hoàng Khương Duy'));});
check('payroll defaults to current month and remains independent from attendance',()=>{
 assert.equal(run('currentPayrollPeriod'),'10/2026');
 const options=nodes.get('payroll-period-select').innerHTML;
 assert(options.includes('10/2026'));assert(options.includes('09/2026'));assert(options.includes('08/2026'));
 assert(!options.includes('11/2026'));assert(!options.includes('12/2026'));
 run("changeTimesheetPeriod('11/2026')");assert.equal(run('currentPayrollPeriod'),'10/2026');
 run("changePayrollPeriod('08/2026')");assert.equal(run('currentTimesheetPeriod'),'11/2026');
 assert(nodes.get('payroll-tbody').innerHTML.includes('Lê Thị Phương'));
 run("changePayrollPeriod('07/2026')");assert(nodes.get('payroll-tbody').innerHTML.includes('Chưa'));
 run("changePayrollPeriod('11/2026')");assert.equal(run('currentPayrollPeriod'),'07/2026');
 run("changeTimesheetPeriod('10/2026');changePayrollPeriod('10/2026')");
});
check('sick supplement modal uses valid DOM IDs',()=>{run("handleLogout();fillAndLogin('duy.hoang@vintech.vn');openSickResubmitModal('SC-2610-02')");assert.equal(nodes.get('sick-resubmit-hospital').value,'Bệnh viện Hồng Ngọc');assert.equal(nodes.get('sick-resubmit-from').value,'2026-10-20');});
check('supplement submits actual hospital, dates and file bytes',()=>{nodes.get('sick-resubmit-hospital').value='Cơ sở demo';nodes.get('sick-resubmit-note').value='Bổ sung';run("selectedSickResubmitFile={name:'a.pdf',type:'application/pdf',base64:btoa('file')};handleResubmitSick(null)");assert.equal(run("appData.sickCases.find(s=>s.id==='SC-2610-02').hospital"),'Cơ sở demo');assert.equal(run("appData.sickCases.find(s=>s.id==='SC-2610-02').status"),'PENDING');});
check('sick submission counts weekdays and uploads base64',()=>{nodes.get('sick-hospital').value='Bệnh viện mẫu';nodes.get('sick-from').value='2026-11-06';nodes.get('sick-to').value='2026-11-09';run("selectedSickFile={name:'proof.pdf',type:'application/pdf',size:4,content:'file'};handleCreateSick({preventDefault(){},target:{querySelector(){return null;}}})");const call=calls.filter(x=>x[0]==='apiSubmitSick').at(-1);assert.equal(call[1].days,2);assert(call[1].fileData.base64);assert.equal(run("appData.sickCases.find(s=>s.from==='2026-11-06').days"),2);});
check('document filters accept all and salary group',()=>{nodes.get('doc-type-filter').value='all';nodes.get('doc-category-filter').value='all';run('filterDocuments()');assert(nodes.get('docs-tbody').innerHTML.includes('DEMO-BHXH'));nodes.get('doc-type-filter').value='salary_docs';run('filterDocuments()');assert(nodes.get('docs-tbody').innerHTML.includes('02/2026/QC-LUONG'));assert(!nodes.get('docs-tbody').innerHTML.includes('45/2019/QH14'));});
check('old session callback cannot change newly logged-in role',()=>{deferred=true;run('refreshAppData()');run("handleLogout();fillAndLogin('huong.nguyen@vintech.vn')");deferred=false;queue.shift()();assert.equal(run('appData.payroll.length'),0);while(queue.length)queue.shift()();assert.equal(run('currentUser.role'),'hr');assert.equal(run('appData.payroll.length'),8);});
check('role controls distinguish accountant, manager and employee',()=>{
 const managerButton=element(),docButton=element(),generalEdit=element(),salaryEdit=element();
 generalEdit.dataset.editDoc='01/2026/QĐ-VT';salaryEdit.dataset.editDoc='02/2026/QC-LUONG';
 const original=document.querySelectorAll;
 document.querySelectorAll=selector=>({'[data-manager-only]':[managerButton],'[data-document-create]':[docButton],'[data-edit-doc]':[generalEdit,salaryEdit]}[selector]||[]);
 run('applyRoleControls()');
 assert(managerButton.classList.contains('hidden'));assert(!docButton.classList.contains('hidden'));
 assert(generalEdit.classList.contains('hidden'));assert(!salaryEdit.classList.contains('hidden'));
 assert(nodes.get('btn-add-employee').classList.contains('hidden'));
 assert(!nodes.get('btn-calc-payroll').classList.contains('hidden'));
 assert.equal(nodes.get('nav-tasks-label').innerText,'Công Việc Của Tôi');
 assert(run("appData.tasks.every(t=>t.assigneeId===currentUser.id)"));
 run("handleLogout();fillAndLogin('tri.tran@vintech.vn')");
 assert(!managerButton.classList.contains('hidden'));assert(nodes.get('btn-calc-payroll').classList.contains('hidden'));
 assert(nodes.get('leave-table-tbody').innerHTML.includes('approveLeave('));
 assert(nodes.get('sick-table-tbody').innerHTML.includes('approveSick('));
 run("handleLogout();fillAndLogin('phuong.le@vintech.vn')");
 assert(managerButton.classList.contains('hidden'));assert(docButton.classList.contains('hidden'));
 assert(nodes.get('btn-calc-payroll').classList.contains('hidden'));
 run("handleLogout();fillAndLogin('huong.nguyen@vintech.vn')");
 assert(!nodes.get('leave-table-tbody').innerHTML.includes('approveLeave('));
 assert(!nodes.get('sick-table-tbody').innerHTML.includes('approveSick('));
 document.querySelectorAll=original;
});
check('document form saves the selected status and real file',()=>{
 run('openDocModal()');for(const [id,value]of Object.entries({'doc-form-id':'UI-DOC','doc-form-title':'UI document','doc-form-type':'Thông báo trả lương','doc-form-category':'Nội bộ','doc-form-issuer':'Demo','doc-form-date':'2026-10-09','doc-form-status':'Dự thảo'}))nodes.get(id).value=value;
 run("selectedDocFile={name:'doc.pdf',base64:btoa('content')};handleSaveDoc(null)");assert.equal(run("appData.documents.find(d=>d.id==='UI-DOC').status"),'Dự thảo');
 run("openDocModal('UI-DOC')");assert(nodes.get('doc-form-url').value.startsWith('drive:'));nodes.get('doc-form-status').value='Hết hiệu lực';run('handleSaveDoc(null)');assert.equal(run("appData.documents.find(d=>d.id==='UI-DOC').status"),'Hết hiệu lực');
});
check('task form submits start date and assignee ID and receives server ID',()=>{
 run("handleLogout();fillAndLogin('tri.tran@vintech.vn')");
 for(const [id,value]of Object.entries({'task-form-title':'UI Task','task-form-type':'Nội bộ','task-form-assignee':'VT-001','task-form-start':'2026-10-09','task-form-deadline':'2026-10-12','task-form-doc':'UI-DOC'}))nodes.get(id).value=value;
 run('handleSaveTask({preventDefault(){}})');const task=run("appData.tasks.find(t=>t.title==='UI Task')");assert.equal(task.startDate,'2026-10-09');assert.equal(task.assigneeId,'VT-001');assert.match(task.id,/^CV-[0-9a-f-]{36}$/);
});
check('XSS payloads remain escaped in task rendering',()=>{run("appData.tasks.push({id:'test',title:'<img src=x onerror=alert(1)>',type:'<script>',assignee:'<b>',assigner:'<i>',deadline:'<x>',status:'Đang xử lý'});renderTasksTable()");assert(!nodes.get('tasks-tbody').innerHTML.includes('<img src=x'));assert(nodes.get('tasks-tbody').innerHTML.includes('&lt;img'));});
check('payslip uses stored OT and selected period',()=>{run("printPayslip('VT-004','09/2026')");assert(nodes.get('payslip-content').innerHTML.includes('2.250.000'));run("printPayslip('VT-004','12/2026')");assert(nodes.get('payslip-content').innerHTML.includes('Chưa có'));});
check('future cells show plans and cannot be edited even by manager',()=>{
 run("handleLogout();fillAndLogin('tri.tran@vintech.vn');changeTimesheetPeriod('10/2026')");
 const html=nodes.get('timesheet-tbody').innerHTML;
 assert(html.includes("cycleAttendanceCell('VT-001', 9,"));
 assert(!html.includes("cycleAttendanceCell('VT-001', 10,"));
 assert(html.includes('O*'));assert.equal(run("recordedClientDays('VT-004').filter(x=>x==='OT').length"),0);
 const before=calls.length;run("cycleAttendanceCell('VT-001',12,'')");assert.equal(calls.length,before);
});
check('export selects only the employee and keeps blank/K cells',()=>{run("handleLogout();fillAndLogin('phuong.le@vintech.vn');appData.timesheetByPeriod['10/2026']['VT-001'][0]='K';appData.timesheetByPeriod['10/2026']['VT-001'][1]='';appData.timesheetByPeriod['10/2026']['VT-001'][12]='X';appData.plannedTimesheet['VT-001'][11]='P';exportTimesheetExcel()");assert.equal(exported.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');});
(async()=>{const bytes=Buffer.from(await exported.arrayBuffer());let offset=0,parts={};while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);const name=bytes.subarray(offset+30,offset+30+nameLength).toString();const start=offset+30+nameLength+extra;parts[name]=bytes.subarray(start,start+size).toString();offset=start+size;}
 check('XLSX archive contains valid workbook relationships and scoped values',()=>{assert.equal(Object.keys(parts).length,5);const xml=parts['xl/worksheets/sheet1.xml'];assert(xml.includes('Lê Thị Phương'));assert(!xml.includes('Hoàng Khương Duy'));assert(xml.includes('<c r="AJ4"><v>5</v></c>'));assert(xml.includes('<c r="AM4"><v>1</v></c>'));assert(xml.includes('P (dự kiến)'));assert(xml.includes('<c r="Q4" t="inlineStr"><is><t xml:space="preserve"></t></is></c>'));assert(!xml.includes('<f>'));});
 console.log(count+' frontend regression checks passed (DOM adapter, not browser visual QA).');
})().catch(e=>{console.error(e);process.exitCode=1;});
