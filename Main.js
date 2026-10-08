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
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("VinTech Solutions - Cổng Quản Trị Nhân Sự & Văn Phòng Số Doanh Nghiệp")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

/**
 * Helper để nhúng các partial HTML vào template chính (nếu dùng)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
