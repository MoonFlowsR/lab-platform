// Runtime dependencies are built once; route installers share these exact instances.
module.exports = function createRuntime({ clock = () => new Date().toISOString() } = {}) {
require('./config.cjs');
const createDeletionService = require("./services/admin-record-deletion.cjs");

const recordChanges = require("./services/record-changes.cjs")();
const studentNameLabels = require("./features/accounts/student-name-labels.cjs");

const retiredLocationPhotoIds = require("./legacy/retired-location-photos.cjs");

const express = require("express");

const initializeMaterialStock = require("./features/inventory/material-initialization.cjs");

const updateBatchInformation = require("./features/inventory/batch-information.cjs");

const storageDetails = require("./features/inventory/storage-details.cjs");

const completeWorkValues = require("./features/work/work-completion.cjs");

const closeRejectedRequest = require("./features/work/request-closure.cjs");

const createStockOutService = require("./features/stock/stock-out-approval.cjs");

const path = require("path");

const fs = require("fs");

function loadLocalEnvFile() {
  const localEnvPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(localEnvPath)) return;

  const content = fs.readFileSync(localEnvPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnvFile();

const Database = require("better-sqlite3");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const multer = require("multer");

const PORT = Number(process.env.PORT || 3001);

const HOST = process.env.HOST || "127.0.0.1";

function requiredSecret(name, minLength) {
  const value = String(process.env[name] || '').trim();
  if (value.length < minLength || /(?:change.?me|replace.?with|example|your.secret)/i.test(value)) {
    throw new Error(name + ' 未配置或不安全，请检查本机 .env 配置。');
  }
  return value;
}

const JWT_SECRET = requiredSecret('JWT_SECRET', 32);

const TEACHER_INVITE_CODE = requiredSecret('TEACHER_INVITE_CODE', 12);

const ADMIN_INVITE_CODE = requiredSecret('ADMIN_INVITE_CODE', 12);

const STUDENT_INVITE_CODE = requiredSecret('STUDENT_INVITE_CODE', 12);

if (new Set([TEACHER_INVITE_CODE, ADMIN_INVITE_CODE, STUDENT_INVITE_CODE]).size !== 3) throw new Error('三个角色的注册码必须互不相同。');



const MATERIAL_FUND_TOTAL = process.env.MATERIAL_FUND_TOTAL ? Number(process.env.MATERIAL_FUND_TOTAL) : null;

const TEST_FUND_TOTAL = process.env.TEST_FUND_TOTAL ? Number(process.env.TEST_FUND_TOTAL) : null;

const WORK_REQUEST_EDIT_FIELDS = [
  "request_type", "work_content", "external_unit", "repair_personnel", "workload_quantity", "workload_unit",
  "safety_notes", "cost_material", "cost_test", "cost_processing", "cost_repair", "remark", "review_teacher_username"
];

const PURCHASE_EDIT_FIELDS = [
  "material_name", "specification", "quantity", "unit", "preferred_supplier",
  "estimated_price", "safety_notes", "repeat_purchase_confirmed", "purchase_purpose", "purchase_category", "remark", "review_teacher_username"
];

const ROOT = path.resolve(__dirname, "..");

const DATA_DIR = path.join(__dirname, "data");

const BACKUP_DIR = path.join(__dirname, "backups");

const DB_PATH = path.join(DATA_DIR, "lab_platform.db");

const UPLOAD_DIR = path.join(__dirname, "uploads");

const DIST_DIR = path.join(ROOT, "dist");

fs.mkdirSync(DATA_DIR, { recursive: true });

fs.mkdirSync(BACKUP_DIR, { recursive: true });

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.pragma("foreign_keys = ON");

db.pragma("secure_delete = ON");

require('./db/schema.cjs')(db);

function nowISO() {
  return clock();
}

db.prepare("INSERT OR IGNORE INTO id_counters (id, value, updated_at) VALUES (1, 0, ?)").run(nowISO());

require('./migrations/accounts-admin.cjs')({ db, nowISO });

const accountSessions = require('./security/account-sessions.cjs')({ db, nowISO });

const { nextPublicId, insertRecord, getRecord, updateRecord, listRecords, addAudit } = require("./db/records.cjs")({ db, nowISO, dateStampCN, padSerial });

const studentProfiles = require("./features/accounts/student-profiles.cjs")({ db, nowISO, addAudit });

const graduationExpiry = require('./security/student-graduation-expiry.cjs')({ db, nowISO, accountSessions, addAudit, recordChanges });
graduationExpiry.start();
const closeDatabase = db.close.bind(db);
db.close = function close() { graduationExpiry.stop(); return closeDatabase(); };

require("./migrations/purpose-migration.cjs")({ db, nowISO, addAudit });



const app = express();

app.set("json replacer", (key, value) => key === "storage_photo_attachment_id" ? undefined : value);

const authAttempts = require("./security/auth-rate-limit.cjs")();
app.use(authAttempts.byIp);

const requestJson = require('./security/request-json.cjs')(express);
app.use(requestJson.ordinary);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function safeFileName(name) {
  return path.basename(String(name || "attachment")).replace(/[^\u4e00-\u9fa5a-zA-Z0-9._ -]/g, "_");
}

function safeCollectionName(name) {
  return String(name || "general").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getMonthFolder() {
  return new Date().toISOString().slice(0, 7);
}

function dateStampCN(date = new Date()) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10).replace(/-/g, "");
}

function padSerial(value, width = 6) {
  return String(value).padStart(width, "0");
}

function isValidLoginId(value) {
  const settings = require('../src/config/platform-settings.json');
  const text = String(value || '').trim();
  return settings.loginIdentifier === 'identifier' ? /^[\p{L}\p{N}_.-]{2,32}$/u.test(text) : /^[\u4e00-\u9fa5·]{2,12}$/.test(text);
}

function pickFields(source, fields) {
  const output = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) output[key] = source[key];
  }
  return output;
}

