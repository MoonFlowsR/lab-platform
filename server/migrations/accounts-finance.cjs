// Rebuild only the role constraint; preserve every column, ID, index, trigger and FK target.
module.exports = function migrateFinanceAccounts({ db }) {
  const original = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get()?.sql;
  if (!original || /['"]finance['"]/.test(original)) return false;
  const updated = original.replace(/CHECK\s*\(\s*account_type\s+IN\s*\(([^)]+)\)\s*\)/i, (_, roles) => `CHECK(account_type IN (${roles}, 'finance'))`)
    .replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?accounts["`]?/i, 'CREATE TABLE accounts_finance_next');
  if (updated === original || !updated.includes("'finance'")) throw new Error('账号表结构无法自动升级，请联系维护者。');
  if (db.inTransaction) throw new Error('账号身份升级须在独立事务中运行。');
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  const columns = db.pragma('table_info(accounts)').map(row => '"' + row.name.replaceAll('"', '""') + '"').join(',');
  const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='accounts' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()?.seq || 0;
  try {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(updated);
      db.exec(`INSERT INTO accounts_finance_next (${columns}) SELECT ${columns} FROM accounts`);
      db.exec('DROP TABLE accounts; ALTER TABLE accounts_finance_next RENAME TO accounts;');
      for (const object of objects) db.exec(object.sql);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='accounts'").run(sequence);
      if (db.pragma('foreign_key_check').length) throw new Error('账号身份升级关联校验失败。');
    }).immediate();
  } finally {
    db.pragma('foreign_keys = ' + Number(foreignKeys));
  }
  return true;
};
