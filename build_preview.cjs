const fs=require('fs');
const {createRuntime}=require('./dev/gas-runtime.cjs');
const backendFiles=['Config.js','Domain.js','Database.js','Auth.js','Attendance.js','Payroll.js','Leave.js','SickLeave.js','TasksAndDocs.js','Employee.js'];
let index=fs.readFileSync('Index.html','utf8');
for(const name of ['Styles','Modals','Scripts'])index=index.replace(new RegExp('<\\?!=\\s*include\\([\'\"]'+name+'[\'\"]\\);\\s*\\?>','g'),()=>fs.readFileSync(name+'.html','utf8'));
const backend=backendFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const runtime=`<script>
(function(){
  const createRuntime=${createRuntime.toString()};
  let saved;try{saved=JSON.parse(sessionStorage.getItem('vintech-local-runtime')||'null');}catch(e){}
  const services=createRuntime({state:saved||undefined,crypto:window.crypto});
  const names=Object.keys(services).filter(k=>k!=='state');
  const api=new Function(...names,${JSON.stringify(backend+'\nreturn {apiLogin,apiRequest,apiLogout};').replace(/<\//g,'<\\/')})(...names.map(k=>services[k]));
  function persist(){try{sessionStorage.setItem('vintech-local-runtime',JSON.stringify(services.state));}catch(e){if(window.showToast)window.showToast('Bộ nhớ preview đầy. Dữ liệu mới chỉ tồn tại khi trang còn mở.','info');}}
  window.localDemoRequest=(fn,args,token,workspace)=>{const result=fn==='apiLogin'?api.apiLogin(args[0],args[1],workspace):api.apiRequest(token,fn,args);persist();return result;};
  window.localDemoLogout=token=>{api.apiLogout(token);persist();};
})();
</script>`;
index=index.replace('</head>',()=>runtime+'\n</head>');
fs.writeFileSync('preview.html',index);
console.log('Built preview using the same backend and seed as Apps Script.');
