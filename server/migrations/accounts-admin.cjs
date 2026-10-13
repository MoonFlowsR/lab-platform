module.exports = function migrateAdminAccounts({ db, nowISO }) {

  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get();
  const sql = row?.sql || "";
  if (sql.includes("'admin'")) return;

  console.log("[MIGRATE] Rebuilding accounts table to allow admin account_type...");

  const migratedAt = nowISO();
  db.exec(`
    PRAGMA foreign_keys = OFF;

    ALTER TABLE accounts RENAME TO accounts_old_admin_migration;

    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('student', 'teacher', 'admin')),
      direction TEXT DEFAULT '',
      teacher_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO accounts
      (id, username, display_name, account_type, direction, teacher_name, status, password_hash, created_at, updated_at)
    SELECT
      id, username, display_name, account_type, direction, teacher_name, status, password_hash, created_at, updated_at
    FROM accounts_old_admin_migration;

    DROP TABLE accounts_old_admin_migration;

    PRAGMA foreign_keys = ON;
  `);

  console.log("[MIGRATE] accounts table migrated for admin at " + migratedAt);

};
