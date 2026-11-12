/**
 * ====================================================================
 * WANZHONG CLEAN TECHNOLOGY (VIETNAM) - ENTERPRISE HRM & E-OFFICE
 * ====================================================================
 * FILE: PayrollAI.js
 * VAI TRÒ: TRỢ LÝ AI PHÂN TÍCH LƯƠNG, TĂNG CA (OT) & CHUYÊN CẦN DOANH NGHIỆP
 * --------------------------------------------------------------------
 * TÍNH NĂNG CỐT LÕI:
 * 1. Phân tích Quỹ Lương & Biến động So Với Tháng Trước (MoM Analysis):
 *    - Tổng thực lĩnh, lương trung bình, so sánh tăng/giảm % quỹ lương và chi phí OT.
 * 2. Phân tích Chuyên sâu Tăng Ca (OT Insights & Burnout Warning):
 *    - Thống kê tổng số ngày/tiền OT, top nhân viên/bộ phận OT nhiều nhất.
 * 3. Chuyên cần & Kỷ luật Lao động (Attendance & Leave Discipline):
 *    - Thống kê ngày công, nghỉ phép (P), nghỉ ốm (O), nghỉ không lương (K).
 * 4. Khuyến nghị Điều hành Dành cho Ban Giám Đốc & Kế Toán.
 * 5. Hỏi Đáp Thông Minh Về Số Liệu Lương & Công (Instant Interactive Q&A).
 * ====================================================================
 */

function previousPeriod_(period) {
  const [m, y] = String(period || '').split('/').map(Number);
  if (!m || !y) return '';
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const prevMonth = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
  return prevMonth + '/' + prevDate.getUTCFullYear();
}

/**
 * Entry point cho RPC apiAnalyzePayrollAI
 */
