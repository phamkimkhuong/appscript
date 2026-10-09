/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: Config.js (Cấu hình chung và các hằng số hệ thống)
 * ====================================================================
 */

const CONFIG = {
  DEFAULT_SPREADSHEET_ID: "1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA",
  SHEET_NAMES: {
    USERS: "Users",
    ATTENDANCE: "ChamCong",
    LEAVE: "DonNghiPhep",
    SICK: "HoSoOmDau",
    PAYROLL: "BangLuong",
    TASKS: "CongViec",
    DOCUMENTS: "VanBan"
  },
  ROLES: {
    EMPLOYEE: "employee",
    MANAGER: "manager",
    HR: "hr"
  },
  DEFAULT_WORKING_DAYS: 22,
  STANDARD_ALLOWANCE: 1500000,
  BHXH_RATE: 0.105, // Quy tắc demo 10,5%; không khẳng định áp dụng pháp luật thực tế
  TIMEZONE: "GMT+7"
};
