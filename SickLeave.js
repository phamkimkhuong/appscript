/**
 * ====================================================================
 * VINTECH SOLUTIONS - ENTERPRISE HRM & E-OFFICE BACKEND
 * Module: SickLeave.js (Quản lý Hồ sơ ốm đau BHXH & Đồng bộ công 'O')
 * ====================================================================
 */

/**
 * Lấy danh sách toàn bộ hồ sơ ốm đau
 */
function apiGetSickCases() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const data = sheetToObjects(sheet);
    return { success: true, data: data };
  } catch(err) {
    return { success: false, message: err.message };
  }
}

/**
 * Lấy hoặc tự động tạo thư mục chuyên dụng lưu trữ chứng từ BHXH trên Google Drive
 * Thư mục sẽ nằm trên Google Drive của tài khoản quản trị (người sở hữu dự án)
 */
function getOrCreateSickDocsFolder() {
  const folderName = "VinTech_ChungTu_BHXH";
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("SICK_DOCS_FOLDER_ID");

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch(e) {
      Logger.log("Folder cũ không tồn tại hoặc không thể truy cập, sẽ tạo mới: " + e.message);
    }
  }

  // Thử tìm theo tên hoặc tạo mới
  const folders = DriveApp.getFoldersByName(folderName);
  let targetFolder;
  if (folders.hasNext()) {
    targetFolder = folders.next();
  } else {
    targetFolder = DriveApp.createFolder(folderName);
  }

  props.setProperty("SICK_DOCS_FOLDER_ID", targetFolder.getId());
  return targetFolder;
}

/**
 * Tải file chứng từ y tế lên Google Drive và lấy link xem trực tiếp
 * @param {Object} fileData - { name: string, type: string, base64: string }
 * @param {string} empId - Mã nhân viên nộp hồ sơ
 * @param {string} caseId - Mã hồ sơ SC-...
 */
function uploadSickDocToDrive(fileData, empId, caseId) {
  if (!fileData || !fileData.base64) return null;

  try {
    const folder = getOrCreateSickDocsFolder();
    let rawBase64 = fileData.base64;
    if (rawBase64.indexOf(",") > -1) {
      rawBase64 = rawBase64.split(",")[1];
    }

    const decoded = Utilities.base64Decode(rawBase64);
    const cleanExt = (fileData.name && fileData.name.lastIndexOf(".") > -1)
      ? fileData.name.substring(fileData.name.lastIndexOf("."))
      : ".pdf";
    const fileName = `[BHXH]_${empId || "NV"}_${caseId || "SC"}_${new Date().getTime()}${cleanExt}`;
    const contentType = fileData.type || "application/pdf";
    const blob = Utilities.newBlob(decoded, contentType, fileName);

    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(shareErr) {
      Logger.log("Không thể set sharing: " + shareErr.message);
    }

    return file.getUrl();
  } catch(err) {
    Logger.log("Lỗi upload tệp lên Google Drive: " + err.message);
    return null;
  }
}

/**
 * Nộp hồ sơ ốm đau mới kèm upload chứng từ thật lên Google Drive (Xác thực danh tính)
 * @param {Object} form - Dữ liệu hồ sơ
 * @param {string} [callerEmail] - Email người nộp hồ sơ
 */
