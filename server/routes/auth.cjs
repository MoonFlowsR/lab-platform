module.exports = function installAuth(context) {
const { authAttempts, ADMIN_INVITE_CODE, STUDENT_INVITE_CODE, TEACHER_INVITE_CODE, addAudit, app, asyncHandler, authMiddleware, bcrypt, db, getInitialAccountStatus, getRegisteredTeacherAccountsForDropdown, isChineseName, nowISO, publicAccount, recordChanges, signToken, studentProfiles } = context;
// Unknown accounts perform the same password check without revealing their existence.
const missingAccountHash = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), 12);
app.post("/api/auth/register", authAttempts.byAccount, asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  const accountType = req.body.account_type;

  if (!isChineseName(username)) throw new Error("账号必须为中文姓名，长度 2–12 个中文字符，可包含间隔号 ·。");
  if (!password || password.length < 6) throw new Error("密码至少 6 位。");
  if (!["student", "teacher", "admin"].includes(accountType)) throw new Error("账号类型不合法。");

  const studentCode = String(req.body.student_code || req.body.invite_code || "").trim();
  const teacherCode = String(req.body.teacher_code || "").trim();
  const adminCode = String(req.body.admin_code || "").trim();

  if (accountType === "student" && studentCode !== STUDENT_INVITE_CODE) {
    throw new Error("学生注册码错误，不能注册学生账号。");
  }

  if (accountType === "teacher" && teacherCode !== TEACHER_INVITE_CODE) {
    throw new Error("教师注册码错误，不能注册教师账号。");
  }

  if (accountType === "admin" && adminCode !== ADMIN_INVITE_CODE) {
    throw new Error("管理员注册码错误，不能注册管理员账号。");
  }

  const existed = db.prepare("SELECT id FROM accounts WHERE username = ?").get(username);
  if (existed) throw new Error("该中文姓名账号已存在，请直接登录或联系管理员。");

  const passwordHash = bcrypt.hashSync(password, 12);
  const createdAt = nowISO();
  const initialStatus = getInitialAccountStatus(accountType);

  const result = db.prepare(`
    INSERT INTO accounts
    (username, display_name, account_type, direction, teacher_name, status, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, username, accountType, req.body.direction || "", req.body.teacher_name || "", initialStatus, passwordHash, createdAt, createdAt);

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
  const safeAccount = publicAccount(account);
  addAudit(req, safeAccount, "register", "accounts", safeAccount._id, null, safeAccount);

  if (account.status === "pending") {
    return res.json({ ok: true, account: safeAccount, pending: true, message: "账号已提交注册，待管理员审核通过后才能登录。" });
  }

  res.json({ ok: true, account: safeAccount, session_token: signToken(account) });
}));

app.post("/api/auth/login", authAttempts.byAccount, asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  if (!isChineseName(username)) throw new Error("账号必须为中文姓名。");
  if (!password) throw new Error("请输入密码。");

  const account = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
  const passwordMatches = bcrypt.compareSync(password, account?.password_hash || missingAccountHash);
  if (!account || !passwordMatches) throw new Error("账号或密码错误。");
  if (account.status === "disabled") throw new Error("账号已停用，请联系管理员。");
  if (account.status === "pending") throw new Error("账号待管理员审核，通过后才能登录。");

  const safeAccount = publicAccount(account);
  addAudit(req, safeAccount, "login", "accounts", safeAccount._id, null, safeAccount);
  res.json({ ok: true, account: safeAccount, session_token: signToken(account) });
}));

app.post("/api/auth/me", authMiddleware, asyncHandler(async (req, res) => {
  res.json({ ok: true, account: req.account, teachers: getRegisteredTeacherAccountsForDropdown() });
}));

app.post("/api/profile/get", authMiddleware, asyncHandler(async (req, res) => {
  res.json({ ok: true, account: req.account, teachers: getRegisteredTeacherAccountsForDropdown() });
}));

app.post("/api/profile/save", authMiddleware, asyncHandler(async (req, res) => {
  studentProfiles.save(req, req.account, req.body || {});
  const account = publicAccount(db.prepare("SELECT * FROM accounts WHERE username=?").get(req.account.username));
  recordChanges.notify(); res.json({ ok: true, account });
}));
};
