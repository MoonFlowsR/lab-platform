module.exports = function initializeSchema(db) {
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
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

CREATE TABLE IF NOT EXISTS id_counters (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  public_id TEXT,
  applicant_username TEXT,
  operator_username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
CREATE INDEX IF NOT EXISTS idx_records_public_id ON records(public_id);
CREATE INDEX IF NOT EXISTS idx_records_applicant ON records(collection, applicant_username);
CREATE INDEX IF NOT EXISTS idx_records_operator ON records(collection, operator_username);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_username TEXT,
  operator_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
`);
};