function purchasePurpose(value) {
  const purpose = String(value || "").trim();
  if (!["私用/项目用（出库需采购人审批）", "公用"].includes(purpose)) throw new Error("请选择采购使用目的：私用/项目用（出库需采购人审批）或公用。");
  return purpose;
}

function batchPurchasePurpose(batch) {
  if (batch.purchase_purpose) return batch.purchase_purpose;
  const purchase = batch.related_purchase_record_id ? getRecord("lab_purchase_requests", batch.related_purchase_record_id)
    : listRecords("lab_purchase_requests", row => row.public_id === batch.related_purchase_id)[0];
  return purchase?.purchase_purpose || batch.purchase_purpose || "";
}

function requireStockEvidence(account, id, transactionType) {
  const attachment = getRecord("lab_attachments", id);
  if (!attachment || attachment.deleted_at) throw new Error(transactionType + "必须上传附件证明。");
  if (transactionType === "出库" && !isImageAttachmentRecord(attachment)) throw new Error("出库照片仅支持 PNG、JPG/JPEG。");
  const extension = path.extname(attachment.original_name || "").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"].includes(extension)) throw new Error("附件证明格式不支持。");
  if (attachment.target_collection !== "draft_attachments" || attachment.uploaded_by_username !== account.username) {
    throw new Error(transactionType + "附件状态异常，请重新选择附件后提交。");
  }
  return attachment;
}

function bindStockEvidence(attachment, transaction) {
  updateRecord("lab_attachments", attachment._id, {
    target_collection: "lab_stock_transactions", target_id: transaction._id,
    target_public_id: transaction.public_id, attachment_state: "bound", bound_at: nowISO(),
  });
}

function requireItemPhoto(account, payload, transactionType = "入库") {
  const item = requireStockEvidence(account, payload.photo_attachment_id, transactionType);
  if (!isImageAttachmentRecord(item)) throw new Error("物品特写须上传 PNG、JPG/JPEG 照片。");
  return item;
}

