# Dự Án Phần Mềm Google Apps Script (GAS)

Tài liệu hướng dẫn vận hành, kiến trúc và tra cứu cú pháp lệnh phát triển hệ thống **VinTech Solutions (HRM & E-Office)**.

---

## Bản sửa luồng demo hiện tại

Source hiện dùng dữ liệu riêng cho từng lượt thực hành. Lần đăng nhập đầu tạo Google Spreadsheet mẫu riêng; đăng xuất rồi đổi vai trò trong cùng tab sẽ tiếp tục trên cùng dữ liệu. Nút khôi phục chỉ tác động lượt hiện tại. Database dùng chung cũ không còn là nguồn đọc/ghi của phiên bản này.

Chạy `npm test`, `npm run type-check`, rồi `npm run build:preview`. Mở `preview.html` để kiểm tra cục bộ. Bản preview dùng chính backend của dự án với bộ mô phỏng Sheets/Drive trong bộ nhớ trình duyệt. Xem [chi tiết bản sửa và kịch bản nghiệm thu](docs/REVIEW_FIXES.md).

## 🚀 1. Thông Tin Bản Triển Khai (Deployments)

Các ID/link dưới đây là cấu hình triển khai đã có, chưa được cập nhật hoặc xác minh lại trong đợt sửa source này.

