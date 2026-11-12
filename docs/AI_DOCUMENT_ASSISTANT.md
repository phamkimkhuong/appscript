# Wanzhong AI Document Assistant — cài đặt và dùng bản đầu

Tính năng nằm trong **Văn bản & Quy chế → Phân tích AI** ở mỗi dòng văn bản.
Người dùng chọn tệp đính kèm hoặc dán nội dung, rồi phân tích hoặc đặt câu hỏi.

## 1. Cấu hình Gemini

1. Mở [Google AI Studio](https://aistudio.google.com/api-keys), tạo API key cho dự án của bạn.
2. Mở dự án Apps Script đang dùng cho HRM, chọn **Project Settings / Cài đặt dự án → Script Properties / Thuộc tính tập lệnh → Add script property**.
3. Thêm và lưu:

   | Property | Giá trị |
   | --- | --- |
   | `GEMINI_API_KEY` | API key vừa tạo; chỉ nhập tại đây, không đưa vào HTML, Git hoặc tin nhắn chat |
   | `GEMINI_MODEL` | Không bắt buộc. Mặc định `gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash`; có thể thay bằng mã model hỗ trợ PDF/ảnh và structured output mà dự án được cấp |

4. Kiểm tra hạn mức của dự án/model trong AI Studio. Có API key không có nghĩa mọi model đều có quota sử dụng.

API key là cấu hình ở server, dùng chung cho ứng dụng. Nhân viên không phải nhập key riêng.
Không cần thêm thư viện npm hoặc tạo bảng dữ liệu mới. Đọc Word/Excel sử dụng **Advanced Drive API v3**, đã khai báo trong `appsscript.json`.

Tài liệu đối chiếu: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key),
[Apps Script Properties](https://developers.google.com/apps-script/guides/properties),
[danh sách model](https://ai.google.dev/gemini-api/docs/models).

## 2. Đưa source lên Apps Script và thử

Chủ dự án thực hiện tại thư mục dự án:

```powershell
npm run push
```

Lệnh này đẩy source, gồm cả `DocumentAI.js` và `appsscript.json` có khai báo Drive API v3, lên Apps Script. Nó không tự cập nhật version của link `/exec`.

- Kiểm tra mục **Services** trong Apps Script có **Drive API v3**, định danh `Drive`. Nếu chỉ chép source thủ công, thêm dịch vụ này bằng dấu **+** cạnh Services. Với Cloud project mặc định của Apps Script, API được bật tự động khi thêm dịch vụ; với standard Cloud project tự liên kết, cần bật **Google Drive API** trong Google Cloud Console của đúng project. Xem [hướng dẫn bật Advanced Services](https://developers.google.com/apps-script/guides/services/advanced).

- Trong trình soạn thảo Apps Script, chọn `testGemini` trong danh sách hàm rồi bấm **Chạy** bằng tài khoản triển khai; chấp nhận quyền mới nếu Google yêu cầu. Manifest khai báo rõ ba quyền `spreadsheets`, `drive`, `script.external_request`. Deploy một version mới không tự thay thế bước cấp quyền của tài khoản triển khai.
- Mở **Nhật ký thực thi** ngay dưới/trên vùng code sau khi chạy `testGemini`: hàm này gửi lời chào ngắn để kiểm tra kết nối, không đọc tài liệu. `HTTP 2xx` xác nhận gọi được Gemini; chưa chứng minh cấu trúc JSON hay đọc PDF hoạt động. Lỗi HTTP của từng model và lỗi quyền/mạng được ghi ở đây, đã che API key và URL. Hàm có sử dụng lượt gọi Gemini.
- Vào **Deploy → Test deployments → Web app**, mở URL `/dev` bằng tài khoản có quyền chỉnh sửa dự án.
- Đăng nhập, vào **Văn bản & Quy chế**, chọn **Phân tích AI**.
- Thử **Dán nội dung** trước, sau đó thử PDF/ảnh thật gắn vào văn bản.
- Sau khi thử thành công, chủ dự án vào **Deploy → Manage deployments → Edit → New version → Deploy** để cập nhật link `/exec` đang dùng.
- Sao chép URL ngay từ đúng deployment vừa cập nhật và mở URL đó. Hai link có ID khác nhau giữa `/s/` và `/exec` là hai deployment khác nhau; cập nhật một deployment không cập nhật deployment còn lại.

Tham khảo [quyền của UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app).

## 3. Kịch bản kiểm tra nhanh

Dán đoạn thực hành này vào một văn bản, rồi bấm **Phân tích văn bản**:

> TÀI LIỆU THỰC HÀNH — Quyết định phụ cấp số DEMO-01.
> Điều 1. Từ ngày 01/11/2026, nhân viên bộ phận Kỹ thuật được hưởng phụ cấp trách nhiệm 500.000 đồng/người/tháng.
> Điều 2. Phòng Kế toán tổng hợp danh sách được duyệt trước ngày 28/10/2026. Trưởng bộ phận Kỹ thuật chịu trách nhiệm xác nhận danh sách.

Kết quả cần nêu đúng đối tượng, số tiền, ngày áp dụng và công việc của hai bộ phận; có trích dẫn để đối chiếu.

Thử hai câu hỏi độc lập:

- “Phụ cấp áp dụng cho ai và từ ngày nào?” → trả lời dựa trên Điều 1.
- “Nhân viên thử việc có được hưởng không?” → phải nêu tài liệu chưa quy định, không tự suy diễn.

Sau đó thử tệp PDF/ảnh trong **Sửa văn bản → tải tệp**, chọn lại nguồn **Tệp đính kèm**.
Kết quả từ nội dung dán không xác nhận AI đã đọc tệp đính kèm; nguồn đã phân tích được hiển thị riêng.

## 4. Phạm vi bản đầu

- Tóm tắt, trích xuất thông tin, gợi ý việc cần làm, hỏi đáp theo một tài liệu.
- Kết quả theo ngôn ngữ giao diện Việt/Anh/Trung; trích dẫn giữ nguyên ngôn ngữ của nguồn.
- Tất cả vai trò đã đăng nhập được phân tích văn bản đang có quyền đọc. Source hiện cho cả ba vai trò đọc kho văn bản chung; quyền sửa văn bản không thay đổi.
- Đọc trực tiếp liên kết Google Docs, Sheets, Slides: Apps Script xuất tài liệu thành PDF trong bộ nhớ rồi gửi Gemini, không tạo thêm file trên Drive. Tài khoản triển khai phải có quyền đọc và xuất tài liệu. Nội dung được phân tích theo bản PDF xuất của tệp, không chỉ riêng ô/vùng được chọn trong trình duyệt.
- PDF, PNG, JPG trên Drive hoặc PDF xuất từ Google Docs/Sheets/Slides: tối đa **10 MB**; nội dung dán: tối đa **30.000 ký tự**; câu hỏi: tối đa **2.000 ký tự**. Đây là giới hạn của ứng dụng để giữ phạm vi demo gọn.
- Nhận `drive:<id>`, `drive.google.com/file/d/<id>/...`, `drive.google.com/open?id=<id>`, `drive.google.com/uc?id=<id>` và `docs.google.com/document|spreadsheets|presentation/d/<id>/...`. Hỗ trợ tham số `resourcekey` trong liên kết chia sẻ và đường dẫn có `/u/0/`.
- Word/Excel gốc trên Drive (`.doc`, `.docx`, `.xls`, `.xlsx`) được tự nhập thành bản sao Google Docs/Sheets tạm bằng Drive API v3, xuất PDF rồi đưa bản sao vào thùng rác trong `finally`, kể cả khi xuất PDF lỗi. Tệp gốc và liên kết trong Sheet không thay đổi. Tệp tạm mang tên `Wanzhong-AI-TEMP-...`, thuộc tài khoản triển khai, không bật chia sẻ công khai. Nếu dọn tệp thất bại, ứng dụng báo ID để chủ dự án xử lý; không tiếp tục gọi Gemini. Trường hợp tiến trình bị Google ngắt cưỡng bức có thể để lại bản tạm cần dọn thủ công.
- Giới hạn Office: tệp gốc và PDF sau xuất đều tối đa 10 MB; tệp có mật khẩu, không chuyển đổi được hoặc vượt hạn mức Google sẽ có thông báo riêng. Bản PDF phụ thuộc bố cục in của tài liệu/bảng tính; phải đối chiếu kết quả với tệp gốc khi định dạng phức tạp. Mỗi yêu cầu phân tích hoặc hỏi đáp chuyển đổi lại tệp; chưa có cache bản chuyển đổi.
- Loại tệp được xác định bằng MIME trên Drive, không suy đoán chỉ từ tên miền của URL. Không tự đọc website, thư mục, link xuất bản web `/d/e/...` hoặc tài liệu `demo:`.
- Kết quả và nội dung dán chỉ giữ trong cửa sổ đang mở, không lưu vào Sheets. Đóng cửa sổ hoặc đăng xuất sẽ xóa trạng thái giao diện.
- Mỗi câu hỏi được xử lý riêng và gửi lại nguồn đang chọn. Chưa có lịch sử hội thoại, bộ nhớ liên tài liệu hoặc tìm kiếm toàn kho.
- AI không tự sửa lương, duyệt đơn hoặc giao việc. Các đề xuất và trích dẫn cần người dùng kiểm tra với bản gốc.
- Đóng cửa sổ chỉ bỏ qua kết quả đang chờ; không hủy yêu cầu đã gửi tới Gemini. Ứng dụng không tự thử lại khi API lỗi.
- Preview cục bộ cho phép xem giao diện nhưng báo rõ chưa gọi AI; không tạo kết quả phân tích giả.

## 5. Mã nguồn

| Tệp | Trách nhiệm |
| --- | --- |
| `DocumentAI.js` | Kiểm tra tài liệu, lấy nguồn, đọc Script Properties, gọi Gemini, kiểm tra JSON trả về |
| `Server.js` | Đăng ký `apiAnalyzeDocument` trong router có xác thực; không lấy khóa ghi Sheets |
| `Scripts.html` | Nút AI, trạng thái xử lý, hỏi đáp, hiển thị kết quả an toàn, dịch giao diện |
| `Modals.html`, `Styles.html` | Cửa sổ phân tích và bố cục kết quả |
| `dev/document-ai-regression.cjs` | Kiểm thử backend bằng phản hồi Gemini giả lập; không gọi dịch vụ thật |

Luồng gọi: nút AI → `callBackend('apiAnalyzeDocument', [request])` → `apiRequest` → `analyzeDocument_` → Gemini → JSON → giao diện.

Nguồn kỹ thuật: [đọc PDF](https://ai.google.dev/gemini-api/docs/generate-content/document-processing),
[structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[Drive File.getAs](https://developers.google.com/apps-script/reference/drive/file#getAs(String)),
[nhập Office thành tài liệu Google](https://developers.google.com/workspace/drive/api/guides/manage-uploads#import_to_google_docs_types).

## 6. Khi gặp lỗi

| Thông báo | Cách xử lý |
| --- | --- |
| Chưa cấu hình Gemini | Kiểm tra `GEMINI_API_KEY` ở đúng dự án Apps Script |
| Không tìm thấy model | Kiểm tra `GEMINI_MODEL` và quyền sử dụng model của key |
| Giới hạn lượt gọi/hết hạn mức | Kiểm tra quota AI Studio; không bấm gửi liên tục |
| Không đọc được Drive | Kiểm tra tệp tồn tại và tài khoản triển khai có quyền đọc |
| Chuyển đổi Word/Excel cần Drive API v3 | Đẩy cả `appsscript.json` hoặc thêm Drive API v3 trong Services |
| Chưa chuyển đổi được Word/Excel | Kiểm tra Drive API của Cloud project, quyền, hạn mức chuyển đổi và tệp có mật khẩu/hỏng hay không |
| Chưa dọn được bản chuyển đổi tạm | Tìm đúng ID trong thông báo, đưa bản `Wanzhong-AI-TEMP-...` vào thùng rác; không xóa tệp gốc |
| `AI_FETCH_PERMISSION` | Chạy `testGemini` trong editor bằng tài khoản triển khai, cấp quyền gọi dịch vụ ngoài rồi thử đúng deployment |
| `AI_FETCH_QUOTA` | Hạn mức UrlFetch của Apps Script; chưa phải lỗi quota HTTP 429 từ Gemini |
| `AI_FETCH_TIMEOUT` / `AI_FETCH_NETWORK` | Xem Nhật ký thực thi của `testGemini`; thử lại sau hoặc dùng nguồn nhỏ hơn |
| `AI_FETCH_ARGUMENT` / `AI_FETCH_FAILED` | Xem dòng `gemini.fetch` trong nhật ký; không cần gửi key để chẩn đoán |
| Kết quả thiếu/không đúng cấu trúc | Thử tài liệu ngắn/rõ hơn; kết quả lỗi không được hiển thị như thành công |

Lệnh kiểm tra source: `npm test`, `npm run type-check`, `npm run build:preview`.
Các bài test giả lập không xác nhận key, quota hoặc độ chính xác của câu trả lời từ Gemini thật; cần chạy kịch bản trên `/dev` sau khi cấu hình.

`apiRequest` bắt lỗi và trả thông báo về giao diện, vì vậy lần thực thi có thể hiện “Hoàn thành” dù AI thất bại. Khi chẩn đoán, đọc nội dung log hoặc chạy `testGemini`, không chỉ nhìn trạng thái lần thực thi.