function analyzePayrollAI_(request) {
  const auth = authorized_();
  require_(request && typeof request === 'object', 'Yêu cầu phân tích lương AI không hợp lệ.');
  
  const currentPeriod = currentBusinessPeriod_();
  const period = period_(request.period || currentPeriod);
  require_(!isFuturePayrollPeriod_(period), 'Không thể phân tích dữ liệu cho kỳ tương lai (' + period + '). Hệ thống chỉ phân tích kỳ hiện tại hoặc các kỳ trước.');

  const scope = request.scope === 'my' ? 'my' : 'company';
  if (scope === 'company') {
    require_(['manager', 'hr'].includes(auth.role), 'Chỉ Quản lý và Kế toán mới có quyền xem phân tích lương toàn công ty.');
  }

  const question = typeof request.question === 'string' ? request.question.trim() : '';
  require_(question.length <= 2000, 'Câu hỏi tối đa 2.000 ký tự.');
  const language = { vi: 'Vietnamese', en: 'English', zh: 'Simplified Chinese' }[request.language] || 'Vietnamese';

  // 1. Thu thập dữ liệu lương kỳ hiện tại
  const payrollResponse = getPayroll_();
  let payrollItems = (payrollResponse.data || []).filter(p => p.period === period);
  if (scope === 'my') {
    payrollItems = payrollItems.filter(p => p.empId === auth.empId);
  }
  // Nếu kỳ hiện tại chưa lưu vào Google Sheet, tự động tạm tính dựa trên công thực tế đến nay
  if (payrollItems.length === 0 && period === currentPeriod) {
    const users = rows_(CONFIG.SHEET_NAMES.USERS).filter(u => u['Trạng Thái'] !== 'Đã nghỉ việc');
    const attendance = rows_(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (attendance.some(row => row['Mã Kỳ Công'] === period)) {
      payrollItems = users.map(user => {
        let att = attendance.find(row => row['Mã NV'] === user['Mã NV'] && row['Mã Kỳ Công'] === period);
        if (!att) att = attendanceRow_(user['Mã NV'], period);
        return payrollValue_(user, period, rowDays_(att));
      });
      if (scope === 'my') {
        payrollItems = payrollItems.filter(p => p.empId === auth.empId);
      }
    }
  }
  require_(payrollItems.length > 0, 'Kỳ lương ' + period + ' chưa có dữ liệu tính lương. Hãy kiểm tra hoặc bấm Tính Lương trước khi phân tích.');

  // 2. Thu thập dữ liệu lương kỳ trước để so sánh MoM
  const prevPeriod = previousPeriod_(period);
  let prevPayrollItems = (payrollResponse.data || []).filter(p => p.period === prevPeriod);
  if (scope === 'my') {
    prevPayrollItems = prevPayrollItems.filter(p => p.empId === auth.empId);
  }

  // 3. Thu thập thông tin phòng ban & hồ sơ nhân sự
  const allUsers = rows_(CONFIG.SHEET_NAMES.USERS);
  const userMap = {};
  allUsers.forEach(u => { userMap[u['Mã NV']] = u; });

  // 4. Tổng hợp các chỉ số số học trực tiếp
  const totalNet = payrollItems.reduce((sum, p) => sum + (Number(p.netSalary) || 0), 0);
  const totalBase = payrollItems.reduce((sum, p) => sum + (Number(p.baseSalary) || 0), 0);
  const totalOTPay = payrollItems.reduce((sum, p) => sum + (Number(p.otPay) || 0), 0);
  const totalOTDays = payrollItems.reduce((sum, p) => sum + (Number(p.otDays) || 0), 0);
  const totalActualDays = payrollItems.reduce((sum, p) => sum + (Number(p.actualDays) || 0), 0);
  const totalPaidLeave = payrollItems.reduce((sum, p) => sum + (Number(p.paidLeaveDays) || 0), 0);
  const totalSickDays = payrollItems.reduce((sum, p) => sum + (Number(p.sickDays) || 0), 0);
  const totalUnpaidDays = payrollItems.reduce((sum, p) => sum + (Number(p.unpaidDays) || 0), 0);
  const headcount = payrollItems.length;
  const avgNet = headcount > 0 ? Math.round(totalNet / headcount) : 0;

  // Dữ liệu so sánh kỳ trước
  let momComparison = null;
  if (prevPayrollItems.length > 0) {
    const prevTotalNet = prevPayrollItems.reduce((sum, p) => sum + (Number(p.netSalary) || 0), 0);
    const prevTotalOTPay = prevPayrollItems.reduce((sum, p) => sum + (Number(p.otPay) || 0), 0);
    const prevHeadcount = prevPayrollItems.length;
    const netDiff = totalNet - prevTotalNet;
    const netGrowthPercent = prevTotalNet > 0 ? Math.round((netDiff / prevTotalNet) * 1000) / 10 : 0;
    const otDiff = totalOTPay - prevTotalOTPay;
    const otGrowthPercent = prevTotalOTPay > 0 ? Math.round((otDiff / prevTotalOTPay) * 1000) / 10 : 0;
    momComparison = {
      prevPeriod: prevPeriod,
      prevTotalNet: prevTotalNet,
      prevTotalOTPay: prevTotalOTPay,
      prevHeadcount: prevHeadcount,
      netDiff: netDiff,
      netGrowthPercent: netGrowthPercent,
      otDiff: otDiff,
      otGrowthPercent: otGrowthPercent
    };
  }

  // Phân bổ theo phòng ban
  const deptMap = {};
  payrollItems.forEach(p => {
    const u = userMap[p.empId] || {};
    const dept = u['Phòng Ban'] || 'Chưa phân bổ';
    if (!deptMap[dept]) {
      deptMap[dept] = { dept: dept, count: 0, totalNet: 0, totalOTPay: 0, totalOTDays: 0, totalUnpaid: 0 };
    }
    deptMap[dept].count += 1;
    deptMap[dept].totalNet += Number(p.netSalary) || 0;
    deptMap[dept].totalOTPay += Number(p.otPay) || 0;
    deptMap[dept].totalOTDays += Number(p.otDays) || 0;
    deptMap[dept].totalUnpaid += Number(p.unpaidDays) || 0;
  });
  const departmentBreakdown = Object.values(deptMap);

  // Danh sách cá nhân nổi bật
  const sortedByOT = [...payrollItems].sort((a, b) => (Number(b.otDays) || 0) - (Number(a.otDays) || 0));
  const topOTEmployees = sortedByOT.slice(0, 3).map(p => ({
    name: p.empName,
    title: p.title,
    dept: (userMap[p.empId] || {})['Phòng Ban'] || '',
    otDays: p.otDays,
    otPay: p.otPay
  }));

  const sortedBySalary = [...payrollItems].sort((a, b) => (Number(b.netSalary) || 0) - (Number(a.netSalary) || 0));
  const highestEarner = sortedBySalary[0] ? { name: sortedBySalary[0].empName, title: sortedBySalary[0].title, netSalary: sortedBySalary[0].netSalary } : null;
  const lowestEarner = sortedBySalary[sortedBySalary.length - 1] ? { name: sortedBySalary[sortedBySalary.length - 1].empName, title: sortedBySalary[sortedBySalary.length - 1].title, netSalary: sortedBySalary[sortedBySalary.length - 1].netSalary } : null;

  const unpaidEmployees = payrollItems.filter(p => Number(p.unpaidDays) > 0).map(p => ({
    name: p.empName,
    title: p.title,
    unpaidDays: p.unpaidDays
  }));

  const rawMetrics = {
    period: period,
    prevPeriod: prevPeriod,
    scope: scope,
    headcount: headcount,
    totalNet: totalNet,
    totalBase: totalBase,
    totalOTPay: totalOTPay,
    totalOTDays: totalOTDays,
    totalActualDays: totalActualDays,
    totalPaidLeave: totalPaidLeave,
    totalSickDays: totalSickDays,
    totalUnpaidDays: totalUnpaidDays,
    avgNet: avgNet,
    momComparison: momComparison,
    departmentBreakdown: departmentBreakdown,
    topOTEmployees: topOTEmployees,
    highestEarner: highestEarner,
    lowestEarner: lowestEarner,
    unpaidEmployees: unpaidEmployees
  };

  // 5. Chuẩn bị AI prompt và cấu hình gọi Gemini
  require_(typeof UrlFetchApp !== 'undefined', 'AI chỉ hoạt động trên bản Apps Script đã cấu hình Gemini; preview cục bộ không gọi AI.');
  const properties = PropertiesService.getScriptProperties();
  const key = String(properties.getProperty('GEMINI_API_KEY') || '').trim();
  require_(key, 'Chưa cấu hình Gemini. Chủ dự án cần thêm GEMINI_API_KEY trong Script Properties của Apps Script.');

  const rawModel = String(properties.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3-flash,gemini-2.5-flash-lite,gemini-2.5-flash').trim();
  let models = rawModel.split(',').map(m => m.trim()).filter(Boolean).filter(m => !['gemini-3.8-flash', 'gemini-3.7-flash'].includes(m));
  require_(models.length > 0 && models.every(m => /^gemini-[a-z0-9.-]+$/.test(m)), 'GEMINI_MODEL không hợp lệ. Nhập mã model, không nhập đường dẫn API.');

  try {
    const fastModel = CacheService.getScriptCache().get('GEMINI_FAST_MODEL');
    if (fastModel && !['gemini-3.8-flash', 'gemini-3.7-flash'].includes(fastModel) && models.includes(fastModel)) {
      models = [fastModel, ...models.filter(m => m !== fastModel)];
    }
  } catch (err) { }

  const instruction = [
    'You are Wanzhong AI HR & Payroll Intelligence, a specialized executive financial and human-resource analytics assistant for Wanzhong Clean Technology.',
    'You receive authentic, structured company payroll, overtime, and attendance figures from the enterprise database.',
    'Rules:',
    '1. Answer strictly based on the provided metrics and figures. Do not fabricate external data or legal precedents.',
    '2. Tone: Professional, objective, analytical, concise and executive-level.',
    '3. Numbers & Currency: Quote exact numbers from the metrics. Preserve currency format (e.g. VND, đ, %).',
    '4. Structure: Provide structured JSON complying with the requested JSON schema.',
    '5. In summary: Give a sharp 2-3 sentence overview of the payroll fund, OT status, and primary trend for period ' + period + '.',
    '6. In payrollInsights: Analyze fund distribution, MoM trend compared to ' + (prevPeriod || 'previous period') + ', and highlight top/bottom earnings.',
    '7. In otAnalysis: Analyze overtime workload, identifying departments/individuals with intense OT and assessing burnout/cost risks.',
    '8. In attendanceDiscipline: Evaluate attendance discipline, leave utilization (P, O, K), and any unapproved or unpaid absences.',
    '9. In recommendations: Offer 3-4 concrete, actionable management recommendations for leadership and HR/Accountant.',
    '10. In answer: If the user provided a question, answer it directly, accurately, and succinctly. If no question was provided, set answer to "".',
    'Write in ' + language + '.'
  ].join('\n');

  const payload = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{
      role: 'user',
      parts: [
        { text: JSON.stringify({ requestPeriod: period, scope: scope, question: question, metrics: rawMetrics }) }
      ]
    }],
    generationConfig: {
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseJsonSchema: payrollAiSchema_()
    }
  };

  let response = null, usedModel = '', lastStatus = 0;
  for (const currentModel of models) {
    try {
      response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + currentModel + ':generateContent', {
        method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
    } catch (err) {
      throw new Error(documentAiTransportError_(err, key));
    }
    const status = response.getResponseCode();
    lastStatus = status;
    if (status === 429 || status === 404 || status === 503) {
      Logger.log('Model [' + currentModel + '] gặp mã ' + status + ', tự động chuyển sang model dự phòng...');
      continue;
    }
    if (status === 401 || status === 403) throw new Error('Gemini từ chối truy cập. Kiểm tra API key, quyền sử dụng và hạn chế của key trong Google AI Studio.');
    if (status === 400) throw new Error('Gemini không chấp nhận yêu cầu phân tích số liệu.');
    if (status >= 200 && status < 300) {
      usedModel = currentModel;
      try { CacheService.getScriptCache().put('GEMINI_FAST_MODEL', currentModel, 1800); } catch (e) { }
      break;
    }
    throw new Error('Gemini tạm thời không xử lý được yêu cầu (HTTP ' + status + '). Vui lòng thử lại sau.');
  }

  if (!usedModel || !response) {
    if (lastStatus === 429) throw new Error('Gemini đang giới hạn lượt gọi hoặc đã hết hạn mức. Kiểm tra quota trong Google AI Studio rồi thử lại sau.');
    if (lastStatus === 404) throw new Error('Không tìm thấy model Gemini. Kiểm tra GEMINI_MODEL và model được cấp cho API key.');
    throw new Error('Tất cả các model Gemini đều chạm hạn mức hoặc tạm thời không khả dụng (HTTP ' + lastStatus + '). Vui lòng thử lại sau.');
  }

  let envelope;
  try { envelope = JSON.parse(response.getContentText()); }
  catch (err) { throw new Error('Gemini trả về phản hồi không hợp lệ. Vui lòng thử lại.'); }
  const candidate = envelope && envelope.candidates && envelope.candidates[0];
  require_(candidate && candidate.finishReason === 'STOP', 'Gemini chưa hoàn thành phản hồi đầy đủ.');
  const parts = candidate.content && candidate.content.parts;
  require_(Array.isArray(parts), 'Gemini không trả về nội dung phân tích.');
  const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  let result;
  try { result = JSON.parse(text); }
  catch (err) { throw new Error('Kết quả AI chưa đúng định dạng JSON.'); }

  return {
    success: true,
    period: period,
    prevPeriod: prevPeriod,
    scope: scope,
    model: usedModel,
    rawMetrics: rawMetrics,
    data: result
  };
}

function payrollAiSchema_() {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      payrollInsights: {
        type: 'object',
        properties: {
          totalNetText: { type: 'string' },
          momTrend: { type: 'string' },
          departmentHighlights: { type: 'string' },
          salaryDistribution: { type: 'string' }
        },
        required: ['totalNetText', 'momTrend', 'departmentHighlights', 'salaryDistribution']
      },
      otAnalysis: {
        type: 'object',
        properties: {
          totalOTSummary: { type: 'string' },
          topDepartments: { type: 'string' },
          topEmployees: { type: 'string' },
          burnoutWarning: { type: 'string' }
        },
        required: ['totalOTSummary', 'topDepartments', 'topEmployees', 'burnoutWarning']
      },
      attendanceDiscipline: {
        type: 'object',
        properties: {
          generalAttendanceRate: { type: 'string' },
          leaveAndSickSummary: { type: 'string' },
          unpaidOrIrregular: { type: 'string' }
        },
        required: ['generalAttendanceRate', 'leaveAndSickSummary', 'unpaidOrIrregular']
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' }
      },
      answer: { type: 'string' }
    },
    required: ['summary', 'payrollInsights', 'otAnalysis', 'attendanceDiscipline', 'recommendations']
  };
}
