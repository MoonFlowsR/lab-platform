module.exports = function createService({ db, nowISO, dateStampCN, padSerial }) {
function nextPublicId(typeCode) {
  const tx = db.transaction(() => {
    const current = db.prepare("SELECT value FROM id_counters WHERE id = 1").get();
    const next = Number(current?.value || 0) + 1;
    db.prepare("UPDATE id_counters SET value = ?, updated_at = ? WHERE id = 1").run(next, nowISO());
    return next;
  });

  const globalSeq = tx();
  const date = dateStampCN();
  return {
    public_id: `${typeCode}-${date.slice(2)}-${padSerial(globalSeq)}`,
    global_seq: globalSeq,
    date_stamp: date,
    id_type: typeCode,
  };
}

function rowToRecord(row) {
  if (!row) return null;
  const data = JSON.parse(row.data_json);
  return {
    ...data,
    _id: String(row.id),
    id: row.id,
    public_id: row.public_id || data.public_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function insertRecord(collection, data, meta = {}) {
  const createdAt = data.created_at || nowISO();
  const updatedAt = data.updated_at || createdAt;
  const record = { ...data, created_at: createdAt, updated_at: updatedAt };

  const result = db.prepare(`
    INSERT INTO records
    (collection, public_id, applicant_username, operator_username, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    collection,
    record.public_id || null,
    meta.applicant_username || record.applicant_username || null,
    meta.operator_username || record.operator_username || null,
    createdAt,
    updatedAt,
    JSON.stringify(record)
  );

  return getRecord(collection, result.lastInsertRowid);
}

function getRecord(collection, id) {
  const row = db.prepare("SELECT * FROM records WHERE collection = ? AND id = ? AND deleted_at IS NULL").get(collection, Number(id));
  return rowToRecord(row);
}

function updateRecord(collection, id, patch) {
  const existing = getRecord(collection, id);
  if (!existing) throw new Error("未找到记录。");

  const currentTime = Date.parse(nowISO());
  const previousTime = Date.parse(existing.updated_at);
  const updatedAt = new Date(Number.isFinite(previousTime) ? Math.max(currentTime, previousTime + 1) : currentTime).toISOString();
  const updated = { ...existing, ...patch, _id: undefined, id: undefined, updated_at: updatedAt };

  db.prepare(`
    UPDATE records
    SET public_id = ?, applicant_username = ?, operator_username = ?, updated_at = ?, data_json = ?
    WHERE collection = ? AND id = ?
  `).run(
    updated.public_id || null,
    updated.applicant_username || null,
    updated.operator_username || null,
    updated.updated_at,
    JSON.stringify(updated),
    collection,
    Number(id)
  );

  return getRecord(collection, id);
}

function listRecords(collection, filterFn = null) {
  const rows = db.prepare("SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL ORDER BY datetime(created_at) DESC, id DESC").all(collection);
  const records = rows.map(rowToRecord);
  return filterFn ? records.filter(filterFn) : records;
}

function addAudit(req, account, action, targetType, targetId, beforeData, afterData) {
  db.prepare(`
    INSERT INTO audit_logs
    (operator_username, operator_role, action, target_type, target_id, before_json, after_json, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    account?.username || "",
    account?.account_type || "",
    action,
    targetType || "",
    String(targetId || ""),
    beforeData ? JSON.stringify(beforeData) : "",
    afterData ? JSON.stringify(afterData) : "",
    req.ip || "",
    req.headers["user-agent"] || "",
    nowISO()
  );
}
return { nextPublicId, rowToRecord, insertRecord, getRecord, updateRecord, listRecords, addAudit };
};
