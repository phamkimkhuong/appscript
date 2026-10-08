# Dự Án Phần Mềm Google Apps Script (GAS)

Tài liệu hướng dẫn vận hành, kiến trúc và tra cứu cú pháp lệnh phát triển hệ thống **VinTech Solutions (HRM & E-Office)**.

---

## 🚀 1. Thông Tin Bản Triển Khai (Deployments)

* **Script ID**: `1AJQbcLqs4GcAeZIFey3EVT3tzTp0vc6Tuozhylaqm4DAOCcgItVMiDeq`
* **Deployment ID Cố Định (Version 3)**: `AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC`
* **Link Trực Tiếp Cho Khách Hàng (Production)**:
  👉 [https://script.google.com/macros/s/AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC/exec](https://script.google.com/macros/s/AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC/exec)
* **Link Kiểm Thử Nhanh Khi Đang Code (Dev Test)**:
* **Google Sheet Database (Độc quyền VinTech)**:
  👉 [https://docs.google.com/spreadsheets/d/1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA/edit](https://docs.google.com/spreadsheets/d/1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA/edit)
* **Spreadsheet ID**: `1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA`

## 🔐 2. Danh Sách Tài Khoản Đăng Nhập & Phân Quyền Trải Nghiệm

> 🔑 **Mật khẩu mặc định cho tất cả tài khoản**: `123456`

| STT | Họ và Tên | Email Đăng Nhập | Mật Khẩu | Chức Vụ & Phòng Ban | Vai Trò (Role) | Thẩm Quyền Hệ Thống |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| **1** | **Lê Thị Phương** | `phuong.le@vintech.vn` | `123456` | Chuyên viên Lập trình<br>*(Phòng Kỹ thuật)* | `employee`<br>*(Nhân viên)* | • Xem dashboard cá nhân<br>• Tạo đơn xin nghỉ phép, nộp hồ sơ ốm đau<br>• **Bảo mật:** Chỉ xem phiếu lương của chính mình<br>• Không có quyền duyệt đơn |
| **2** | **Trần Minh Trí** | `tri.tran@vintech.vn` | `123456` | Trưởng phòng Kỹ thuật<br>*(Phòng Kỹ thuật)* | `manager`<br>*(Quản lý)* | • Quản lý nhân sự kỹ thuật<br>• **Phê duyệt đơn xin nghỉ phép** (tự động đồng bộ ký hiệu `P` vào bảng công)<br>• Giao việc và theo dõi tiến độ nhiệm vụ E-Office |
| **3** | **Nguyễn Thu Hương** | `huong.nguyen@vintech.vn` | `123456` | Kế toán trưởng / HR Lead<br>*(Phòng Kế toán & HR)* | `hr`<br>*(HR / Kế toán)* | • Toàn quyền quản lý Nhân sự (Thêm/Sửa/Khóa nhân sự)<br>• **Phê duyệt hồ sơ ốm đau BHXH** (tự động đồng bộ `O` vào bảng công)<br>• Quản lý và kết xuất **Bảng lương toàn công ty**<br>• Lưu trữ kho văn bản nội bộ |
| **4** | **Hoàng Khương Duy** | `duy.hoang@vintech.vn` | `123456` | Kỹ sư Hệ thống<br>*(Phòng Kỹ thuật)* | `employee` | • Quyền nhân viên kỹ thuật cơ bản |
| **5** | **Đinh Thị Huyền Trang** | `trang.dinh@vintech.vn` | `123456` | Chuyên viên Kinh doanh<br>*(Phòng Kinh doanh)* | `employee` | • Quyền nhân viên kinh doanh cơ bản |

---

## 🛠️ 3. Sổ Tay Cú Pháp Lệnh (Cheat Sheet Cho Developer)

Thao tác thực hiện trực tiếp tại thư mục gốc: `d:\a_duan\appscript` (không cần `cd` vào thư mục con).

### 🔹 Bước 1: Kiểm tra lỗi cú pháp & Type (Tương tự React / Next.js)
Trước khi push hoặc deploy, quét toàn bộ mã nguồn xem có lỗi cú pháp hoặc gọi sai hàm:
```bash
npm run type-check
```
* **Ý nghĩa:** Chạy `tsc --noEmit` với từ điển `@types/google-apps-script`. Nếu có lỗi, terminal sẽ chỉ rõ tên file, số dòng và vị trí lỗi.

### 🔹 Bước 2: Chế độ Live Code Tự Động (Watch Mode - Khuyên Dùng Khi Đang Dev)
Khi bạn đang code và muốn **mỗi khi lưu file (`Ctrl + S`), code tự động đẩy lên Cloud ngay lập tức** mà không cần gõ lệnh push thủ công:
```bash
npm run watch
# hoặc
npx @google/clasp push --watch
```
* **Cơ chế:** Terminal sẽ chạy ngầm theo dõi các file. Hễ phát hiện file thay đổi, Clasp tự động push lên Cloud trong 2-3 giây.
* **Cách xem kết quả:** Mở link **Dev Test (`/dev`)** ở mục 1 và bấm **F5 (Reload)**.

### 🔹 Bước 2b: Đẩy code thủ công một lần (Manual Push)
Nếu không dùng watch mode, bạn có thể đẩy thủ công bất kỳ lúc nào:
```bash
npm run push
# hoặc
clasp push -f
```
* **Cách test:** Mở link đuôi `/dev` ở mục 1 và bấm **F5 (Reload)**. Code mới sẽ cập nhật ngay lập tức.
* *Lưu ý: Chỉ tài khoản sở hữu Google của bạn mới mở được link `/dev`.*

### 🔹 Bước 3: Phát hành bản cập nhật cho Khách hàng (Giữ CỐ ĐỊNH 1 Link Duy Nhất)
Khi tính năng đã test ổn định và bạn muốn tự mình deploy bàn giao cho khách mà **KHÔNG ĐỔI LINK**:
```bash
clasp deploy -i AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC -d "Mô tả nội dung cập nhật"
```
* **Kết quả:** Code của Version được ghi đè, khách hàng chỉ cần bấm **F5** trên link `/exec` là thấy giao diện mới.

---

### 🔹 Các Lệnh Hữu Ích Khác

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `npm run watch` | **Live Code Mode**: Tự động theo dõi và đẩy code lên Cloud ngay khi lưu file |
| `npm run push` | Đẩy toàn bộ mã nguồn lên Cloud 1 lần thủ công (`clasp push -f`) |
| `npm run type-check` | Quét lỗi tĩnh, type-check toàn bộ dự án với từ điển Google Apps Script |
| `clasp deployments` | Xem danh sách tất cả các phiên bản triển khai kèm ID |
| `clasp pull` | Kéo mã nguồn mới nhất từ trên Google Cloud về máy tính cục bộ |
| `clasp open` | Mở trực tiếp trình soạn thảo Google Apps Script trên trình duyệt web |
| `clasp logs` | Xem nhật ký thực thi (Logger/Console) thời gian thực của Apps Script |
| `clasp login` | Đăng nhập tài khoản Google trên máy tính |

---

## 📌 3. Các Quy Tắc Vận Hành Bắt Buộc

1. **Tuyệt đối KHÔNG tự ý `git commit`**:
   - Developer sẽ tự chủ động kiểm tra và commit code khi thấy phù hợp.
2. **Tuyệt đối KHÔNG tự ý chạy lệnh `clasp deploy`**:
   - Developer sẽ tự mình thực hiện các lệnh deploy khi sẵn sàng phát hành.
3. **KHÔNG chạy trình duyệt tự động (Browser Subagent)**:
   - Developer sẽ tự mở và kiểm thử trực tiếp trên trình duyệt của mình.
4. **Phạm vi nhiệm vụ của AI Assistant**:
   - Tập trung vào phân tích nghiệp vụ, tối ưu kiến trúc, viết mã nguồn backend, hoàn thiện giao diện và chỉnh sửa chức năng phần mềm theo yêu cầu.

---

## ⚠️ 4. Bốn (4) Quy Tắc Sống Còn Khi Viết Code GAS

1. **Dùng `LockService` khi ghi dữ liệu**: Tránh xung đột (Race Condition) khi nhiều người dùng cùng nộp hoặc duyệt đơn một lúc.
2. **Batch I/O**: Luôn đọc dữ liệu bằng `getValues()` và ghi bằng `setValues()` theo mảng thay vì đọc/ghi từng ô riêng lẻ.
3. **Giới hạn thời gian chạy 6 phút**: Với tác vụ nặng, xử lý theo batch hoặc sử dụng Time-driven Trigger.
4. **Bảo mật Secret Key**: Lưu ID và cấu hình nhạy cảm trong `PropertiesService.getScriptProperties()`.
