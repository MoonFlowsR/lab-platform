const canViewReceipts = role => ['teacher', 'finance', 'admin'].includes(role);

function createInventoryReminder({ db, nowISO, addAudit }) {
  db.exec(`CREATE TABLE IF NOT EXISTS inventory_reminder_reads (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    account_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    student_name TEXT NOT NULL,
    acknowledged_at TEXT NOT NULL
  )`);
  const find = db.prepare('SELECT acknowledged_at FROM inventory_reminder_reads WHERE session_id=? AND account_id=?');
  const insert = db.prepare('INSERT INTO inventory_reminder_reads(session_id,account_id,username,student_name,acknowledged_at) VALUES(?,?,?,?,?)');

  const saveRead = db.transaction((req, sessionId) => {
    const account = req.account;
    const previous = find.get(sessionId, account._id);
    if (previous) return { ...previous, created: false };
    const acknowledgedAt = nowISO();
    insert.run(sessionId, account._id, account.username, account.display_name, acknowledgedAt);
    addAudit(req, account, 'acknowledgeInventoryReminder', 'accounts', account._id, null,
      { username: account.username, display_name: account.display_name, acknowledged_at: acknowledgedAt });
    return { acknowledged_at: acknowledgedAt, created: true };
  });

  const matches = "(@query='' OR instr(lower(student_name), lower(@query))>0 OR instr(lower(username), lower(@query))>0 OR instr(strftime('%Y-%m-%d %H:%M:%S', acknowledged_at, '+8 hours'), @query)>0)";
  const total = db.prepare('SELECT count(*) AS n FROM inventory_reminder_reads WHERE ' + matches);
  const page = db.prepare('SELECT id, username, student_name, acknowledged_at FROM inventory_reminder_reads WHERE ' + matches +
    ' AND (@before IS NULL OR id < @before) ORDER BY id DESC LIMIT @limit');
  const history = db.transaction(({ query = '', before, expanded } = {}) => {
    const search = String(query).trim().slice(0, 200).replace(/(\d)\/(?=\d)/g, '$1-');
    const limit = expanded === true ? 10 : 1;
    const rows = page.all({ query: search, before: Number.isSafeInteger(before) && before > 0 ? before : null, limit: limit + 1 });
    return { total: total.get({ query: search }).n, rows: rows.slice(0, limit), has_more: rows.length > limit };
  });

  return {
    // Already-open sessions predate the reminder. New student logins have a distinct signed jti.
    required: (account, sessionId) => account.account_type === 'student' && Boolean(sessionId) && !find.get(sessionId, account._id),
    acknowledge: (req, sessionId) => saveRead.immediate(req, sessionId),
    history,
  };
}

module.exports = { createInventoryReminder, canViewReceipts };