function requiredPurchaseExpiryDate(value) {
  const date = optionalExpiryDate(value);
  if (!date) throw new Error("请选择有效期日期。");
  return date;
}

function purchaseCategory(value) {
  const category = String(value || "").trim();
  if (!["试剂原料", "耗材"].includes(category)) throw new Error("请选择采购类别。");
  return category;
}

function optionalExpiryDate(value) {
  const date = String(value ?? "").trim();
  if (date === "长期") return date;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < "2000-01-01" || date > "2099-12-31")) {
    throw new Error("请填写有效的有效期日期。");
  }
  return date;
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

const workDefinitions = require('../src/config/work-types.json');
function workRequestCosts(source, requestType) {
  const key = workDefinitions.find(item => item.name === requestType)?.feeKey;
  if (!key) throw new Error('不支持的申请类型。');
  const value = source[key];
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error("请填写预计总" + requestType + "费。");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("预计总" + requestType + "费必须为不小于 0 的有效金额。");
  return { cost_test: requestType === "测试" ? amount : 0, cost_processing: requestType === "加工" ? amount : 0, cost_repair: requestType === "维修" ? amount : 0, cost_material: 0 };
}

function saveWorkWithAttachments(account, attachmentIds, save) {
  if (!Array.isArray(attachmentIds)) throw new Error("附件列表格式不正确。");
  return db.transaction(() => {
    const drafts = [...new Set(attachmentIds.map(String))].map((id) => {
      const row = getRecord("lab_attachments", id);
      if (!row || row.deleted_at || row.target_collection !== "draft_attachments" || row.uploaded_by_username !== account.username) {
        throw new Error("附件尚未正确上传，请重新选择附件后提交。");
      }
      if (!fs.existsSync(path.join(UPLOAD_DIR, row.storage_path || ""))) throw new Error("附件文件不存在，请重新上传。");
      return row;
    });
    const record = save();
    for (const row of drafts) updateRecord("lab_attachments", row._id, {
      target_collection: "lab_work_requests", target_id: record._id, target_public_id: record.public_id,
      attachment_state: "bound", bound_at: nowISO(),
    });
    return record;
  })();
}

const { purchaseNameAliases = {} } = require('../src/config/dropdown-options.json');

const nameKey = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, '');

const aliases = new Map(Object.entries(purchaseNameAliases).map(([alias, name]) => [nameKey(alias), name]));

function normalizeItemName(value) { return nameKey(aliases.get(nameKey(value)) || value); }

function isImageAttachmentRecord(attachment) {
  if (!attachment) return false;
  const name = String(attachment.original_name || "").toLowerCase();
  const mime = String(attachment.mime_type || "").toLowerCase();
  return mime.startsWith("image/") || [".png", ".jpg", ".jpeg"].some((ext) => name.endsWith(ext));
}

const buildMaterialCatalog = require('./features/inventory/material-catalog.cjs');

const accountViewScope = require("./features/accounts/view-scope.cjs")({ db });

