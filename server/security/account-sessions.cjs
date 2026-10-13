module.exports = function createAccountSessions({ db, nowISO }) {
  // Additive, repeatable migration; existing users keep version zero and remain signed in.
  db.transaction(() => {
    if (!db.pragma('table_info(accounts)').some(column => column.name === 'session_version')) {
      db.exec('ALTER TABLE accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0)');
    }
  }).immediate();
  function version(account) {
    const value = Number(account.session_version ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('账号登录版本无效，请联系管理员。');
    return value;
  }
  function matches(token, account) {
    const current = version(account);
    // Tokens issued before this update have no account version. They expire after the first password change.
    return token.session_version === undefined ? current === 0 : Number.isSafeInteger(token.session_version) && token.session_version === current;
  }
  function changePassword(id, passwordHash, audit) {
    return db.transaction(() => {
      const result = db.prepare('UPDATE accounts SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?').run(passwordHash, nowISO(), id);
      if (result.changes !== 1) throw new Error('未找到账号。');
      audit();
    }).immediate();
  }
  function changeStatus(id, status, audit) {
    return db.transaction(() => {
      const before = db.prepare('SELECT status FROM accounts WHERE id = ?').get(id);
      if (!before) throw new Error('未找到账号。');
      // Reenabling also revokes tokens issued before this protection was installed.
      const revoke = before.status !== status && (before.status === 'active' || status === 'active');
      db.prepare('UPDATE accounts SET status = ?, session_version = session_version + ?, updated_at = ? WHERE id = ?').run(status, Number(revoke), nowISO(), id);
      audit();
      return revoke;
    }).immediate();
  }
  return { version, matches, changePassword, changeStatus };
};
