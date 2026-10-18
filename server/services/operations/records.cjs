module.exports = function createRecordsOperations(context) {
const { addAudit, db, nowISO, syncResponse, validatePersonalHiddenCollection } = context;
return {
listAll(req, res, action, payload, account) {
if (action === "listAll") return syncResponse(req, res, account, payload);
},
hideRecordForMe(req, res, action, payload, account) {
if (action === "hideRecordForMe") {
    const collection = validatePersonalHiddenCollection(String(payload.collection || "").trim());
    const targetId = String(payload.id || "").trim();
    const targetPublicId = String(payload.public_id || "").trim();

    if (!targetId && !targetPublicId) throw new Error("缺少记录编号。");

    const targetKey = targetId || targetPublicId;
    const createdAt = nowISO();

    db.prepare(`
      INSERT OR IGNORE INTO lab_user_hidden_records
      (username, target_collection, target_id, target_public_id, target_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(account.username, collection, targetId, targetPublicId, targetKey, createdAt);

    addAudit(req, account, action, "lab_user_hidden_records", `${collection}:${targetKey}`, null, {
      username: account.username,
      target_collection: collection,
      target_id: targetId,
      target_public_id: targetPublicId,
      target_key: targetKey,
      created_at: createdAt,
    });

    return res.json({ ok: true });
  }
},
};
};