function publicAccount(account) {
  const student_profile = studentProfiles.read(account);
  return {
    student_profile, profile_required: account.account_type === "student" && !student_profile,
    _id: String(account.id),
    username: account.username,
    display_name: account.display_name || account.username,
    account_type: account.account_type,
    default_view_scope: accountViewScope(account),
    direction: account.direction || "",
    teacher_name: account.teacher_name || "",
    status: account.status || "active",
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

function signToken(account) {
  return jwt.sign(
    { account_id: account.id, username: account.username, account_type: account.account_type, auth_version: studentProfiles.authVersion(), session_version: accountSessions.version(account) },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

db.exec(`
  CREATE TABLE IF NOT EXISTS lab_user_hidden_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    target_collection TEXT NOT NULL,
    target_id TEXT DEFAULT '',
    target_public_id TEXT DEFAULT '',
    target_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(username, target_collection, target_key)
  );
`);

function requireTeacherOrAdmin(account) {
  if (!["teacher", "admin"].includes(account.account_type)) {
    throw new Error("只有教师或管理员账号可以执行此操作。");
  }
}

function requireStudentSubmission(account) {
  if (account.account_type !== "student") throw new Error("只有学生账号可以提交申请或新建出入退库记录。");
}

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new Error("缺少登录 token，请重新登录。");

    const decoded = jwt.verify(token, JWT_SECRET);
    const account = graduationExpiry.enforceAccount(db.prepare("SELECT * FROM accounts WHERE username = ?").get(decoded.username));

    if (!account) throw new Error("账号不存在。");
    if (account.status !== "active") throw new Error("账号未启用，请联系管理员。");
    if (decoded.auth_version !== studentProfiles.authVersion() || Number(decoded.account_id) !== account.id) throw new Error("登录状态已更新，请刷新页面重新登录；学生登录后须完善个人信息。");

    if (!accountSessions.matches(decoded, account)) throw new Error("登录状态已失效，请重新登录。");

    req.account = publicAccount(account);
    if (req.account.profile_required && !["/api/auth/me", "/api/profile/get", "/api/profile/save"].includes(req.path)) return res.status(403).json({ ok: false, code: "PROFILE_REQUIRED", message: "请先完善系统责任教师、实际指导教师和毕业年份。" });
    next();
  } catch (error) {
    res.status(401).json({ ok: false, code: "SESSION_EXPIRED", message: error.message || "登录状态无效，请重新登录。" });
  }
}

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      console.error(error);
      res.status(400).json({ ok: false, message: error.message || String(error) });
    });
  };
}

function getInitialAccountStatus(accountType) {
  if (accountType === "student") return "active";

  if (accountType === "admin") {
    const existingAdmin = db.prepare("SELECT id FROM accounts WHERE account_type = 'admin' LIMIT 1").get();
    return existingAdmin ? "pending" : "active";
  }

  if (accountType === "teacher") return "pending";
  return "active";
}

function requireAdmin(account) {
  if (account.account_type !== "admin") throw new Error("只有管理员账号可以执行此操作。");
}

