# Phân quyền ba vai trò của đồ án

`hr` được giữ làm mã nội bộ tương thích với tài khoản Kế toán. Mã này không còn mang nghĩa HR kiêm kế toán. Chức vụ hiển thị vẫn chỉ gồm Nhân viên, Quản lý, Kế toán.

| Chức năng | Nhân viên | Quản lý | Kế toán |
|---|---|---|---|
| Nhân sự | Xem danh sách, lương cá nhân | Thêm/sửa/khóa | Xem để đối chiếu; không sửa |
| Chấm công | Xem/xuất công cá nhân | Xem/sửa/xuất toàn bộ | Xem/xuất toàn bộ; không sửa |
| Đơn nghỉ và hồ sơ ốm | Gửi/xem/bổ sung hồ sơ của mình | Xem toàn bộ, duyệt/từ chối/yêu cầu bổ sung | Gửi/xem/bổ sung hồ sơ của mình |
| Bảng lương | Xem phiếu của mình | Xem toàn bộ | Tính và xem toàn bộ |
| Công việc | Xem/cập nhật việc được giao | Tạo/giao/theo dõi toàn bộ | Xem/cập nhật việc được giao cho mình |
| Văn bản | Xem/tải | Thêm/sửa mọi loại, giao việc theo văn bản | Xem/tải mọi loại; thêm/sửa văn bản tiền lương |
| Khôi phục dữ liệu demo | Không | Có | Không |

Văn bản tiền lương gồm: Quy chế lương, Thông báo trả lương, Quyết định điều chỉnh lương. Khi sửa, kế toán chỉ được sửa bản gốc thuộc một trong ba loại này và không được đổi sang loại khác.

Các tab nghỉ/ốm/công việc vẫn hiện cho kế toán vì kế toán cũng có nhu cầu cá nhân; nhãn thể hiện rõ “Của Tôi”. Máy chủ chỉ trả về hồ sơ và công việc thuộc tài khoản đó. Quản lý phụ trách quy trình duyệt hồ sơ ốm trong phạm vi đồ án ba vai trò, không mô phỏng một hệ thống HR/BHXH đầy đủ.

Kiểm tra quyền được đặt tại hàm nghiệp vụ, không chỉ ẩn nút. Các kiểm tra bổ sung bao gồm gọi thẳng API bằng token kế toán, chặn ghi dữ liệu quản lý, giới hạn bản ghi cá nhân, giới hạn văn bản tiền lương và đổi vai trò trên giao diện. Hàm khởi tạo thủ công trong Apps Script editor đổi thành `initDatabase_` để không gọi trực tiếp từ trang web.

67 kiểm tra cục bộ đạt trước bước chỉnh nhãn cuối; type-check đạt. Giao diện được kiểm tra bằng DOM mô phỏng, chưa xác minh trực tiếp trên bản Google triển khai. Cần push source và chọn New version cho deployment đang sử dụng; không cần reset dữ liệu để quyền mới có hiệu lực. Khi vào lại trang nên đăng xuất/đăng nhập để tải lại dữ liệu theo vai trò.
