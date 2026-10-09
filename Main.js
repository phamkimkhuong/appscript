/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Main.js (Entry Point Web App & Template Engine)
 * ====================================================================
 */

/**
 * Entry point phục vụ Web App trên Google Apps Script
 */
function doGet(e) {
  var index = HtmlService.createHtmlOutputFromFile("Index").getContent();
  var styles = HtmlService.createHtmlOutputFromFile("Styles").getContent();
  var modals = HtmlService.createHtmlOutputFromFile("Modals").getContent();
  var scripts = HtmlService.createHtmlOutputFromFile("Scripts").getContent();

  var html = index
    .replace(/<\?!=\s*include\(['"]Styles['"]\);\s*\?>/g, styles)
    .replace(/<\?!=\s*include\(['"]Modals['"]\);\s*\?>/g, modals)
    .replace(/<\?!=\s*include\(['"]Scripts['"]\);\s*\?>/g, scripts);

  return HtmlService.createHtmlOutput(html)
    .setTitle("VinTech Solutions - Cổng Quản Trị Nhân Sự & Văn Phòng Số Doanh Nghiệp")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

/**
 * Entry point hỗ trợ request POST
 */
function doPost(e) {
  return doGet(e);
}

/**
 * Helper để nhúng các partial HTML vào template chính (nếu dùng)
 */
function include(filename) {
  if (!['Styles','Modals','Scripts'].includes(filename)) throw new Error('Partial không hợp lệ.');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
