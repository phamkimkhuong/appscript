function auditLog_(action, module, objectId, detail) {
  try {
    const auth = authorized_();

    saveRow_(CONFIG.SHEET_NAMES.AUDIT, {
      'Thời Gian': Utilities.formatDate(
        new Date(),
        CONFIG.TIMEZONE,
        'dd/MM/yyyy HH:mm:ss'
      ),
      'Email': REQUEST_CONTEXT_.email || '',
      'Mã NV': auth.empId || '',
      'Họ Tên': auth.name || '',
      'Vai Trò': auth.role || '',
      'Hành Động': safeText_(action, 200),
      'Phân Hệ': safeText_(module, 200),
      'Đối Tượng': safeText_(objectId, 200),
      'Chi Tiết': safeText_(detail, 1000)
    });
  } catch (err) {
    Logger.log('AUDIT ERROR: ' + err.message);
  }
}
