module.exports = function createAdminOperations(context) {
const { accountSessions, addAudit, bcrypt, db, deletionService, insertRecord, nextPublicId, nowISO, publicAccountForAdmin, recordChanges, requireAdmin, requireTeacherOrAdmin } = context;
return {
operation1(req, res, action, payload, account) {
if (action === "adminDeletePreview") {
    requireAdmin(account);
    return res.json({ ok: true, preview: deletionService.preview(payload.collection, payload.id) });
  }
},
operation2(req, res, action, payload, account) {
if (action === "adminDeleteRecord") {
    requireAdmin(account);
    const result = deletionService.execute(req, account, payload);
    recordChanges.notify();
    return res.json({ ok: true, ...result });
  }
},
operation4(req, res, action, payload, account) {
if (action === "changeMyPassword") {
    const oldPassword = String(payload.old_password || "").trim();
    const newPassword = String(payload.new_password || "").trim();

    if (!oldPassword) throw new Error("请输入当前密码。");
    if (!newPassword || newPassword.length < 6) throw new Error("新密码至少 6 位。");
    if (oldPassword === newPassword) throw new Error("新密码不能与当前密码相同。");

    const before = db.prepare("SELECT * FROM accounts WHERE username = ?").get(account.username);
    if (!before) throw new Error("账号不存在，请重新登录。");
    if (!bcrypt.compareSync(oldPassword, before.password_hash)) throw new Error("当前密码错误。");

    const passwordHash = bcrypt.hashSync(newPassword, 12);
    accountSessions.changePassword(before.id, passwordHash, () => {
      addAudit(req, account, action, "accounts", String(before.id), { username: before.username }, { username: before.username, password_changed: true });
    });
    recordChanges.disconnectAccount(before.id);
    return res.json({ ok: true });
  }
},
operation5(req, res, action, payload, account) {
if (action === "adminSetAccountStatus") {
    requireAdmin(account);
    const id = Number(payload.id);
    const status = String(payload.status || "").trim();

    if (!id) throw new Error("缺少账号 ID。");
    if (!["active", "disabled", "pending"].includes(status)) throw new Error("账号状态不合法。");
    if (id === Number(account.id)) throw new Error("不能修改当前管理员自己的账号状态。");

    const before = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    if (!before) throw new Error("未找到账号。");

    const revoked = accountSessions.changeStatus(id, status, () => {
      const after = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
      addAudit(req, account, action, "accounts", String(id), publicAccountForAdmin(before), publicAccountForAdmin(after));
    });
    if (revoked) recordChanges.disconnectAccount(id);
    const after = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    return res.json({ ok: true, account: publicAccountForAdmin(after) });
  }
},
operation6(req, res, action, payload, account) {
if (action === "adminResetPassword") {
    requireAdmin(account);
    const id = Number(payload.id);
    const newPassword = "123456";

    if (!id) throw new Error("缺少账号 ID。");

    const before = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    if (!before) throw new Error("未找到账号。");
    const passwordHash = bcrypt.hashSync(newPassword, 12);
    accountSessions.changePassword(id, passwordHash, () => {
      const after = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
      addAudit(req, account, action, "accounts", String(id), publicAccountForAdmin(before), publicAccountForAdmin(after));
    });
    recordChanges.disconnectAccount(id);
    return res.json({ ok: true });
  }
},
operation25(req, res, action, payload, account) {
if (action === "addUnit") {
    requireTeacherOrAdmin(account);
    const idInfo = nextPublicId("UNIT");
    const record = insertRecord("lab_test_processing_units", {
      ...payload,
      ...idInfo,
      created_by_username: account.username,
      created_by_name: account.display_name,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    addAudit(req, account, action, "lab_test_processing_units", record._id, null, record);
    return res.json({ ok: true });
  }
},
};
};
