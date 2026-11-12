const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), { webcrypto } = require('crypto');
const { createRuntime } = require('./gas-runtime.cjs');
const runtime = createRuntime({ crypto: webcrypto });
let calls = [], status = 200, body, networkError = false, locks = 0;
const valid = { summary: 'Phụ cấp từ 01/11.', facts: [{ label: 'Phụ cấp', value: '500.000 đồng', evidence: 'Điều 1: Phụ cấp 500.000 đồng.' }], actions: [], answer: '', evidence: '', caveats: [] };
const response = (data = valid, reason = 'STOP') => ({ candidates: [{ finishReason: reason, content: { parts: [{ text: JSON.stringify(data) }] } }] });
const fetch = (url, options) => {
  calls.push({ url, options, payload: JSON.parse(options.payload) });
  if (networkError) throw Error(typeof networkError === 'string' ? networkError : 'raw provider error with test-secret');
  return { getResponseCode: () => status, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body || response()) };
};
const server = vm.createContext({ ...runtime, UrlFetchApp: { fetch }, LockService: { getScriptLock() { locks++; return { tryLock: () => true, releaseLock() {} }; } } });
const diagnosticLogs = [];
server.Logger.log = value => diagnosticLogs.push(String(value));
for (const file of ['Server', 'HRM', 'EOffice', 'DocumentAI', 'PayrollAI']) vm.runInContext(fs.readFileSync(file + '.js', 'utf8'), server);
const login = email => { const r = server.apiLogin(email, '123456'); assert(r.success); return r; };
const employee = login('linh.nguyen@wanzhong.vn'), manager = login('feng.tang@wanzhong.vn'), accountant = login('thoa.nguyen@wanzhong.vn');
const tables = runtime.state.sheets[vm.runInContext('CONFIG.DEFAULT_SPREADSHEET_ID', server)];
const documents = tables.VanBan, docId = documents[1][0];
const request = overrides => ({ docId, mode: 'analyze', source: 'text', text: 'Điều 1: Phụ cấp 500.000 đồng. Áp dụng từ 01/11.', language: 'vi', ...overrides });
const rpc = (r = request(), who = employee) => server.apiRequest(who.token, 'apiAnalyzeDocument', [r]);
let count = 0;
const check = (name, fn) => { fn(); count++; console.log('PASS', name); };
const noFetch = (r, pattern) => { const before = calls.length; const result = rpc(r); assert.equal(result.success, false); if (pattern) assert.match(result.message, pattern); assert.equal(calls.length, before); };

