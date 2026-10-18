module.exports = function startPlatform(context) {
const { BACKUP_DIR, DB_PATH, DIST_DIR, HOST, PORT, app, db, express, fs, path } = context;
const backupDatabase = require('./database-backup.cjs')({ db, backupDir: BACKUP_DIR, projectRoot: path.resolve(__dirname, '../..') });
const runBackup = () => backupDatabase().then(target => console.log('[backup] ' + target)).catch(error => console.error('[backup failed]', error.message || error));
runBackup();
const backupTimer = setInterval(runBackup, 60 * 60 * 1000);
backupTimer.unref();

app.get('/api/health', (req, res) => {
  try { db.prepare('SELECT 1').get(); return res.json({ ok: true, service: 'lab-platform', database: 'ok' }); }
  catch { return res.status(503).json({ ok: false, service: 'lab-platform', database: 'unavailable' }); }
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, message: "API 不存在。" });
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log("");
  console.log("实验室管理平台已启动");
  console.log(`本机访问：http://localhost:${PORT}`);
  console.log(`局域网访问：http://本机IP:${PORT}`);
  console.log(`数据库文件：${DB_PATH}`);
  console.log(`备份目录：${BACKUP_DIR}`);

  console.log("");
});
};
