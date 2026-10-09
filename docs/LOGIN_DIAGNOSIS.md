# Chẩn đoán lỗi đăng nhập — 09/10/2026

Source tải trực tiếp từ Apps Script version 19 và 20 khớp source local tại commit 3bad0ee (chuẩn hóa xuống dòng). Source riêng lẻ và HTML ghép cục bộ đều đạt kiểm tra cú pháp.

Phản hồi HTTP người dùng gửi chứa `goog.script.init(...)`. Giải mã chuỗi ký tự và JSON dưới dạng dữ liệu, không thực thi, thu được `userHtml`. JavaScript bên trong có ba dòng bị cắt URL:

| Dòng | Nội dung bị cắt |
|---|---|
| 402 | `defaultAvatar` dừng ở `https:` |
| 480 | Trường `avatar` dừng ở `https:` |
| 760 | Namespace XML trong `_rels/.rels` dừng ở `http:` |

Ví dụ dòng nhận được:

```js
const defaultAvatar = 'https:
```

Chuỗi chưa đóng gây `SyntaxError: Invalid or unexpected token` tại dòng 402. Vì toàn bộ khối script không chạy, `handleLoginSubmit` không được định nghĩa. Khi thay đúng ba dòng bị cắt, toàn bộ script từ phản hồi thật phân tích cú pháp thành công.

Bằng chứng xác nhận nội dung được phục vụ bị biến đổi theo mẫu cắt từ `//` đến cuối dòng tại ba URL. Chưa có dữ liệu để kết luận chi tiết thuật toán nội bộ Google hoặc đồng nhất lỗi này với một issue cụ thể trên Issue Tracker.

## Bản sửa

Giữ kiến trúc `doGet → HtmlService → HTML/JavaScript → google.script.run`. Trong Scripts.html, chuyển 11 tiền tố URL sang dạng Unicode escape:

```js
const url = 'https:\u002f\u002fexample.com';
```

Giá trị URL khi chạy vẫn giữ nguyên. Source đi qua xử lý HTML không còn cặp dấu gạch chéo liên tiếp tại các tiền tố URL này. Không thay API đăng nhập, quyền hoặc database để chữa lỗi cú pháp.

Fixture `dev/fixtures/htmlservice-url-corruption.json` chỉ chứa ba dòng source/received tối thiểu, không chứa toàn bộ phản hồi Google hay dữ liệu phiên. `dev/htmlservice-regression.cjs` tái hiện lỗi, kiểm tra giá trị URL/XML và ngăn đưa tiền tố URL thô trở lại. Đây không phải bộ mô phỏng đầy đủ của Google HTML Service.

## Xác minh

- `npm test`: 32 backend + 15 frontend + 4 kiểm tra từ lỗi thực tế, đều đạt.
- `npm run type-check`: đạt.
- `npm run build:preview`: đạt.
- Chưa kiểm thử bản sửa trên Google. Chủ dự án cần push source, cập nhật đúng deployment, tải lại và kiểm tra hết SyntaxError rồi thử đăng nhập.

Tab người dùng gửi dùng deployment `AKfycbzP6eeT-pYXd7dB-LrUusmkMhI9hV52dDxRGmForFs8qjuMflsfialbpCmKFNckEsiT` (version 20 khi đối chiếu). Link này khác deployment version 19 trong README. Cần cập nhật đúng deployment đang mở.

Tài liệu Google: [HTML Service best practices](https://developers.google.com/apps-script/guides/html/best-practices), [quản lý deployments](https://developers.google.com/apps-script/concepts/deployments).

## Tối ưu thời gian đăng nhập

Nút “Đang xác thực” trước đây bao gồm cả tạo spreadsheet riêng, khởi tạo 7 bảng, cập nhật người phụ trách và tính lương hai tháng. `apiLogin` còn giữ script lock xuyên suốt, khiến các lượt đăng nhập khác chờ tối đa 30 giây để lấy khóa. Ảnh màn hình chỉ cho thấy request đang chờ; chưa có log thời lượng cloud để quy toàn bộ thời gian cho một bước cụ thể.

Đã sửa:

- Dựng dữ liệu mẫu, gán người phụ trách và tính lương trong bộ nhớ; ghi mỗi bảng bằng một `setValues`. Chỉ định dạng vùng có dữ liệu.
- Cache các hàng đã đọc trong phạm vi một RPC, xóa cache bảng khi ghi, hủy toàn bộ context khi kết thúc RPC. Không dùng cache dữ liệu dùng chung giữa các phiên.
- Tạo lượt demo mới không giữ script lock vì spreadsheet/key mới chưa được trao cho người dùng. Đăng nhập lại lượt có sẵn vẫn dùng khóa để tránh đọc giữa lúc cập nhật; nếu sau 3 giây chưa lấy được khóa thì trả thông báo thử lại. Các RPC nghiệp vụ vẫn giữ khóa cũ.
- Giao diện giải thích lần đầu gồm tạo dữ liệu riêng, thông báo khi sau 8 giây chưa có phản hồi, không tự gửi lại yêu cầu.
- Log `apiLogin timing (elapsed ms)` ghi các mốc cộng dồn từ lúc hàm bắt đầu: `createSpreadsheetMs`, `seedReadyMs`, `lockAcquiredMs` (lượt có sẵn), `totalMs`. Không ghi mật khẩu, token hay email. Xem log của lần chạy `apiLogin` trong Apps Script Executions sau khi triển khai để đo thực tế.

Số lần gọi phương thức Sheets trong bộ mô phỏng, lần đăng nhập đầu:

| Phương thức | Trước | Sau |
|---|---:|---:|
| appendRow | 40 | 0 |
| getValues | 46 | 1 |
| setValues | 26 | 7 |
| setNumberFormat | 20 | 7 |

Đây không phải số request mạng hay thời gian chạy thực tế trên Google. Vẫn phải tạo spreadsheet mới cho lần đầu; tối ưu này không bảo đảm một thời gian cố định.

Xác minh sau tối ưu: 57 kiểm tra đạt (32 backend, 15 frontend, 4 tương thích HTML Service, 6 hiệu năng đăng nhập); type-check và build preview đạt. Đối chiếu toàn bộ giá trị nghiệp vụ seed với HEAD 3bad0ee cho kết quả giống nhau, bao gồm lương và người phụ trách. Chưa push hoặc deploy bản tối ưu.

Tham khảo: [Google Apps Script best practices — giảm lời gọi dịch vụ và đọc/ghi theo lô](https://developers.google.com/apps-script/guides/support/best-practices).