* **Script ID**: `1AJQbcLqs4GcAeZIFey3EVT3tzTp0vc6Tuozhylaqm4DAOCcgItVMiDeq`
* **Deployment ID Cố Định (Version 3)**: `AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC`
* **Link Trực Tiếp Cho Khách Hàng (Production)**:
  👉 [https://script.google.com/macros/s/AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC/exec](https://script.google.com/macros/s/AKfycbwl4UliPG82gPztpgvmcv7OWsWk4yuPIvx8ysnmVxOdlC6ciQ7jb7LgumtQ1XHnM3CC/exec)
* **Link Kiểm Thử Nhanh Khi Đang Code (Dev Test)**:
* **Google Sheet Database cũ (chỉ để tham chiếu)**:
  👉 [https://docs.google.com/spreadsheets/d/1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA/edit](https://docs.google.com/spreadsheets/d/1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA/edit)
* **Spreadsheet ID**: `1XPliJmBsxg2-tlxqZWricZv3VCntgUVv2etVZIvmoxA`

## 🔐 2. Danh Sách Tài Khoản Đăng Nhập & Phân Quyền Trải Nghiệm

> 🔑 **Mật khẩu mặc định cho tất cả tài khoản**: `123456`

| STT | Họ và Tên | Email Đăng Nhập | Mật Khẩu | Chức Vụ & Phòng Ban | Vai Trò (Role) | Thẩm Quyền Hệ Thống |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| **1** | **Lê Thị Phương** | `phuong.le@vintech.vn` | `123456` | Chuyên viên Lập trình<br>*(Phòng Kỹ thuật)* | `employee`<br>*(Nhân viên)* | • Xem dashboard cá nhân<br>• Tạo đơn xin nghỉ phép, nộp hồ sơ ốm đau<br>• **Bảo mật:** Chỉ xem phiếu lương của chính mình<br>• Không có quyền duyệt đơn |
| **2** | **Trần Minh Trí** | `tri.tran@vintech.vn` | `123456` | Trưởng phòng Kỹ thuật<br>*(Phòng Kỹ thuật)* | `manager`<br>*(Quản lý)* | • Quản lý nhân sự toàn bộ doanh nghiệp giả lập<br>• **Phê duyệt đơn xin nghỉ phép** (tự động đồng bộ `P` (phép năm) hoặc `K` (việc riêng không lương))<br>• Giao việc và theo dõi tiến độ nhiệm vụ E-Office |
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
* **Kết quả:** Bản triển khai được trỏ đến phiên bản mã mới, khách hàng chỉ cần bấm **F5** trên link `/exec` là thấy giao diện mới.

---

### 🔹 Các Lệnh Hữu Ích Khác

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `npm run watch` | **Live Code Mode**: Tự động theo dõi và đẩy code lên Cloud ngay khi lưu file |
| `npm run push` | Đẩy toàn bộ mã nguồn lên Cloud 1 lần thủ công (`clasp push -f`) |
| `npm run type-check` | Quét lỗi tĩnh, type-check toàn bộ dự án với từ điển Google Apps Script |
| `clasp deployments` | Xem danh sách tất cả các phiên bản triển khai kèm ID |
| `clasp pull` | Kéo mã nguồn mới nhất từ trên Google Cloud về máy tính cục bộ |
| `clasp open-script` | Mở trực tiếp trình soạn thảo Google Apps Script trên trình duyệt web |
| `clasp logs` | Xem nhật ký thực thi (Logger/Console) thời gian thực của Apps Script |
| `clasp login` | Đăng nhập tài khoản Google trên máy tính |

---

## 📦 4. Triển khai bản demo thực hành

1. Kiểm tra source bằng `npm test`, `npm run type-check` và `npm run build:preview`.
2. Chủ dự án tự đẩy source bằng lệnh ở mục 3 khi sẵn sàng. Các tệp trong `dev/`, `docs/` và `preview.html` không đẩy lên Apps Script.
3. Chủ dự án mở Apps Script, cấp quyền Sheets/Drive và triển khai Web App chạy dưới tài khoản triển khai. Quyền truy cập bên ngoài phụ thuộc thiết lập Google Workspace của tài khoản.
4. Đăng nhập một tài khoản mẫu với mật khẩu `123456`. Hệ thống tự tạo spreadsheet có 7 bảng nghiệp vụ; không chạy các hàm khởi tạo database cũ nữa.
5. Dùng cùng tab để đổi vai trò nhân viên → quản lý → HR. Dùng cửa sổ ẩn danh hoặc hồ sơ trình duyệt khác để kiểm chứng lượt demo độc lập.
6. Thực hiện kịch bản nghiệm thu trong [REVIEW_FIXES.md](docs/REVIEW_FIXES.md) trước khi cập nhật link phát hành.

Phiên đăng nhập dùng token lưu trong Script Cache tối đa 6 giờ, có thể hết sớm nếu cache bị thu hồi. Mỗi lượt demo có thời hạn 24 giờ. Dữ liệu của lượt hết hạn chưa tự biến mất khỏi Drive: chủ dự án có thể chạy hàm riêng `cleanupExpiredWorkspaces_` hoặc tự tạo trigger hằng ngày cho hàm này. Mỗi lần dọn tối đa 20 lượt hết hạn vào thùng rác; không đụng đến database cũ. Bản sửa không tự tạo trigger.

Tệp tải lên nằm trong thư mục riêng của lượt demo, không bật chia sẻ công khai; tải qua API có kiểm tra phiên và bản ghi. Quyền quản lý/HR có phạm vi toàn doanh nghiệp giả lập. Đây là môi trường dùng tài khoản và dữ liệu mẫu; không dùng trực tiếp để lưu hồ sơ nhân sự thực.

---

## 📌 5. Các Quy Tắc Vận Hành Bắt Buộc

1. **Tuyệt đối KHÔNG tự ý `git commit`**:
   - Developer sẽ tự chủ động kiểm tra và commit code khi thấy phù hợp.
2. **Tuyệt đối KHÔNG tự ý chạy lệnh `clasp deploy`**:
   - Developer sẽ tự mình thực hiện các lệnh deploy khi sẵn sàng phát hành.
3. **KHÔNG chạy trình duyệt tự động (Browser Subagent)**:
   - Developer sẽ tự mở và kiểm thử trực tiếp trên trình duyệt của mình.
4. **Phạm vi nhiệm vụ của AI Assistant**:
   - Tập trung vào phân tích nghiệp vụ, tối ưu kiến trúc, viết mã nguồn backend, hoàn thiện giao diện và chỉnh sửa chức năng phần mềm theo yêu cầu.

---

## ⚠️ 6. Bốn (4) Quy Tắc Sống Còn Khi Viết Code GAS

1. **Dùng `LockService` khi ghi dữ liệu**: Tránh xung đột (Race Condition) khi nhiều người dùng cùng nộp hoặc duyệt đơn một lúc.
2. **Batch I/O**: Luôn đọc dữ liệu bằng `getValues()` và ghi bằng `setValues()` theo mảng thay vì đọc/ghi từng ô riêng lẻ.
3. **Giới hạn thời gian chạy 6 phút**: Với tác vụ nặng, xử lý theo batch hoặc sử dụng Time-driven Trigger.
4. **Bảo mật Secret Key**: Lưu ID và cấu hình nhạy cảm trong `PropertiesService.getScriptProperties()`.