function publicAccountForAdmin(row) {
  const student_profile = studentProfiles.read(row);
  return {
    student_profile, profile_required: row.account_type === "student" && !student_profile,
    _id: row.id,
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    account_type: row.account_type,
    direction: row.direction || "",
    teacher_name: row.teacher_name || "",
    status: row.status || "active",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function listAccountsForAdmin() {
  return db.prepare(`
    SELECT id, username, display_name, account_type, direction, teacher_name, status, created_at, updated_at
    FROM accounts
    ORDER BY account_type ASC, display_name ASC, username ASC
  `).all().map(publicAccountForAdmin);
}

function listHiddenRecordsForAccount(account) {
  return db.prepare(`
    SELECT id, username, target_collection, target_id, target_public_id, target_key, created_at
    FROM lab_user_hidden_records
    WHERE username = ?
    ORDER BY id DESC
  `).all(account.username);
}

function validatePersonalHiddenCollection(collection) {
  const allowed = ["lab_work_requests", "lab_purchase_requests", "lab_stock_transactions"];
  if (!allowed.includes(collection)) {
    throw new Error("该类型记录暂不支持从个人列表删除。");
  }
  return collection;
}

function requireOwner(row, account) {
  if (account.account_type !== "admin" && row.applicant_username !== account.username) throw new Error("只能操作本人提交的申请。");
}

function addReviewLog(row, account, action, beforeStatus, afterStatus, note, targetCollection = "lab_work_requests") {
  insertRecord("lab_review_logs", {
    target_collection: targetCollection,
    target_id: row._id,
    target_public_id: row.public_id,
    action,
    before_status: beforeStatus,
    after_status: afterStatus,
    reviewer_name: account.display_name,
    reviewer_username: account.username,
    reviewer_account_type: account.account_type,
    review_note: note || "",
    created_at: nowISO(),
    updated_at: nowISO(),
  });
}

function getAccountDisplayNameForAcl(account) {
  return String(account?.display_name || account?.username || "").trim();
}

function isStudentAccountForAcl(account) {
  return account?.account_type === "student";
}

function isOwnerStudentForAcl(row, account) {
  if (!isStudentAccountForAcl(account)) return true;
  const username = String(account?.username || "").trim();
  const displayName = getAccountDisplayNameForAcl(account);
  return String(row?.applicant_username || "").trim() === username ||
    String(row?.applicant_name || "").trim() === displayName;
}

function getPublicTeacherAccountsForDropdown() {
  try {
    const rows = db.prepare(`
      SELECT id, username, display_name, account_type
      FROM accounts
      WHERE account_type = 'teacher' AND status = 'active'
      ORDER BY display_name ASC, username ASC
    `).all();

    return rows.map((row) => ({
      _id: row.id,
      username: row.username,
      display_name: row.display_name || row.username,
      account_type: row.account_type,
    }));
  } catch (error) {
    console.error("读取教师账号列表失败：", error);
    return [];
  }
}

function getRegisteredTeacherAccountsForDropdown() {
  return db.prepare("SELECT username,display_name,account_type FROM accounts WHERE account_type='teacher' ORDER BY display_name,username").all();
}

function selectedStockTeachers(account) {
  return studentProfiles.snapshot(account);
}

function selectedReviewTeacher(payload) {
  const username = String(payload.review_teacher_username || "").trim();
  if (!username) throw new Error("请选择审核教师。");
  const teacher = db.prepare("SELECT username, display_name FROM accounts WHERE username = ? AND account_type = 'teacher' AND status = 'active'").get(username);
  if (!teacher) throw new Error("审核教师不存在或尚未启用，请重新选择。");
  return { review_teacher_username: teacher.username, review_teacher_name: teacher.display_name || teacher.username };
}

function requireAssignedReviewer(row, account) {
  if (account.account_type !== "teacher" || !row.review_teacher_username || row.review_teacher_username !== account.username) throw new Error("仅被指定的审核教师可以审核此工单，其他教师和管理员不能审核。");
}

function ensureCanAccessAttachmentTarget(account, targetCollection, targetId, { readOnly = false } = {}) {
  if (!targetCollection || !targetId) throw new Error("缺少附件关联对象。");

  if (targetCollection === "lab_work_requests") {
    const row = getRecord("lab_work_requests", targetId);
    if (!row) throw new Error("未找到关联测试/加工/维修申请。");
    if (!readOnly && isStudentAccountForAcl(account) && !isOwnerStudentForAcl(row, account)) throw new Error("无权修改其他成员申请的附件。");
    return row;
  }

  if (targetCollection === "lab_purchase_requests") {
    const row = getRecord("lab_purchase_requests", targetId);
    if (!row) throw new Error("未找到关联采购申请。");
    if (!readOnly && isStudentAccountForAcl(account) && !isOwnerStudentForAcl(row, account)) throw new Error("无权访问该采购申请附件。");
    return row;
  }

  if (targetCollection === "lab_stock_transactions") {
    const row = getRecord("lab_stock_transactions", targetId);
    if (!row) throw new Error("未找到关联出入退库记录。");
    if (isStudentAccountForAcl(account) && String(row.operator_username || "") !== String(account.username || "")) {
      throw new Error("无权访问该出入退库照片。");
    }
    return row;
  }

  if (targetCollection === "lab_stock_out_requests") {
    const row = getRecord(targetCollection, targetId);
    if (!row) throw new Error("未找到关联出库申请。");
    if (!readOnly) throw new Error("已提交出库申请的照片不可单独修改，请撤回并重新申请。");
    return row;
  }

  throw new Error("不支持的附件关联类型。");
}

function isSharedStockEvidence(attachment, stockRows = null, batchRows = null) {
  if (!attachment || attachment.deleted_at) return false;
  // Completed movement evidence is shared; private drafts and unrelated purchase files stay private.
  const rows = stockRows || listRecords("lab_stock_transactions");
  return rows.some((row) =>
    (row.photo_attachment_id && String(row.photo_attachment_id) === String(attachment._id)) ||
    (attachment.target_collection === "lab_stock_transactions" && String(attachment.target_id) === String(row._id))
  ) || (batchRows || listRecords("lab_material_batches")).some(batch => [batch.inbound_photo_attachment_id].filter(Boolean).some(id => String(id) === String(attachment._id)));
}

function ensureCanDownloadAttachment(account, attachment) {
  if (!attachment) throw new Error("未找到附件。");
  if (attachment.deleted_at) throw new Error("附件已删除。");
  const retiredPhotoIds = retiredLocationPhotoIds(["lab_purchase_requests", "lab_stock_transactions", "lab_material_batches"].flatMap(collection => listRecords(collection)));
  if (retiredPhotoIds.has(String(attachment._id))) throw new Error("该历史附件入口已停用。");
  if (account.account_type === "admin" || isSharedStockEvidence(attachment)) return true;
  if (attachment.uploaded_by_username === account.username) return true;

  if (["lab_work_requests", "lab_purchase_requests", "lab_stock_transactions", "lab_stock_out_requests"].includes(attachment.target_collection)) {
    ensureCanAccessAttachmentTarget(account, attachment.target_collection, attachment.target_id, { readOnly: true });
    return true;
  }

  throw new Error("无权下载该附件。");
}

const { getPreviousPurchases, listAll } = require("./queries/snapshot.cjs")({ normalizeItemName, listRecords, num, MATERIAL_FUND_TOTAL, TEST_FUND_TOTAL, db, retiredLocationPhotoIds, isSharedStockEvidence, publicAccount, getPublicTeacherAccountsForDropdown, getRegisteredTeacherAccountsForDropdown, studentNameLabels, listHiddenRecordsForAccount, buildMaterialCatalog, listAccountsForAdmin });

const syncResponse = require("./services/sync-response.cjs")({ db, listAll });

const deletionService = createDeletionService({ db, uploadDir: UPLOAD_DIR, nowISO, addAudit });

const stockOutService = createStockOutService({ db, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO, storageDetails, requireItemPhoto, bindStockEvidence, batchPurchasePurpose, selectedStockTeachers });
return { graduationExpiry, accountSessions, authAttempts, ADMIN_INVITE_CODE, BACKUP_DIR, DB_PATH, DIST_DIR, HOST, PORT, PURCHASE_EDIT_FIELDS, STUDENT_INVITE_CODE, TEACHER_INVITE_CODE, UPLOAD_DIR, WORK_REQUEST_EDIT_FIELDS, addAudit, addReviewLog, app, asyncHandler, authMiddleware, batchPurchasePurpose, bcrypt, bindStockEvidence, closeRejectedRequest, completeWorkValues, db, deletionService, ensureCanAccessAttachmentTarget, ensureCanDownloadAttachment, express, fs, getInitialAccountStatus, getMonthFolder, getPreviousPurchases, getRecord, getRegisteredTeacherAccountsForDropdown, initializeMaterialStock, insertRecord, isValidLoginId, isImageAttachmentRecord, listRecords, nextPublicId, normalizeItemName, nowISO, num, path, pickFields, publicAccount, publicAccountForAdmin, purchaseCategory, purchasePurpose, recordChanges, requestJson, requireAdmin, requireAssignedReviewer, requireItemPhoto, requireOwner, requireStockEvidence, requireStudentSubmission, requireTeacherOrAdmin, requiredPurchaseExpiryDate, retiredLocationPhotoIds, safeCollectionName, safeFileName, saveWorkWithAttachments, selectedReviewTeacher, selectedStockTeachers, signToken, stockOutService, storageDetails, studentProfiles, syncResponse, updateBatchInformation, updateRecord, upload, validatePersonalHiddenCollection, workRequestCosts };
};
