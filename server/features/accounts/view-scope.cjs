// Per-account display preference; authorization still uses the assigned reviewer.
module.exports = function createAccountViewScope({ db }) {
  const setting = db.prepare('SELECT value FROM platform_settings WHERE key = ?');
  return account => (account?.account_type === 'finance' || account?.account_type === 'teacher' && setting.get('account_view_scope:' + account.id)?.value === 'all') ? 'all' : 'mine';
};
