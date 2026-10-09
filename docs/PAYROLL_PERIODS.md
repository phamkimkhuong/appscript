# Kỳ lương theo tháng đã kết thúc

Bộ lọc lương và phiếu lương độc lập với tháng chấm công. Máy chủ xác định tháng theo CONFIG.TIMEZONE (Việt Nam). Ngày 09/10/2026 mặc định kỳ 09/2026, có thể chọn 08/2026 và các tháng trước; không chọn hoặc tính kỳ 10–12/2026. Tháng kết thúc không đồng nghĩa đã trả tiền: trạng thái vẫn là “Đã tính lương” hoặc “Cần tính lại”.

Danh sách gồm 12 tháng đã kết thúc gần nhất và các kỳ lịch sử cũ hơn có dữ liệu. Kỳ chưa có lương hiển thị thông báo chưa có dữ liệu, không lấy lương tháng khác thay thế. API tính lương chặn kỳ hiện tại/tương lai, yêu cầu có bảng công trước khi tính, không tự tạo công đủ tháng trong thao tác tính lương.

Dữ liệu demo mới/khôi phục có bảng công và lương của hai tháng đã kết thúc gần nhất, tính theo lịch thực tế của từng tháng. Dữ liệu công và kịch bản nghỉ phép hiện có được giữ để thực hành. Tổng quan dùng kỳ lương đã chọn thay vì tháng chấm công.

Với lượt demo cũ, máy chủ ẩn các bản ghi lương tháng hiện tại/tương lai khỏi API, không xóa hay đổi tháng của chúng. Source mới không tự thêm lương tháng 8/9 vào spreadsheet cũ. Để nạp bộ dữ liệu mẫu mới sau triển khai, dùng lượt mới hoặc “Khôi phục Demo”; khôi phục sẽ xóa thao tác thử trong lượt hiện tại.

Đã kiểm tra 62 trường hợp: 32 backend, 15 frontend, 4 tương thích HTML Service, 6 hiệu năng đăng nhập, 5 quy tắc kỳ lương. Kiểm tra mới bao gồm đúng ngày 09/10/2026, độc lập hai bộ lọc, API chặn kỳ chưa kết thúc trước khi ghi, ẩn lương tương lai của bản cũ, thiếu bảng công, chuyển tháng lúc 00:00 Việt Nam, chuyển năm và tháng nhuận. Type-check và build preview đạt. Kiểm tra frontend dùng DOM mô phỏng, chưa kiểm thử trực tiếp trên Apps Script.
