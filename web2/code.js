// =================================================================
// ⚠️ ID SPREADSHEET CỦA BẠN: 1Y8dKglpTn4SvIutZuq1fPWc1mAP7Ami7fUe7AOHp0Bw
// =================================================================
const SPREADSHEET_ID = '1Y8dKglpTn4SvIutZuq1fPWc1mAP7Ami7fUe7AOHp0Bw'; 
const TRANSACTION_SHEET_NAME = 'GIAO DỊCH';
const CATEGORY_SHEET_NAME = 'DANH MỤC';

// Hàm mở Spreadsheet, sử dụng try/catch để bắt lỗi kết nối
function openSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    Logger.log("LỖI KHÔNG MỞ ĐƯỢC SHEETS: Vui lòng kiểm tra ID và quyền truy cập. Chi tiết: " + e.toString());
    throw new Error("Không thể kết nối với Google Sheet. Vui lòng kiểm tra ID và quyền truy cập.");
  }
}

// --- CÁC HÀM CƠ BẢN CỦA WEB APP ---

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Quản Lý Dòng Tiền Cá Nhân')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- CÁC HÀM API KẾT NỐI VỚI SHEETS ---

/**
 * Lấy tất cả dữ liệu danh mục từ cột B.
 */
function getCategories() {
  try {
    const SS = openSpreadsheet();
    const categorySheet = SS.getSheetByName(CATEGORY_SHEET_NAME);
    
    // Đảm bảo Sheets tồn tại và có ít nhất 1 hàng dữ liệu (bắt đầu từ hàng 2)
    if (!categorySheet || categorySheet.getLastRow() < 2) {
        Logger.log("Sheet DANH MỤC trống hoặc không tìm thấy.");
        return [];
    }

    // Lấy dữ liệu từ cột B (Tên Danh Mục), bắt đầu từ hàng 2
    // getRange(bắt đầu từ hàng, bắt đầu từ cột, số hàng, số cột)
    const range = categorySheet.getRange(2, 2, categorySheet.getLastRow() - 1, 1);
    const values = range.getValues().flat();
    
    // Lọc bỏ các giá trị null/rỗng, chuyển thành chuỗi và loại bỏ trùng lặp
    const categories = [...new Set(
        values.filter(v => v && String(v).trim() !== '').map(String)
    )];
    
    return categories; 

  } catch (e) {
    Logger.log("Lỗi khi đọc danh mục: " + e.toString());
    throw new Error("Lỗi khi kết nối Danh Mục: " + e.message); 
  }
}

/**
 * Lấy tất cả giao dịch từ Sheet GIAO DỊCH
 */
function getTransactions() {
  try {
    const SS = openSpreadsheet();
    const sheet = SS.getSheetByName(TRANSACTION_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];

    // Chỉ đọc 6 cột (A-F): ID, Ngày, Loại, Danh Mục, Mô Tả, Số Tiền
    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6); 
    const values = range.getValues();

    const data = values.map((row, index) => {
      try {
        return {
          rowNum: index + 2,
          id: row[0] ? row[0].toString() : 'N/A',
          // Format ngày thành chuỗi chuẩn 'yyyy-MM-dd' để JS nhận dạng
          date: Utilities.formatDate(new Date(row[1]), SS.getSpreadsheetTimeZone(), 'yyyy-MM-dd'),
          type: row[2] ? row[2].toString() : '',
          category: row[3] ? row[3].toString() : '',
          description: row[4] ? row[4].toString() : '',
          amount: parseFloat(row[5]) || 0,
        };
      } catch (e) {
        Logger.log(`LỖI XỬ LÝ DÒNG DỮ LIỆU ${index + 2}: ${e.toString()}`);
        return null; 
      }
    }).filter(t => t !== null);

    // Giao dịch mới nhất lên đầu
    return data.reverse(); 

  } catch (e) {
    Logger.log("Lỗi khi đọc giao dịch: " + e.toString());
    throw new Error("Lỗi khi đọc dữ liệu giao dịch. Vui lòng kiểm tra format cột Ngày và Số Tiền.");
  }
}

/**
 * Thêm giao dịch mới vào cuối Sheet.
 */
function addTransaction(data) {
  try {
    const SS = openSpreadsheet();
    const sheet = SS.getSheetByName(TRANSACTION_SHEET_NAME);
    const newId = new Date().getTime().toString(); 
    
    const newRow = [
      newId,
      new Date(data.date), 
      data.type,
      data.category,
      data.description,
      parseFloat(data.amount)
    ];

    sheet.appendRow(newRow);
    return { success: true, message: 'Thêm giao dịch thành công!', id: newId };
  } catch (e) {
    return { success: false, message: 'Lỗi khi thêm giao dịch: ' + e.toString() };
  }
}

/**
 * Xóa một giao dịch dựa trên Số thứ tự hàng (rowNum).
 */
function deleteTransaction(rowNum) {
  try {
    const SS = openSpreadsheet();
    const sheet = SS.getSheetByName(TRANSACTION_SHEET_NAME);
    sheet.deleteRow(rowNum);
    return { success: true, message: 'Xóa giao dịch thành công!' };
  } catch (e) {
    return { success: false, message: 'Lỗi khi xóa giao dịch: ' + e.toString() };
  }
}

/**
 * Sửa giao dịch dựa trên Số thứ tự hàng (rowNum).
 */
function updateTransaction(data) {
  try {
    const SS = openSpreadsheet();
    const sheet = SS.getSheetByName(TRANSACTION_SHEET_NAME);
    const rowNum = parseInt(data.rowNum);
    
    const values = [
      data.id,
      new Date(data.date),
      data.type,
      data.category,
      data.description,
      parseFloat(data.amount)
    ];
    
    sheet.getRange(rowNum, 1, 1, 6).setValues([values]);
    return { success: true, message: 'Cập nhật giao dịch thành công!' };
  } catch (e) {
    return { success: false, message: 'Lỗi khi cập nhật giao dịch: ' + e.toString() };
  }
}