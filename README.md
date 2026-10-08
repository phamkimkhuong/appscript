# Dự Án Phần Mềm Google Apps Script (GAS)

Tài liệu hướng dẫn khởi động và cấu trúc chuẩn cho dự án phần mềm xây dựng bằng **Google Apps Script**.

---

## 🚀 1. Các Dạng Kiến Trúc Có Thể Triển Khai
1. **Full-stack Web App (Standalone)**: Giao diện web độc lập (HTML/CSS/JS/Vue/React) + Backend GAS (`doGet`/`doPost` hoặc `google.script.run`).
2. **Sheet-based Internal Tool**: Tự động hóa bảng tính Google Sheets với Custom Menus, Sidebars, Modals.
3. **RESTful API / Webhook Endpoint**: Nhận và xử lý dữ liệu qua HTTP GET/POST (nhận webhook Zalo, Telegram, Stripe, ERP...).

---

## 🛠️ 2. Công Cụ Đề Xuất Cho Lập Trình Chuyên Nghiệp

Để code tại VS Code/IDE thay vì web editor của Google:

1. **Cài đặt Google Clasp CLI**:
   ```bash
   npm install -g @google/clasp
   ```
2. **Đăng nhập Google**:
   ```bash
   clasp login
   ```
3. **Khởi tạo hoặc Clone dự án**:
   - Tạo mới: `clasp create --title "My-App" --type webapp`
   - Kéo code có sẵn: `clasp clone <SCRIPT_ID>`
4. **Cài đặt Types cho Autocomplete (TypeScript / IntelliSense)**:
   ```bash
   npm init -y
   npm install --save-dev @types/google-apps-script
   ```
5. **Đẩy code lên Google Cloud**:
   ```bash
   clasp push
   ```

---

## ⚠️ 3. Bốn (4) Quy Tắc Sống Còn Khi Viết Code GAS
1. **Dùng `LockService` khi ghi dữ liệu**: Tránh lỗi xung đột (Race Condition) khi nhiều người dùng cùng thao tác một lúc.
2. **Batch I/O**: Luôn đọc dữ liệu bằng `getValues()` và ghi bằng `setValues()` theo mảng thay vì đọc/ghi từng dòng.
3. **Giới hạn thời gian chạy 6 phút**: Với tác vụ nặng, chia nhỏ theo batch và dùng Time-driven Trigger để chạy tiếp.
4. **Bảo mật Secret Key**: Lưu API key trong `PropertiesService.getScriptProperties()`, không hardcode vào file `.gs`.

---

> Chi tiết phân tích chuyên sâu về kiến trúc, database, quota và quy trình phát triển xem tại tài liệu phân tích hệ thống.
