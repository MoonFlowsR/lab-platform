const settings = require('../../src/config/platform-settings.json');
// Graduation cutoffs are calendar dates in Beijing, independent of the host timezone.
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
function graduationDeadline(year) {
  if (!Number.isInteger(year) || year < Math.min(2026,settings.graduationYearStart) || year > Math.max(2050,settings.graduationYearEnd)) return null;
  return new Date(Date.UTC(year, 11, 31, 16)).toISOString();
}

module.exports = function createStudentGraduationExpiry({ db, nowISO, accountSessions, addAudit, recordChanges, schedule = setInterval, cancel = clearInterval, onError = error => console.error('[student graduation expiry]', error.message || error) }) {
  let timer;
  const profileFor = db.prepare('SELECT graduation_year FROM student_profiles WHERE account_id = ?');
  const accountFor = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const dueAccounts = db.prepare(`SELECT a.*, p.graduation_year FROM accounts a
    JOIN student_profiles p ON p.account_id = a.id
    WHERE a.account_type = 'student' AND a.status IN ('active', 'pending') AND p.graduation_year <= ?
    ORDER BY a.id`);
  const systemRequest = { headers: {}, ip: 'local scheduler' };
  const systemAccount = { username: '系统维护', account_type: 'system' };

  function currentTime() {
    const value = new Date(nowISO());
    if (Number.isNaN(value.getTime())) throw new Error('毕业账号停用检查时间无效。');
    return value;
  }
  function isExpired(account, time = currentTime()) {
    if (account?.account_type !== 'student') return false;
    const deadline = graduationDeadline(profileFor.get(account.id)?.graduation_year);
    return !!deadline && time.getTime() >= Date.parse(deadline);
  }
  function auditAccount(account) {
    return { username: account.username, account_type: account.account_type, status: account.status, session_version: accountSessions.version(account) };
  }
  function disable(accounts) {
    if (!accounts.length) return [];
    const changed = db.transaction(() => {
      const ids = [];
      for (const candidate of accounts) {
        const before = accountFor.get(candidate.id);
        if (!before || !['active', 'pending'].includes(before.status) || !isExpired(before)) continue;
        const year = profileFor.get(before.id).graduation_year;
        accountSessions.changeStatus(before.id, 'disabled', () => {
          // Pending students may hold old registrations; expiry always revokes their sessions too.
          if (before.status === 'pending') db.prepare('UPDATE accounts SET session_version = session_version + 1 WHERE id = ?').run(before.id);
          const after = accountFor.get(before.id);
          addAudit(systemRequest, systemAccount, 'disableGraduatedStudent', 'accounts', String(before.id),
            auditAccount(before), { ...auditAccount(after), graduation_year: year, cutoff_at: graduationDeadline(year) });
        });
        ids.push(before.id);
      }
      return ids;
    }).immediate();
    // Disconnect only after the entire status/audit transaction has committed.
    for (const id of changed) recordChanges.disconnectAccount(id);
    if (changed.length) recordChanges.notify();
    return changed;
  }
  function sweep() {
    const china = new Date(currentTime().getTime() + CHINA_OFFSET_MS);
    const year = china.getUTCFullYear() - 1;
    return disable(dueAccounts.all(year));
  }
  function enforceAccount(account) {
    if (!account || !['active', 'pending'].includes(account.status) || !isExpired(account)) return account;
    disable([account]);
    return accountFor.get(account.id);
  }
  function assertMayActivate(account) {
    if (isExpired(account)) throw new Error('该学生毕业年份已结束，不能启用；请先更新毕业年份。');
  }
  function stop() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function start() {
    if (timer !== undefined) return;
    sweep(); // Also catches cutoffs crossed while the platform was stopped.
    timer = schedule(() => {
      if (!db.open) { stop(); return; }
      try { sweep(); } catch (error) { onError(error); }
    }, 60000);
    timer.unref?.();
  }
  return { sweep, enforceAccount, isExpired, assertMayActivate, start, stop };
};
module.exports.graduationDeadline = graduationDeadline;
