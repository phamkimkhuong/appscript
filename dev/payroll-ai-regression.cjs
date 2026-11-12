const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), { webcrypto } = require('crypto');
const { createRuntime } = require('./gas-runtime.cjs');
const runtime = createRuntime({ crypto: webcrypto });

let calls = [], status = 200, body, networkError = false, locks = 0;
const validPayrollAI = {
  summary: 'Quỹ lương tháng 10/2026 ổn định, tăng nhẹ do tiền làm thêm giờ bộ phận sản xuất.',
  payrollInsights: {
    totalNetText: '58.400.000 đ',
    momTrend: 'Tăng 8.2% so với tháng 09/2026 do có thêm các ca OT.',
    departmentHighlights: 'Bộ phận Sản xuất và Kỹ thuật chiếm 65% tổng quỹ lương.',
    salaryDistribution: 'Thu nhập cao nhất thuộc về Ban Giám đốc, thấp nhất thuộc vị trí Thử việc.'
  },
  otAnalysis: {
    totalOTSummary: 'Tổng chi phí làm thêm là 4.500.000 đ tương ứng với 6 ngày công OT.',
    topDepartments: 'Sản xuất và Kỹ thuật.',
    topEmployees: 'Nguyễn Văn Linh (4 ngày OT).',
    burnoutWarning: 'Cần lưu ý khối lượng làm thêm ca đêm của bộ phận kỹ thuật xưởng.'
  },
  attendanceDiscipline: {
    generalAttendanceRate: 'Tỷ lệ chuyên cần đạt 96.5%.',
    leaveAndSickSummary: 'Ghi nhận 2 ngày phép năm và 1 ngày ốm có chứng từ BHXH.',
    unpaidOrIrregular: 'Không có trường hợp nghỉ không phép hoặc nghỉ không lương.'
  },
  recommendations: [
    'Điều phối lại nhân lực giữa các ca để giảm bớt chi phí tăng ca.',
    'Khen thưởng nhân viên đạt chuyên cần 100% trong tháng.',
    'Rà soát dự toán quỹ lương quý 4/2026.'
  ],
  answer: ''
};

const response = (data = validPayrollAI, reason = 'STOP') => ({
  candidates: [{ finishReason: reason, content: { parts: [{ text: JSON.stringify(data) }] } }]
});

const fetch = (url, options) => {
  calls.push({ url, options, payload: JSON.parse(options.payload) });
  if (networkError) throw Error(typeof networkError === 'string' ? networkError : 'provider error');
  return {
    getResponseCode: () => status,
    getContentText: () => typeof body === 'string' ? body : JSON.stringify(body || response())
  };
};

const server = vm.createContext({
  ...runtime,
  UrlFetchApp: { fetch },
  LockService: { getScriptLock() { locks++; return { tryLock: () => true, releaseLock() {} }; } }
});

const diagnosticLogs = [];
server.Logger.log = value => diagnosticLogs.push(String(value));

for (const file of ['Server', 'HRM', 'EOffice', 'DocumentAI', 'PayrollAI']) {
  vm.runInContext(fs.readFileSync(file + '.js', 'utf8'), server);
}

const login = email => { const r = server.apiLogin(email, '123456'); assert(r.success); return r; };
const employee = login('linh.nguyen@wanzhong.vn');
const manager = login('feng.tang@wanzhong.vn');
const accountant = login('thoa.nguyen@wanzhong.vn');

let count = 0;
const check = (name, fn) => { fn(); count++; console.log('PASS', name); };

check('authentication required for apiAnalyzePayrollAI', () => {
  const res = server.apiRequest('invalid-token', 'apiAnalyzePayrollAI', [{ period: '10/2026' }]);
  assert.equal(res.success, false);
});

check('missing key produces actionable error without calling Gemini', () => {
  const before = calls.length;
  const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{ period: '10/2026' }]);
  assert.equal(res.success, false);
  assert.match(res.message, /GEMINI_API_KEY/);
  assert.equal(calls.length, before);
  runtime.state.properties.GEMINI_API_KEY = 'test-payroll-key';
});

