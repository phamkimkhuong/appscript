# Chấm công theo ngày thực tế

Ngày được xác định ở máy chủ theo CONFIG.TIMEZONE (Việt Nam). Ví dụ ngày 09/10/2026: giữ đủ cột 1–31 và 22 công chuẩn theo lịch, nhưng chỉ cộng công đã ghi nhận đến hết ngày 9. Mẫu đi làm đủ các ngày làm việc 1–9 có 7 công, không phải 22.

- Ngày tương lai: ô mờ, không chấm X/OT hoặc cộng P/K/O vào tổng. API cũng chặn sửa trực tiếp ngày tương lai.
- T7/CN vẫn hiển thị theo lịch. P/K/O đã được lập cho tương lai hiển thị dấu *; các trường này là lịch nghỉ dự kiến. Đến ngày tương ứng, hệ thống mới đưa chúng vào công phát sinh.
- Khi mở kỳ chưa có bảng công, chỉ tạo lịch cuối tuần và các ô trống, không tự sinh X kể cả kỳ quá khứ. Dữ liệu demo lịch sử đã có vẫn được giữ.
- Bảng công và Excel dùng cùng dữ liệu actual/cutoff/planned do máy chủ cung cấp. Excel ghi rõ ngày đối chiếu và “dự kiến”, tổng chỉ đếm công phát sinh.
- Lương tháng hiện tại được ghi “Tạm tính đến … (chưa chốt)”. Lương theo công và OT chỉ lấy công đến ngày hiện tại. Phụ cấp và BHXH vẫn là mức tháng theo quy tắc demo hiện có, được ghi rõ trên phiếu; không có thay đổi chính sách phụ cấp/khấu trừ trong đợt này.

Tương thích dữ liệu cũ: khi tải công/lương, các X/OT nằm sau ngày hiện tại được xóa khỏi phần ngày tương lai trong Sheet (cuối tuần trở về T7/CN). Thao tác này dùng khóa và ghi theo lô khi phát hiện cần sửa; không reset database, không xóa lịch nghỉ P/K/O. Việc lưu lại tránh để X giả tự trở thành công thật vào hôm sau. Đọc thông thường sau sửa không chờ khóa này. Lương tháng hiện tại đã lưu từ bản cũ được trả về dưới dạng tạm tính lại từ công thực tế, không tiếp tục hiển thị snapshot đủ tháng.

Sau khi push và cập nhật New version cho deployment đang dùng, tải lại trang; không cần Khôi phục Demo. Tải lại dữ liệu khi chuyển ngày để cập nhật mốc công từ máy chủ. Hàm bảo trì chỉ sửa ngày còn ở tương lai tại lúc chạy; không tự phỏng đoán xóa công của các ngày đã qua.

Xác minh: 75 kiểm tra đạt (31 backend + 17 frontend + 4 HTML Service + 6 đăng nhập + 5 kỳ lương + 5 quyền + 7 giới hạn ngày công); type-check, build preview và diff-check các tệp thay đổi đạt. Có kiểm thử sửa dữ liệu cũ, sang ngày hôm sau không tự phát sinh X, lịch nghỉ chuyển từ dự kiến sang thực tế, Excel không cộng dữ liệu tương lai, biên nửa đêm Việt Nam, chuyển năm và tháng nhuận. Kiểm tra giao diện dùng DOM mô phỏng; chưa kiểm thử trực tiếp trên Google Apps Script.
