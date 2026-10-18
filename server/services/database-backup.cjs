const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function removeOwnedDirectory(directory, parent) {
  if (path.dirname(path.resolve(directory)) !== path.resolve(parent)) throw Error('备份路径越界');
  if (fs.existsSync(directory) && !fs.lstatSync(directory).isSymbolicLink()) fs.rmSync(directory, { recursive: true, force: true });
}
function snapshotConfiguration(projectRoot, destination) {
  fs.mkdirSync(destination);
  const files = ['.env'];
  const config = path.join(projectRoot, 'src/config');
  if (fs.existsSync(config)) files.push(...fs.readdirSync(config).filter(name => name.endsWith('.json')).map(name => 'src/config/' + name));
  const manifest = {};
  for (const relative of files) {
    const source = path.join(projectRoot, relative);
    if (!fs.existsSync(source)) continue;
    if (!fs.lstatSync(source).isFile()) throw Error('配置文件类型不合法：' + relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = fs.readFileSync(source);
    fs.writeFileSync(target, bytes, { mode: 0o600 });
    manifest[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ files: manifest, photosIncluded: false }, null, 2));
}
function cleanRetiredSidecars(backupDir) {
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^lab_platform_\d+\.db\.partial-shm$/.test(name)) continue;
    const partial = path.join(backupDir, name.slice(0, -4));
    const completed = partial.slice(0, -8);
    // Only closed, published old snapshots with no WAL content are disposable.
    if (fs.existsSync(partial) || !fs.existsSync(completed)) continue;
    const wal = partial + '-wal';
    if (fs.existsSync(wal) && (!fs.lstatSync(wal).isFile() || fs.statSync(wal).size !== 0)) continue;
    for (const file of [wal, partial + '-shm']) if (fs.existsSync(file) && fs.lstatSync(file).isFile()) fs.unlinkSync(file);
  }
}
module.exports = function createDatabaseBackup({ db, backupDir, projectRoot, clock = () => new Date(), retain = 72 }) {
  let active;
  return function backupDatabase() {
    if (active) return active;
    active = (async () => {
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = clock().toISOString().replace(/[-:.TZ]/g, '');
      const target = path.join(backupDir, 'lab_platform_' + stamp + '.db');
      const temporary = target + '.partial', config = target + '.config', pendingConfig = config + '.partial';
      if ([target, temporary, config, pendingConfig].some(file => fs.existsSync(file))) throw Error('备份文件名冲突，请稍后重试');
      let configPublished = false, committed = false;
      try {
        if (projectRoot) snapshotConfiguration(projectRoot, pendingConfig);
        await db.backup(temporary);
        const Database = require('better-sqlite3');
        const copy = new Database(temporary, { fileMustExist: true });
        try {
          // Change the snapshot, never the live database, into a standalone file.
          if (copy.pragma('journal_mode=DELETE', { simple: true }) !== 'delete') throw Error('备份日志整理失败');
          if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw Error('备份完整性检查失败');
        } finally { copy.close(); }
        if (projectRoot) { fs.renameSync(pendingConfig, config); configPublished = true; }
        fs.renameSync(temporary, target);
        committed = true;
        cleanRetiredSidecars(backupDir);
        const backups = fs.readdirSync(backupDir).filter(name => /^lab_platform_\d+\.db$/.test(name)).sort().reverse();
        for (const name of backups.slice(retain)) {
          const file = path.join(backupDir, name);
          try { removeOwnedDirectory(file + '.config', backupDir); fs.unlinkSync(file); } catch { /* Retry retention on the next successful backup. */ }
        }
        return target;
      } finally {
        for (const file of [temporary, temporary + '-wal', temporary + '-shm']) if (fs.existsSync(file)) fs.unlinkSync(file);
        removeOwnedDirectory(pendingConfig, backupDir);
        if (configPublished && !committed) removeOwnedDirectory(config, backupDir);
      }
    })().finally(() => { active = undefined; });
    return active;
  };
};