check('authentication and document existence are checked before calling Gemini', () => {
  assert.equal(server.apiRequest('bad-token', 'apiAnalyzeDocument', [request()]).success, false);
  noFetch(request({ docId: 'missing' })); assert.equal(calls.length, 0);
});
check('missing key and local preview produce actionable errors', () => {
  noFetch(request(), /GEMINI_API_KEY/);
  delete server.UrlFetchApp; noFetch(request(), /preview/); server.UrlFetchApp = { fetch };
  runtime.state.properties.GEMINI_API_KEY = 'test-secret';
});
check('rejects empty/oversized inputs, invalid mode/source and model without network calls', () => {
  for (const r of [request({ text: '' }), request({ text: 'x'.repeat(30001) }), request({ mode: 'ask', question: '' }), request({ question: 'x'.repeat(2001) }), request({ source: 'url' }), request({ mode: 'delete' })]) noFetch(r);
  runtime.state.properties.GEMINI_MODEL = '../injected'; noFetch(request()); delete runtime.state.properties.GEMINI_MODEL;
});
check('all three roles can analyze readable documents without changing business data or locking writes', () => {
  const before = JSON.stringify(runtime.state.sheets), lockBefore = locks;
  for (const who of [employee, manager, accountant]) { const r = rpc(request(), who); assert(r.success, r.message); assert.equal(r.data.summary, valid.summary); }
  assert.equal(JSON.stringify(runtime.state.sheets), before); assert.equal(locks, lockBefore);
});
check('request uses backend credentials, structured output and only the selected content', () => {
  const r = calls.at(-1); assert.equal(r.options.headers['x-goog-api-key'], 'test-secret');
  assert(!r.url.includes('test-secret')); assert.equal(r.payload.generationConfig.responseMimeType, 'application/json');
  assert(r.payload.systemInstruction.parts[0].text.includes('untrusted data'));
  assert.equal(r.payload.contents[0].parts[1].text, request().text);
  assert(!JSON.stringify(r.payload).includes('test-secret'));
  assert(!JSON.stringify(r.payload).includes('Nguyễn Thị Kim Thoa'));
});
check('missing, demo and external attachments cannot silently analyze metadata or fetch arbitrary URLs', () => {
  const original = documents[1][6];
  for (const link of ['', 'demo:sample', 'https://example.com/file.pdf', 'https://evil.test/file/d/secret']) { documents[1][6] = link; noFetch(request({ source: 'attachment' })); }
  documents[1][6] = original;
});
check('Drive file bytes come from the document row, ignoring forged IDs and pasted content', () => {
  runtime.state.files.pdf1 = { bytes: [37, 80, 68, 70], name: 'Policy.pdf', type: 'application/pdf' };
  documents[1][6] = 'drive:pdf1';
  const r = rpc(request({ source: 'attachment', fileId: 'forged', text: 'Do not send this' }));
  assert(r.success, r.message); assert.equal(r.sourceName, 'Policy.pdf');
  assert.deepEqual(calls.at(-1).payload.contents[0].parts[1].inlineData, { mimeType: 'application/pdf', data: 'JVBERg==' });
  assert(!JSON.stringify(calls.at(-1).payload).includes('Do not send this'));
  documents[1][6] = 'https://drive.google.com/file/d/pdf1/view'; assert(rpc(request({ source: 'attachment' })).success);
});
check('Google document and alternate Drive links resolve to the stored file ID', () => {
  for (const link of ['https://docs.google.com/document/d/pdf1/edit?usp=sharing', 'https://docs.google.com/spreadsheets/d/pdf1/edit#gid=123', 'https://docs.google.com/presentation/d/pdf1/edit', 'https://docs.google.com/document/u/0/d/pdf1/edit', 'https://drive.google.com/open?id=pdf1&usp=sharing', 'https://drive.google.com/uc?export=download&id=pdf1', 'https://drive.google.com/file/u/0/d/pdf1/view']) {
    documents[1][6] = link;
    const r = rpc(request({ source: 'attachment' })); assert(r.success, link + ': ' + r.message);
    assert.equal(calls.at(-1).payload.contents[0].parts[1].inlineData.data, 'JVBERg==');
  }
  for (const link of ['https://docs.google.com.evil.test/document/d/pdf1/edit', 'https://evil.test/?url=https://docs.google.com/document/d/pdf1/edit', 'https://docs.google.com@evil.test/document/d/pdf1/edit', 'https://drive.google.com/drive/folders/pdf1', 'https://drive.google.com/open?id=%ZZ', 'https://docs.google.com/document/d/e/published/pub']) {
    documents[1][6] = link; noFetch(request({ source: 'attachment' }));
  }
});
check('Drive resource keys are passed to the authorized file read', () => {
  let supplied;
  server.DriveApp.getFileByIdAndResourceKey = (id, key) => { supplied = [id, key]; return runtime.DriveApp.getFileById(id); };
  documents[1][6] = 'https://drive.google.com/file/d/pdf1/view?resourcekey=0-abc&usp=sharing';
  assert(rpc(request({ source: 'attachment' })).success); assert.deepEqual(supplied, ['pdf1', '0-abc']);
});
check('native Google Docs, Sheets and Slides with zero Drive size export real PDF bytes', () => {
  const original = server.DriveApp.getFileById;
  let exports = 0;
  runtime.state.files.native = { bytes: [], name: 'Native policy', type: '' };
  server.DriveApp.getFileById = id => ({ ...original(id), getAs(mime) { exports++; assert.equal(mime, 'application/pdf'); return { getBytes: () => [37, 80, 68, 70] }; } });
  documents[1][6] = 'https://docs.google.com/document/d/native/edit';
  for (const type of ['document', 'spreadsheet', 'presentation']) {
    runtime.state.files.native.type = 'application/vnd.google-apps.' + type;
    const r = rpc(request({ source: 'attachment' })); assert(r.success, r.message);
    assert.equal(r.sourceName, 'Native policy (PDF export)');
    assert.deepEqual(calls.at(-1).payload.contents[0].parts[1].inlineData, { mimeType: 'application/pdf', data: 'JVBERg==' });
  }
  assert.equal(exports, 3); server.DriveApp.getFileById = original;
});
check('export failure and oversized or empty exported PDF never reach Gemini', () => {
  const original = server.DriveApp.getFileById;
  documents[1][6] = 'https://docs.google.com/spreadsheets/d/native/edit';
  const before = calls.length;
  server.DriveApp.getFileById = id => ({ ...original(id), getAs() { throw Error('provider details'); } });
  noFetch(request({ source: 'attachment' }), /quyền tải\/xuất/);
  for (const length of [0, 10 * 1024 * 1024 + 1]) {
    server.DriveApp.getFileById = id => ({ ...original(id), getAs() { return { getBytes: () => ({ length }) }; } });
    noFetch(request({ source: 'attachment' }), /10 MB/);
  }
  assert.equal(calls.length, before); server.DriveApp.getFileById = original;
});
check('unsupported, missing and oversized Drive files fail before Gemini', () => {
  documents[1][6] = 'drive:missing'; noFetch(request({ source: 'attachment' }), /Không đọc/);
  documents[1][6] = 'drive:pdf1'; runtime.state.files.pdf1.type = 'application/zip'; noFetch(request({ source: 'attachment' }), /Chưa hỗ trợ/);
  runtime.state.files.pdf1.type = 'application/pdf';
  runtime.state.files.pdf1.bytes = { length: 10 * 1024 * 1024 + 1 }; noFetch(request({ source: 'attachment' }), /10 MB/);
  runtime.state.files.pdf1.bytes = [37, 80, 68, 70];
});
check('Office conversion requires the advanced Drive service before sending anything to Gemini', () => {
  runtime.state.files.office = { bytes: [1, 2, 3], name: 'Policy.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  documents[1][6] = 'https://docs.google.com/document/d/office/edit';
  noFetch(request({ source: 'attachment' }), /Drive API v3/);
});
check('DOC/DOCX/XLS/XLSX import temporary copies, export PDF and trash only those copies', () => {
  const original = server.DriveApp.getFileById, writes = [], imports = [];
  const tablesBefore = JSON.stringify(runtime.state.sheets);
  let sequence = 0;
  server.Drive = { Files: {
    create(metadata, blob, options) {
      assert.equal(options.fields, 'id'); assert(!metadata.parents); assert(!metadata.permissions);
      assert.equal(metadata.appProperties.wanzhongAiTemporary, 'true');
      imports.push({ metadata, bytes: blob.getBytes() }); return { id: 'temporary-' + (++sequence) };
    },
    update(metadata, id) { writes.push({ metadata, id }); }
  } };
  server.DriveApp.getFileById = id => id.startsWith('temporary-') ? { getAs(mime) { assert.equal(mime, 'application/pdf'); return { getBytes: () => [37, 80, 68, 70] }; } } : original(id);
  for (const [mime, target] of [
    ['application/msword', 'document'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
    ['application/vnd.ms-excel', 'spreadsheet'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet']
  ]) {
    runtime.state.files.office.type = mime;
    const sourceBefore = JSON.stringify(runtime.state.files.office);
    const r = rpc(request({ source: 'attachment' })); assert(r.success, r.message);
    assert.equal(imports.at(-1).metadata.mimeType, 'application/vnd.google-apps.' + target);
    assert.deepEqual(imports.at(-1).bytes, [1, 2, 3]);
    assert.equal(writes.at(-1).id, 'temporary-' + sequence); assert.equal(writes.at(-1).metadata.trashed, true);
    assert.equal(calls.at(-1).payload.contents[0].parts[1].inlineData.mimeType, 'application/pdf');
    assert.equal(JSON.stringify(runtime.state.files.office), sourceBefore);
  }
  assert.equal(JSON.stringify(runtime.state.sheets), tablesBefore); assert.equal(writes.length, 4);
  server.DriveApp.getFileById = original; delete server.Drive;
});
check('Office export failure still trashes the temporary file; conversion/cleanup errors stop Gemini', () => {
  const original = server.DriveApp.getFileById;
  let writes = 0, importFailed = false, cleanupFailed = false, exportFailed = true;
  server.Drive = { Files: {
    create() { if (importFailed) throw Error('raw import details'); return { id: 'temporary-only' }; },
    update(metadata, id) { assert.equal(id, 'temporary-only'); assert.equal(metadata.trashed, true); writes++; if (cleanupFailed) throw Error('raw cleanup details'); }
  } };
  server.DriveApp.getFileById = id => id === 'temporary-only' ? { getAs() { if (exportFailed) throw Error('raw export details'); return { getBytes: () => [37, 80, 68, 70] }; } } : original(id);
  noFetch(request({ source: 'attachment' }), /chưa xuất được PDF/); assert.equal(writes, 1);
  importFailed = true; noFetch(request({ source: 'attachment' }), /Chưa chuyển đổi/); assert.equal(writes, 1);
  importFailed = false; exportFailed = false; cleanupFailed = true;
  noFetch(request({ source: 'attachment' }), /Chưa dọn được/); assert.equal(writes, 2);
  cleanupFailed = false; status = 429;
  assert.equal(rpc(request({ source: 'attachment' })).success, false); assert.equal(writes, 3); status = 200;
  server.DriveApp.getFileById = original; delete server.Drive;
});
check('Office files over the source size limit cannot create temporary copies', () => {
  runtime.state.files.office.bytes = { length: 10 * 1024 * 1024 + 1 };
  server.Drive = { Files: { create() { assert.fail('must not import oversized source'); } } };
  noFetch(request({ source: 'attachment' }), /10 MB/);
  runtime.state.files.office.bytes = [1, 2, 3]; delete server.Drive;
});
check('question and selected language reach the model; missing-info answers are retained', () => {
  body = response({ ...valid, summary: '', facts: [], answer: 'Tài liệu không nêu hạn chót.', caveats: ['Không xác định được thời hạn.'] });
  const r = rpc(request({ mode: 'ask', question: 'Hạn chót?', language: 'zh' })); assert(r.success, r.message);
  assert(calls.at(-1).payload.systemInstruction.parts[0].text.includes('Simplified Chinese'));
  assert.equal(JSON.parse(calls.at(-1).payload.contents[0].parts[0].text).question, 'Hạn chót?');
  assert.equal(r.data.answer, 'Tài liệu không nêu hạn chót.'); body = null;
});
check('quota/auth/model/server errors are clear and never expose raw provider messages', () => {
  body = { error: { message: 'raw provider error test-secret' } };
  for (const code of [400, 401, 403, 404, 429, 500]) { status = code; const r = rpc(); assert.equal(r.success, false); assert(!r.message.includes('test-secret')); }
  status = 200; networkError = true; const r = rpc(); assert.equal(r.success, false); assert(!r.message.includes('test-secret')); networkError = false; body = null;
});
check('transport exceptions distinguish Apps Script permissions, quota, timeout and network', () => {
  for (const [error, code] of [
    ['You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request', 'AI_FETCH_PERMISSION'],
    ['Service invoked too many times for one day: urlfetch.', 'AI_FETCH_QUOTA'],
    ['Request timed out', 'AI_FETCH_TIMEOUT'], ['DNS error', 'AI_FETCH_NETWORK'],
    ['Invalid argument: headers', 'AI_FETCH_ARGUMENT'], ['Unknown failure test-secret', 'AI_FETCH_FAILED']
  ]) {
    networkError = error; const before = calls.length;
    const r = rpc(); assert.equal(r.success, false); assert(r.message.includes(code), r.message);
    assert.equal(calls.length, before + 1, 'transport errors must not retry every fallback model');
    assert(diagnosticLogs.at(-1).includes(code)); assert(!diagnosticLogs.at(-1).includes('test-secret'));
  }
  networkError = false;
});
check('editor test logs safe status and stops on missing authorization', () => {
  networkError = 'You do not have permission to call UrlFetchApp.fetch. test-secret';
  const before = calls.length;
  assert(server.testGemini().includes('AI_FETCH_PERMISSION')); assert.equal(calls.length, before + 1);
  networkError = false; status = 403; body = { error: { message: 'Key test-secret rejected at https://example.invalid/?key=test-secret' } };
  assert(server.testGemini().includes('Chưa kết nối thành công'));
  assert(diagnosticLogs.every(line => !line.includes('test-secret')));
  status = 200; body = null; assert(server.testGemini().includes('Thành công kết nối'));
});
check('manifest requests the external HTTP permission alongside existing Drive and Sheets scopes', () => {
  const manifest = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
check('invalid JSON, blocked/truncated and malformed model output never appear as success', () => {
  for (const value of ['not-json', {}, response(valid, 'MAX_TOKENS'), response(valid, 'SAFETY'), response({ summary: 'missing fields' }), response({ ...valid, facts: [{ label: {}, value: 'x', evidence: 'x' }] }), response({ ...valid, summary: '' })]) {
    body = value; assert.equal(rpc().success, false);
  }
  body = response(); body.candidates[0].content.parts.unshift({ thought: true, text: 'internal reasoning' }); assert(rpc().success); body = null;
});
console.log(count + ' document AI regression checks passed (mocked Gemini, no external API calls).');
