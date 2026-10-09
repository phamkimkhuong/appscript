/** In-memory Apps Script services for local preview and regression tests only. */
function createRuntime(options = {}) {
  const state = options.state || { sheets:{}, properties:{}, cache:{}, files:{}, folders:{} };
  const uuid=()=>options.crypto.randomUUID();
  const clone=v=>JSON.parse(JSON.stringify(v));
  function sheetObject(data) {
    return {
      getDataRange(){return this.getRange(1,1,Math.max(1,data.length),Math.max(1,...data.map(r=>r.length)));},
      getMaxColumns(){return 100;},insertColumnsAfter(){},getMaxRows(){return 100000;},insertRowsAfter(){},
      getLastRow(){return data.length;},getLastColumn(){return Math.max(1,...data.map(r=>r.length));},
      appendRow(row){data.push(clone(row));},clear(){data.length=0;},
      getRange(row,col,height=1,width=1){
        return {
          setNumberFormat(){return this;},
          getValues(){return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>data[row-1+y]?.[col-1+x]??''));},
          setValues(values){for(let y=0;y<height;y++){data[row-1+y] ||= [];for(let x=0;x<width;x++)data[row-1+y][col-1+x]=values[y][x];}return this;},
          setValue(value){return this.setValues([[value]]);}
        };
      }
    };
  }
  function spreadsheet(id) {
    if(!state.sheets[id])throw Error('Spreadsheet unavailable');
    return {getId:()=>id,getUrl:()=>('https://example.invalid/'+id),getSheetByName:name=>state.sheets[id][name]?sheetObject(state.sheets[id][name]):null,insertSheet(name){state.sheets[id][name]=[];return sheetObject(state.sheets[id][name]);}};
  }
  const SpreadsheetApp={create(){const id=uuid();state.sheets[id]={};return spreadsheet(id);},openById:spreadsheet};
  const properties={getProperty:key=>state.properties[key]||null,setProperty(key,value){state.properties[key]=value;return this;},deleteProperty(key){delete state.properties[key];},getProperties:()=>clone(state.properties)};
  const cache={put(key,value,seconds){state.cache[key]={value,expires:Date.now()+seconds*1000};},get(key){const item=state.cache[key];return item&&item.expires>Date.now()?item.value:null;},remove(key){delete state.cache[key];}};
  function blob(value,type='text/plain',name='file') {
    const bytes=typeof value==='string'?Array.from(new TextEncoder().encode(value)):Array.from(value);
    return {getBytes:()=>bytes,getContentType:()=>type,getName:()=>name};
  }
  function file(id){const value=state.files[id];if(!value)throw Error('File unavailable');return {getId:()=>id,getName:()=>value.name,getBlob:()=>blob(value.bytes,value.type,value.name),setTrashed(){delete state.files[id];return this;}};}
  function folder(id){if(!state.folders[id])throw Error('Folder unavailable');return {getId:()=>id,createFile(b){const fileId=uuid();state.files[fileId]={bytes:b.getBytes(),type:b.getContentType(),name:b.getName(),folder:id};return file(fileId);},setTrashed(){Object.keys(state.files).filter(key=>state.files[key].folder===id).forEach(key=>delete state.files[key]);delete state.folders[id];return this;}};}
  const DriveApp={createFolder(){const id=uuid();state.folders[id]={};return folder(id);},getFolderById:folder,getFileById(id){if(state.sheets[id])return {setTrashed(){delete state.sheets[id];}};return file(id);}};
  const Utilities={getUuid:uuid,newBlob:blob,base64Encode(bytes){let raw='';for(const b of bytes)raw+=String.fromCharCode((b+256)%256);return btoa(raw);},base64Decode(text){return Array.from(atob(text),c=>c.charCodeAt(0));},formatDate(date,zone,pattern){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date).map(x=>[x.type,x.value]));
    return pattern.replace(/yyyy|MM|dd|HH|mm/g,key=>({yyyy:parts.year,MM:parts.month,dd:parts.day,HH:parts.hour,mm:parts.minute}[key]));
  }};
  return {state,SpreadsheetApp,DriveApp,Utilities,PropertiesService:{getScriptProperties:()=>properties},CacheService:{getScriptCache:()=>cache},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Logger:{log(){}}};
}
module.exports={createRuntime};
