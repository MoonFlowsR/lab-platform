module.exports = function startPlatform(context) {
const { BACKUP_DIR, DB_PATH, DIST_DIR, HOST, PORT, app, db, express, fs, path } = context;
function backupDatabase() {
  try {
    db.pragma("wal_checkpoint(FULL)");
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const target = path.join(BACKUP_DIR, `lab_platform_${stamp}.db`);
    fs.copyFileSync(DB_PATH, target);

    const backups = fs.readdirSync(BACKUP_DIR).filter((name) => name.endsWith(".db")).sort().reverse();
    backups.slice(72).forEach((name) => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, name)); } catch { /* Retention cleanup must not interrupt a successful backup. */ }
    });

    console.log(`[backup] ${target}`);
  } catch (error) {
    console.error("[backup failed]", error.message || error);
  }
}

backupDatabase();

setInterval(backupDatabase, 60 * 60 * 1000);

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
