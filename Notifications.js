function createNotification_(empId, title, message, type, target) {
  try {
    require_(empId, 'Thiếu mã nhân viên nhận thông báo.');

    const id = 'TB-' + Utilities.getUuid();

    saveRow_(CONFIG.SHEET_NAMES.NOTIFICATIONS, {
      'Mã TB': id,
      'Mã NV': empId,
      'Tiêu Đề': safeText_(title, 300),
      'Nội Dung': safeText_(message, 1000),
      'Loại': safeText_(type || 'info', 50),
      'Link Phân Hệ': safeText_(target || '', 100),
      'Đã Đọc': 'FALSE',
      'Thời Gian': Utilities.formatDate(
        new Date(),
        CONFIG.TIMEZONE,
        'dd/MM/yyyy HH:mm:ss'
      )
    });

    return id;
  } catch (err) {
    Logger.log('CREATE NOTIFICATION ERROR: ' + err.message);
    return null;
  }
}

function getNotifications_() {
  const auth = authorized_();

  const list = rows_(CONFIG.SHEET_NAMES.NOTIFICATIONS)
    .filter(x => x['Mã NV'] === auth.empId)
    .map(x => ({
      id: x['Mã TB'],
      empId: x['Mã NV'],
      title: x['Tiêu Đề'],
      message: x['Nội Dung'],
      type: x['Loại'],
      target: x['Link Phân Hệ'],
      read: String(x['Đã Đọc']).toUpperCase() === 'TRUE',
      time: x['Thời Gian']
    }))
    .reverse();

  return {
    success: true,
    data: list
  };
}

function markNotificationRead_(id) {
  const auth = authorized_();

  const row = rows_(CONFIG.SHEET_NAMES.NOTIFICATIONS)
    .find(x =>
      x['Mã TB'] === id &&
      x['Mã NV'] === auth.empId
    );

  require_(row, 'Không tìm thấy thông báo.');

  saveRow_(CONFIG.SHEET_NAMES.NOTIFICATIONS, {
    'Đã Đọc': 'TRUE'
  }, row._rowIndex);

  return {
    success: true,
    message: 'Đã đánh dấu thông báo là đã đọc.'
  };
}