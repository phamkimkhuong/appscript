const SHEET_ID = "1BiQSXJbJra-83-kQDElzEQ_2kZtP3oXEAA5w0VV_GMg"; // ID Sheet của bạn

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('QL CÔNG VIỆC/VĂN BẢN')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// TÀI KHOẢN
// ==========================================
function loginUser(username, password) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == username && data[i][1] == password) {
      return { status: "success", username: data[i][0], name: data[i][2], role: data[i][3] };
    }
  }
  return { status: "error", message: "Sai tài khoản hoặc mật khẩu!" };
}

function registerUser(form) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == form.username) return { status: "error", message: "Tên đăng nhập đã tồn tại!" };
  }
  sheet.appendRow([form.username, form.password, form.fullName, form.role]);
  return { status: "success", message: "Đăng ký thành công!" };
}

// ==========================================
// CÔNG VIỆC
// ==========================================
function getTasksData() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  var data = sheet.getDataRange().getDisplayValues();
  var tasks = [];
  for (var i = 1; i < data.length; i++) {
    tasks.push({
      id: data[i][0], name: data[i][1], type: data[i][2], assigner: data[i][3],
      assignee: data[i][4], startDate: data[i][5], deadline: data[i][6],
      doneDate: data[i][7], status: data[i][8], evaluation: data[i][9], note: data[i][10]
    });
  }
  return tasks;
}

function getStaffList() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  var staff = [];
  for (var i = 1; i < data.length; i++) {
    staff.push({ username: data[i][0], name: data[i][2], role: data[i][3] });
  }
  return staff;
}

function addTask(form, assignerName) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  var newId = "CV" + new Date().getTime();
  var today = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  var d = new Date(form.deadline);
  var formattedDeadline = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  sheet.appendRow([newId, form.taskName, form.taskType, assignerName, form.assignee, today, formattedDeadline, "", "Chưa hoàn thành", "", form.note]);
  return "Thêm mới thành công!";
}

function updateTaskStatus(taskId, action, evalText) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      if (action === "complete") {
        sheet.getRange(i + 1, 8).setValue(today);
        sheet.getRange(i + 1, 9).setValue("Hoàn thành");
      } else if (action === "evaluate") {
        sheet.getRange(i + 1, 10).setValue(evalText);
      }
      return "Cập nhật thành công!";
    }
  }
}

function editTaskData(form) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == form.id) {
      var d = new Date(form.deadline);
      var formattedDeadline = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
      sheet.getRange(i + 1, 2).setValue(form.taskName);
      sheet.getRange(i + 1, 3).setValue(form.taskType);
      sheet.getRange(i + 1, 5).setValue(form.assignee);
      sheet.getRange(i + 1, 7).setValue(formattedDeadline);
      sheet.getRange(i + 1, 11).setValue(form.note);
      return "Sửa thành công!";
    }
  }
}

function deleteSelectedTask(taskId) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) { sheet.deleteRow(i + 1); return "Đã xóa công việc!"; }
  }
}

// ==========================================
// VĂN BẢN PHÁP LUẬT
// ==========================================
function getLegalDocs() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Legal_Docs");
  var data = sheet.getDataRange().getDisplayValues();
  var docs = [];
  for (var i = 1; i < data.length; i++) {
    docs.push({
      id: data[i][1], taxType: data[i][2], title: data[i][3], 
      issueDate: data[i][4], effectiveDate: data[i][5], link: data[i][6], note: data[i][7] 
    });
  }
  return docs.reverse();
}

function saveLegalDoc(form) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Legal_Docs");
  var dBanHanh = form.issueDate ? Utilities.formatDate(new Date(form.issueDate), "GMT+7", "dd/MM/yyyy") : "";
  var dHieuLuc = form.effectiveDate ? Utilities.formatDate(new Date(form.effectiveDate), "GMT+7", "dd/MM/yyyy") : "";
  
  if (form.id) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] == form.id) {
        sheet.getRange(i + 1, 3).setValue(form.taxType);
        sheet.getRange(i + 1, 4).setValue(form.title);
        sheet.getRange(i + 1, 5).setValue(dBanHanh);
        sheet.getRange(i + 1, 6).setValue(dHieuLuc);
        sheet.getRange(i + 1, 7).setValue(form.link);
        sheet.getRange(i + 1, 8).setValue(form.note);
        return "Cập nhật văn bản thành công!";
      }
    }
  } else {
    var newId = "VB" + new Date().getTime();
    sheet.appendRow(["", newId, form.taxType, form.title, dBanHanh, dHieuLuc, form.link, form.note]);
    return "Thêm mới văn bản thành công!";
  }
}

function deleteLegalDoc(docId) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Legal_Docs");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] == docId) {
      sheet.deleteRow(i + 1);
      return "Xóa văn bản thành công!";
    }
  }
}