check('employee cannot analyze company-wide payroll but can analyze own payslip', () => {
  // Employee requesting company scope -> forbidden
  const forbidden = server.apiRequest(employee.token, 'apiAnalyzePayrollAI', [{ period: '10/2026', scope: 'company' }]);
  assert.equal(forbidden.success, false);
  assert.match(forbidden.message, /Quản lý và Kế toán/);

  // Employee requesting my scope -> success
  const myRes = server.apiRequest(employee.token, 'apiAnalyzePayrollAI', [{ period: '10/2026', scope: 'my' }]);
  assert.equal(myRes.success, true, myRes.message);
  assert.equal(myRes.scope, 'my');
  assert.equal(myRes.rawMetrics.headcount, 1);
});

check('manager and accountant can analyze company-wide payroll', () => {
  for (const who of [manager, accountant]) {
    const res = server.apiRequest(who.token, 'apiAnalyzePayrollAI', [{ period: '10/2026', scope: 'company' }]);
    assert.equal(res.success, true, res.message);
    assert.equal(res.scope, 'company');
    assert(res.rawMetrics.headcount > 1);
    assert(res.rawMetrics.totalNet > 0);
  }
});

check('rejects future periods and invalid period formats', () => {
  for (const invalid of ['11/2099', '13/2026', 'bad-period', '2026-10']) {
    const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{ period: invalid }]);
    assert.equal(res.success, false);
  }
});

check('computes accurate MoM comparison with previous period 09/2026', () => {
  const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{ period: '10/2026' }]);
  assert.equal(res.success, true);
  const m = res.rawMetrics;
  assert.equal(m.period, '10/2026');
  assert.equal(m.prevPeriod, '09/2026');
  assert(m.departmentBreakdown.length > 0);
  assert(Array.isArray(m.topOTEmployees));
});

check('question is sent to Gemini and answer is returned in response', () => {
  const custom = { ...validPayrollAI, answer: 'Nguyễn Văn Linh làm thêm 4 ngày OT, chi phí là 1.800.000 đ.' };
  body = response(custom);
  const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{
    period: '10/2026',
    question: 'Ai làm thêm giờ nhiều nhất?'
  }]);
  assert.equal(res.success, true);
  assert.equal(res.data.answer, custom.answer);
  const lastCall = calls.at(-1);
  assert(lastCall.payload.contents[0].parts[0].text.includes('Ai làm thêm giờ nhiều nhất?'));
  assert.equal(lastCall.options.headers['x-goog-api-key'], 'test-payroll-key');
});

check('payroll AI is strictly read-only and acquires no write locks', () => {
  const lockCountBefore = locks;
  const sheetStateBefore = JSON.stringify(runtime.state.sheets);
  const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{ period: '10/2026' }]);
  assert.equal(res.success, true);
  assert.equal(locks, lockCountBefore);
  assert.equal(JSON.stringify(runtime.state.sheets), sheetStateBefore);
});

check('model fallback handles 503 high demand and caches working model', () => {
  runtime.state.properties.GEMINI_MODEL = 'gemini-model-a,gemini-model-b';
  status = 503;
  let attempt = 0;
  server.UrlFetchApp.fetch = (url, options) => {
    attempt++;
    if (url.includes('gemini-model-a')) return { getResponseCode: () => 503, getContentText: () => 'busy' };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(response()) };
  };
  const res = server.apiRequest(manager.token, 'apiAnalyzePayrollAI', [{ period: '10/2026' }]);
  assert.equal(res.success, true);
  assert.equal(res.model, 'gemini-model-b');
  assert.equal(runtime.state.cache['GEMINI_FAST_MODEL'].value, 'gemini-model-b');
});

console.log(`${count} payroll AI regression checks passed.`);