function apiSubmitSick(form, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  // Nhân viên thông thường chỉ được nộp hồ sơ cho chính mình
  if (auth.role === CONFIG.ROLES.EMPLOYEE && form.empId && form.empId !== auth.empId) {
    return { success: false, message: "Nhân viên chỉ có quyền nộp hồ sơ ốm đau cho chính mình!" };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const newId = "SC-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMM") + "-" + Math.floor(10 + Math.random() * 90);

    let docUrl = form.docUrl || "";
    // Nếu có file đính kèm gửi từ trình duyệt lên
    if (form.fileData && form.fileData.base64) {
      const uploadedUrl = uploadSickDocToDrive(form.fileData, form.empId || auth.empId, newId);
      if (uploadedUrl) {
        docUrl = uploadedUrl;
      }
    }
    if (!docUrl) {
      docUrl = "https://drive.google.com/sample_cert.pdf";
    }

    // Header: Mã Hồ Sơ | Mã NV | Họ và Tên | Cơ Sở Y Tế | Từ Ngày | Đến Ngày | Số Ngày | Chứng Từ URL | Trạng Thái | Ngày Duyệt | Người Duyệt
    sheet.appendRow([
      newId,
      form.empId || auth.empId,
      form.empName || auth.name,
      form.hospital,
      form.from,
      form.to,
      Number(form.days) || 1,
      docUrl,
      "PENDING",
      "",
      ""
    ]);

    return {
      success: true,
      message: `Nộp hồ sơ ốm đau thành công! Mã hồ sơ: ${newId}`,
      newId: newId,
      docUrl: docUrl
    };
  } catch(err) {
    return { success: false, message: "Lỗi nộp hồ sơ ốm đau: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Phê duyệt hồ sơ ốm đau (HR & Ban Quản Lý, kiểm tra quyền RBAC)
 * Tự động cập nhật ký hiệu 'O' vào bảng chấm công
 * @param {string} sickId - Mã hồ sơ SC-...
 * @param {string} [callerEmail] - Email của HR/Quản lý phê duyệt
 */
function apiApproveSick(sickId, callerEmail) {
  const auth = verifyUserAuthorization(callerEmail, [CONFIG.ROLES.HR, CONFIG.ROLES.MANAGER]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const sickData = sickSheet.getDataRange().getValues();

    let targetEmpId = null;
    let fromDateStr = null;
    let numDays = 1;
    let foundIndex = -1;
    let currentStatus = "";

    for (let i = 1; i < sickData.length; i++) {
      if (sickData[i][0] === sickId) {
        foundIndex = i + 1;
        currentStatus = (sickData[i][8] || "").toString().trim().toUpperCase();
        targetEmpId = sickData[i][1];
        fromDateStr = sickData[i][4];
        numDays = parseInt(sickData[i][6]) || 1;
        break;
      }
    }

    if (foundIndex < 0) return { success: false, message: "Không tìm thấy hồ sơ: " + sickId };

    if (currentStatus === "APPROVED") {
      return { success: false, message: `Hồ sơ ốm đau [${sickId}] đã được phê duyệt trước đó!` };
    }
    if (currentStatus === "REJECTED") {
      return { success: false, message: `Hồ sơ ốm đau [${sickId}] đã bị từ chối, không thể phê duyệt lại!` };
    }

    const reviewerName = auth.name || "HR / Ban Quản Lý";

    sickSheet.getRange(foundIndex, 9).setValue("APPROVED");
    sickSheet.getRange(foundIndex, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
    sickSheet.getRange(foundIndex, 11).setValue(reviewerName);

    // Tự động bắn vào bảng Chấm Công (ChamCong) với ký hiệu 'O' và tính lại công
    const attSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.ATTENDANCE);
    if (attSheet) {
      const attData = attSheet.getDataRange().getValues();
      let startDay = 1;
      try {
        if (fromDateStr instanceof Date) {
          startDay = fromDateStr.getDate();
        } else {
          const str = String(fromDateStr);
          if (str.includes("-")) {
            startDay = parseInt(str.split("-")[2]) || 1;
          } else {
            startDay = new Date(str).getDate() || 1;
          }
        }
      } catch(e) {
        startDay = 1;
      }

      for (let j = 1; j < attData.length; j++) {
        if (attData[j][0] === targetEmpId) {
          for (let d = 0; d < numDays; d++) {
            const targetCol = 3 + (startDay + d);
            if (targetCol <= 34) {
              attSheet.getRange(j + 1, targetCol).setValue("O");
            }
          }

          // Tính lại tổng công thực (X), phép (P), ốm (O)
          const rowVals = attSheet.getRange(j + 1, 4, 1, 31).getValues()[0];
          let totalX = 0, totalP = 0, totalO = 0;
          rowVals.forEach(s => {
            if (s === "X") totalX++;
            else if (s === "P") totalP++;
            else if (s === "O") totalO++;
          });

          attSheet.getRange(j + 1, 35).setValue(totalX); // Tổng công
          attSheet.getRange(j + 1, 36).setValue(totalP); // Tổng phép
          attSheet.getRange(j + 1, 37).setValue(totalO); // Tổng ốm
          break;
        }
      }
    }

    return { success: true, message: `Đã phê duyệt chế độ BHXH cho hồ sơ [${sickId}] và đồng bộ ký hiệu [O] vào Bảng Chấm Công!` };
  } catch(err) {
    return { success: false, message: "Lỗi duyệt hồ sơ BHXH: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Từ chối hồ sơ ốm đau BHXH (HR & Ban Quản Lý)
 * @param {string} sickId - Mã hồ sơ
 * @param {string} [reason] - Lý do từ chối
 * @param {string} [callerEmail] - Email của HR/Quản lý từ chối
 */
function apiRejectSick(sickId, reason, callerEmail) {
  let actualCaller = callerEmail;
  let actualReason = reason || "Chứng từ y tế chưa hợp lệ";

  if (!actualCaller && typeof reason === "string" && reason.includes("@")) {
    actualCaller = reason;
    actualReason = "Chứng từ y tế chưa hợp lệ";
  }

  const auth = verifyUserAuthorization(actualCaller, [CONFIG.ROLES.HR, CONFIG.ROLES.MANAGER]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, message: "Hệ thống đang bận!" };

  try {
    const ss = getSpreadsheet();
    const sickSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SICK);
    const sickData = sickSheet.getDataRange().getValues();

    for (let i = 1; i < sickData.length; i++) {
      if (sickData[i][0] === sickId) {
        const currentStatus = (sickData[i][8] || "").toString().trim().toUpperCase();
        if (currentStatus === "REJECTED") {
          return { success: false, message: `Hồ sơ BHXH [${sickId}] đã ở trạng thái từ chối trước đó!` };
        }
        if (currentStatus === "APPROVED") {
          return { success: false, message: `Hồ sơ BHXH [${sickId}] đã được phê duyệt và ghi nhận công. Không thể từ chối trực tiếp!` };
        }

        const reviewerName = auth.name || "HR / Ban Quản Lý";

        sickSheet.getRange(i + 1, 9).setValue("REJECTED");
        sickSheet.getRange(i + 1, 10).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm"));
        sickSheet.getRange(i + 1, 11).setValue(reviewerName + " (Từ chối: " + actualReason + ")");
        return { success: true, message: `Đã từ chối hồ sơ ốm đau BHXH [${sickId}]!` };
      }
    }
    return { success: false, message: "Không tìm thấy hồ sơ: " + sickId };
  } catch(err) {
    return { success: false, message: err.message };
  } finally {
    lock.releaseLock();
  }
}

