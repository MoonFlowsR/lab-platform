module.exports = function installAttachments(context) {
const { UPLOAD_DIR, addAudit, app, asyncHandler, authMiddleware, ensureCanAccessAttachmentTarget, ensureCanDownloadAttachment, fs, getMonthFolder, getRecord, insertRecord, listRecords, nowISO, path, retiredLocationPhotoIds, safeCollectionName, safeFileName, updateRecord, upload } = context;
app.post("/api/attachments/upload", authMiddleware, upload.single("file"), asyncHandler(async (req, res) => {
  const account = req.account;
  const file = req.file;
  if (!file) throw new Error("请选择需要上传的附件。");

  const targetCollection = String(req.body.target_collection || "").trim();
  const targetId = String(req.body.target_id || "").trim();
  const targetPublicId = String(req.body.target_public_id || "").trim();

  if (!targetCollection || !targetId) throw new Error("缺少附件关联对象。");

  ensureCanAccessAttachmentTarget(account, targetCollection, targetId);

  const collectionFolder = safeCollectionName(targetCollection);
  const monthFolder = getMonthFolder();
  const dir = path.join(UPLOAD_DIR, collectionFolder, monthFolder);
  fs.mkdirSync(dir, { recursive: true });

  const originalName = safeFileName(file.originalname);
  const ext = path.extname(originalName);
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const fullPath = path.join(dir, storedName);
  fs.writeFileSync(fullPath, file.buffer);

  const relativePath = path.relative(UPLOAD_DIR, fullPath).replace(/\\/g, "/");

  const record = insertRecord("lab_attachments", {
    target_collection: targetCollection,
    target_id: targetId,
    target_public_id: targetPublicId,
    original_name: originalName,
    stored_name: storedName,
    storage_path: relativePath,
    mime_type: file.mimetype || "application/octet-stream",
    size_bytes: file.size,
    uploaded_by_name: account.display_name,
    uploaded_by_username: account.username,
    uploaded_at: nowISO(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }, { operator_username: account.username });

  addAudit(req, account, "uploadAttachment", "lab_attachments", record._id, null, record);
  res.json({ ok: true, attachment: record });
}));

app.post("/api/attachments/uploadJson", authMiddleware, asyncHandler(async (req, res) => {
  const account = req.account;

  const targetCollection = String(req.body.target_collection || "").trim();
  const targetId = String(req.body.target_id || "").trim();
  const targetPublicId = String(req.body.target_public_id || "").trim();

  if (!targetCollection || !targetId) throw new Error("缺少附件关联对象。");

  ensureCanAccessAttachmentTarget(account, targetCollection, targetId);

  const originalName = safeFileName(req.body.original_name || "attachment");
  const mimeType = String(req.body.mime_type || "application/octet-stream");
  const fileBase64 = String(req.body.file_base64 || "");

  if (!fileBase64) throw new Error("附件内容为空。");

  const buffer = Buffer.from(fileBase64, "base64");
  if (!buffer.length) throw new Error("附件解析失败。");
  if (buffer.length > 20 * 1024 * 1024) throw new Error("单个附件暂时限制为 20 MB 以内。");

  const collectionFolder = safeCollectionName(targetCollection);
  const monthFolder = getMonthFolder();
  const dir = path.join(UPLOAD_DIR, collectionFolder, monthFolder);
  fs.mkdirSync(dir, { recursive: true });

  const ext = path.extname(originalName);
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const fullPath = path.join(dir, storedName);
  fs.writeFileSync(fullPath, buffer);

  const relativePath = path.relative(UPLOAD_DIR, fullPath).replace(/\\/g, "/");

  const record = insertRecord("lab_attachments", {
    target_collection: targetCollection,
    target_id: targetId,
    target_public_id: targetPublicId,
    original_name: originalName,
    stored_name: storedName,
    storage_path: relativePath,
    mime_type: mimeType,
    size_bytes: buffer.length,
    uploaded_by_name: account.display_name,
    uploaded_by_username: account.username,
    uploaded_at: nowISO(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }, { operator_username: account.username });

  addAudit(req, account, "uploadAttachmentJson", "lab_attachments", record._id, null, record);
  res.json({ ok: true, attachment: record });
}));

app.post("/api/attachments/uploadDraftJson", authMiddleware, asyncHandler(async (req, res) => {
  const account = req.account;
  const draftId = String(req.body.draft_id || "").trim();
  if (!draftId) throw new Error("缺少临时附件编号。");

  const originalName = safeFileName(req.body.original_name || "attachment");
  const mimeType = String(req.body.mime_type || "application/octet-stream");
  const fileBase64 = String(req.body.file_base64 || "");
  if (!fileBase64) throw new Error("附件内容为空。");

  const buffer = Buffer.from(fileBase64, "base64");
  if (!buffer.length) throw new Error("附件解析失败。");
  if (buffer.length > 20 * 1024 * 1024) throw new Error("单个附件暂时限制为 20 MB 以内。");

  const dir = path.join(UPLOAD_DIR, "draft_attachments", getMonthFolder());
  fs.mkdirSync(dir, { recursive: true });

  const ext = path.extname(originalName);
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const fullPath = path.join(dir, storedName);
  fs.writeFileSync(fullPath, buffer);

  const relativePath = path.relative(UPLOAD_DIR, fullPath).replace(/\\/g, "/");

  const record = insertRecord("lab_attachments", {
    target_collection: "draft_attachments",
    target_id: draftId,
    target_public_id: draftId,
    draft_id: draftId,
    attachment_state: "draft",
    original_name: originalName,
    stored_name: storedName,
    storage_path: relativePath,
    mime_type: mimeType,
    size_bytes: buffer.length,
    uploaded_by_name: account.display_name,
    uploaded_by_username: account.username,
    uploaded_at: nowISO(),
    created_at: nowISO(),
    updated_at: nowISO(),
  }, { operator_username: account.username });

  addAudit(req, account, "uploadDraftAttachment", "lab_attachments", record._id, null, record);
  res.json({ ok: true, attachment: record });
}));

app.post("/api/attachments/commitDraft", authMiddleware, asyncHandler(async (req, res) => {
  const account = req.account;
  const draftId = String(req.body.draft_id || "").trim();
  const targetCollection = String(req.body.target_collection || "").trim();
  const targetId = String(req.body.target_id || "").trim();
  const targetPublicId = String(req.body.target_public_id || "").trim();

  if (!draftId) throw new Error("缺少临时附件编号。");
  if (!targetCollection || !targetId) throw new Error("缺少附件绑定对象。");

  ensureCanAccessAttachmentTarget(account, targetCollection, targetId);

  const draftRows = listRecords("lab_attachments", (r) =>
    !r.deleted_at &&
    r.draft_id === draftId &&
    r.target_collection === "draft_attachments" &&
    r.uploaded_by_username === account.username
  );

  const updated = draftRows.map((row) => updateRecord("lab_attachments", row._id, {
    target_collection: targetCollection,
    target_id: targetId,
    target_public_id: targetPublicId,
    attachment_state: "bound",
    bound_at: nowISO(),
    updated_at: nowISO(),
  }, { operator_username: account.username }));

  addAudit(req, account, "commitDraftAttachments", targetCollection, targetId, null, { draft_id: draftId, count: updated.length, target_public_id: targetPublicId });
  res.json({ ok: true, attachments: updated });
}));

app.post("/api/attachments/delete", authMiddleware, asyncHandler(async (req, res) => {
  const account = req.account;
  const id = String(req.body.id || "").trim();
  if (!id) throw new Error("缺少附件编号。");

  const attachment = getRecord("lab_attachments", id);
  if (!attachment) throw new Error("未找到附件。");
  if (attachment.deleted_at) throw new Error("附件已删除。");
  const retiredPhotoIds = retiredLocationPhotoIds(["lab_purchase_requests", "lab_stock_transactions", "lab_material_batches"].flatMap(collection => listRecords(collection)));
  if (retiredPhotoIds.has(String(attachment._id))) throw new Error("该历史附件入口已停用。");

  if (account.account_type !== "admin" && attachment.uploaded_by_username !== account.username) {
    throw new Error("无权删除该附件。");
  }

  if (attachment.storage_path) {
    const fullPath = path.join(UPLOAD_DIR, attachment.storage_path);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch { /* 文件删除失败时仍保留软删除记录 */ }
    }
  }

  const record = updateRecord("lab_attachments", id, {
    deleted_at: nowISO(),
    deleted_by_name: account.display_name,
    deleted_by_username: account.username,
    updated_at: nowISO(),
  }, { operator_username: account.username });

  addAudit(req, account, "deleteAttachment", "lab_attachments", id, attachment, record);
  res.json({ ok: true, attachment: record });
}));

app.get("/api/attachments/download/:id", authMiddleware, asyncHandler(async (req, res) => {
  const attachment = getRecord("lab_attachments", req.params.id);
  if (!attachment) throw new Error("未找到附件。");

  ensureCanDownloadAttachment(req.account, attachment);

  const fullPath = path.resolve(UPLOAD_DIR, attachment.storage_path || "");
  const relativePath = path.relative(UPLOAD_DIR, fullPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return res.status(400).json({ ok: false, message: "附件存储路径无效。" });
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ ok: false, message: "附件文件不存在，可能已被移动或删除，请重新上传。" });
  }
  res.set("Cache-Control", "private, no-store");
  res.download(fullPath, safeFileName(attachment.original_name), (error) => {
    if (!error || res.headersSent || res.destroyed) return;
    res.status(error.code === "ENOENT" ? 404 : 500).json({ ok: false, message: "附件读取失败，请稍后重试。" });
  });
}));
};
