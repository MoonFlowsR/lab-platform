const fs = require('node:fs');
const path = require('node:path');
module.exports = function createDatabaseBackup({ db, backupDir, clock = () => new Date(), retain = 72 }) {
  let active;
  return function backupDatabase() {
    if (active) return active;
    active = (async () => {
      fs.mkdirSync(backupDir, {recursive:true});
      const stamp = clock().toISOString().replace(/[-:.TZ]/g, '');
      const target = path.join(backupDir, 'lab_platform_' + stamp + '.db');
      const temporary = target + '.partial';
      try {
        await db.backup(temporary);
        const Database = require('better-sqlite3');
        const copy = new Database(temporary, {readonly:true});
        try { if (copy.pragma('integrity_check', {simple:true}) !== 'ok') throw new Error('备份完整性检查失败'); } finally { copy.close(); }
        fs.renameSync(temporary, target);
        const backups = fs.readdirSync(backupDir).filter(name => /^lab_platform_\d+\.db$/.test(name)).sort().reverse();
        for (const name of backups.slice(retain)) { try { fs.unlinkSync(path.join(backupDir,name)); } catch { /* Retry retention on the next successful backup. */ } }
        return target;
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    })().finally(() => { active = undefined; });
    return active;
  };
};
