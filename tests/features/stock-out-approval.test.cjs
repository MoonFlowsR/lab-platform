const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const initializeSchema = require('../../server/db/schema.cjs');
const createStockOutService = require('../../server/features/stock/stock-out-approval.cjs');

const privatePurpose = '私用/项目用（出库需采购人审批）';
const student = { username: 'student-one', display_name: '示例学生甲', account_type: 'student' };
const peer = { username: 'student-two', display_name: '示例学生乙', account_type: 'student' };
const admin = { username: 'admin-one', display_name: '示例管理员', account_type: 'admin' };

function fixture({ filename = ':memory:', onBatchRead } = {}) {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  db.prepare('INSERT INTO id_counters VALUES (1, 100, ?)').run('initial-time');
  db.exec('CREATE TABLE commit_parent (id INTEGER PRIMARY KEY); CREATE TABLE commit_guard (parent_id INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED);');
  for (const account of [student, peer, admin]) {
    db.prepare('INSERT INTO accounts (username, display_name, account_type, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(account.username, account.display_name, account.account_type, 'fixture-only-hash', 'initial-time', 'initial-time');
  }
  let clock = 0;
  const state = { failure: '', profileComplete: true, active: false, reads: [] };
  const nowISO = () => new Date(Date.UTC(2026, 9, 14, 0, 0, 0, ++clock)).toISOString();
  const getRecord = (collection, id) => {
    if (state.active) {
      state.reads.push({ collection, inTransaction: db.inTransaction });
      if (collection === 'lab_material_batches' && onBatchRead) onBatchRead(db);
    }
    const row = db.prepare('SELECT * FROM records WHERE collection = ? AND id = ? AND deleted_at IS NULL').get(collection, Number(id));
    return row ? { ...JSON.parse(row.data_json), _id: String(row.id), id: row.id, created_at: row.created_at, updated_at: row.updated_at } : null;
  };
  const listRecords = (collection, predicate) => {
    const rows = db.prepare('SELECT id FROM records WHERE collection = ? AND deleted_at IS NULL ORDER BY id').all(collection).map(row => getRecord(collection, row.id));
    return predicate ? rows.filter(predicate) : rows;
  };
  const insertRecord = (collection, data, meta = {}) => {
    const createdAt = data.created_at || nowISO(), updatedAt = data.updated_at || createdAt;
    const row = { ...data, created_at: createdAt, updated_at: updatedAt };
    const result = db.prepare('INSERT INTO records (collection, public_id, applicant_username, operator_username, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(collection, row.public_id || null, meta.applicant_username || row.applicant_username || null, meta.operator_username || row.operator_username || null, createdAt, updatedAt, JSON.stringify(row));
    if (state.failure === 'stock-insert' && collection === 'lab_stock_transactions') throw new Error('stock insert failed');
    return getRecord(collection, result.lastInsertRowid);
  };
  const updateRecord = (collection, id, patch) => {
    const before = getRecord(collection, id);
    if (!before) throw new Error('未找到记录。');
    const after = { ...before, ...patch, _id: undefined, id: undefined, updated_at: nowISO() };
    db.prepare('UPDATE records SET updated_at = ?, data_json = ? WHERE collection = ? AND id = ?').run(after.updated_at, JSON.stringify(after), collection, Number(id));
    if (state.failure === 'request-update' && collection === 'lab_stock_out_requests') throw new Error('request update failed');
    return getRecord(collection, id);
  };
  const nextPublicId = type => {
    const { value } = db.prepare('SELECT value FROM id_counters WHERE id = 1').get();
    db.prepare('UPDATE id_counters SET value = ?, updated_at = ? WHERE id = 1').run(value + 1, nowISO());
    return { public_id: `${type}-${value + 1}`, global_seq: value + 1 };
  };
  const addAudit = (req, account, action, targetType, targetId, before, after) => {
    db.prepare('INSERT INTO audit_logs (operator_username, operator_role, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(account.username, account.account_type, action, targetType, String(targetId), before ? JSON.stringify(before) : '', after ? JSON.stringify(after) : '', nowISO());
    if (state.failure === 'batch-audit' && targetType === 'lab_material_batches') throw new Error('batch audit failed');
    if (state.failure === 'stock-audit' && targetType === 'lab_stock_transactions') throw new Error('stock audit failed');
    if (state.failure === 'request-audit' && targetType === 'lab_stock_out_requests') throw new Error('request audit failed');
    if (state.failure === 'commit') db.prepare('INSERT INTO commit_guard VALUES (999)').run();
  };
  const batch = insertRecord('lab_material_batches', {
    material_id: 'material-one', material_name: '示例材料', spec: '示例规格', batch_code: 'BATCH-example', unit: 'g', current_qty: 10,
    purchase_purpose: privatePurpose, purchaser_username: student.username, created_by_username: peer.username,
    storage_room: 'A102', storage_detail: '示例柜', storage_location: 'A102 · 示例柜',
  });
  const photo = insertRecord('lab_attachments', { target_collection: 'draft_attachments', uploaded_by_username: student.username, original_name: 'example.png', attachment_state: 'draft' });
  const service = createStockOutService({
    db, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO,
    batchPurchasePurpose: values => values.purchase_purpose || '公用',
    selectedStockTeachers: () => {
      if (!state.profileComplete) throw new Error('请先完善个人信息。');
      return { responsible_teacher_username: 'teacher-one', responsible_teacher_name: '示例教师甲', guiding_teacher_username: 'teacher-two', guiding_teacher_name: '示例教师乙', graduation_year: '2028' };
    },
    storageDetails: values => {
      if (!values.storage_room || !String(values.storage_detail || '').trim()) throw new Error('请选择存放房间并填写具体位置简述。');
      return { storage_room: values.storage_room, storage_detail: values.storage_detail, storage_location: `${values.storage_room} · ${values.storage_detail}` };
    },
    requireItemPhoto: (account, payload) => {
      const row = getRecord('lab_attachments', payload.photo_attachment_id);
      if (!row || row.deleted_at || row.target_collection !== 'draft_attachments' || row.uploaded_by_username !== account.username || !/\.(png|jpe?g)$/i.test(row.original_name)) throw new Error('物品特写照片无效，请重新上传。');
      return row;
    },
    bindStockEvidence: (evidence, record) => {
      updateRecord('lab_attachments', evidence._id, { target_collection: 'lab_stock_transactions', target_id: record._id, target_public_id: record.public_id, attachment_state: 'bound' });
      if (state.failure === 'evidence-bind') throw new Error('evidence bind failed');
    },
  });
  const snapshot = () => ({
    records: db.prepare('SELECT * FROM records ORDER BY id').all(),
    audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
    counters: db.prepare('SELECT * FROM id_counters').all(),
    commitGuard: db.prepare('SELECT * FROM commit_guard').all(),
  });
  const payload = patch => ({ entry_key: 'entry-one', batch_id: batch._id, transaction_type: '出库', quantity: 3, unit: 'g', photo_attachment_id: photo._id, storage_room: 'A102', storage_detail: '示例柜', usage_reason: '实验使用', ...patch });
  const run = (method, account, ...args) => {
    state.active = true;
    try {
      const result = service[method]({}, account, ...args);
      assert.equal(db.inTransaction, false, 'success must follow SQLite commit');
      return result;
    } finally { state.active = false; }
  };
  const submit = (patch, account = student) => run('submission', account, payload(patch));
  const act = (action, request, account = student, patch = {}) => run('act', account, action, { id: request._id, ...patch });
  // Seed the former application's saved self-request format, not today's submission path.
  const legacySelfRequest = (status = '待采购人审批') => {
    const currentBatch = getRecord('lab_material_batches', batch._id);
    const signature = createHash('sha256').update(JSON.stringify([currentBatch.material_id, currentBatch.material_name, currentBatch.spec, currentBatch.unit, currentBatch.purchase_purpose, student.username])).digest('hex');
    const request = insertRecord('lab_stock_out_requests', {
      ...payload(), public_id: 'OUT-legacy', batch_code: currentBatch.batch_code, material_id: currentBatch.material_id, material_name: currentBatch.material_name,
      purchase_purpose: privatePurpose, applicant_username: student.username, applicant_name: student.display_name, operator_username: student.username,
      purchaser_username: student.username, purchaser_name: student.display_name, batch_signature: signature, status,
      ...(status === '已同意待出库' ? { approved_username: student.username, approved_by: student.display_name, approved_at: 'original-approval-time', review_note: '原审批意见' } : {}),
    });
    updateRecord('lab_attachments', photo._id, { target_collection: 'lab_stock_out_requests', target_id: request._id, target_public_id: request.public_id, attachment_state: 'bound' });
    if (status === '已同意待出库') insertRecord('lab_review_logs', { target_collection: 'lab_stock_out_requests', target_id: request._id, reviewer_username: student.username, action: '同意', created_at: 'original-approval-time' });
    return request;
  };
  return { db, state, batch, photo, getRecord, listRecords, insertRecord, updateRecord, snapshot, payload, submit, act, legacySelfRequest };
}

test('the server-confirmed purchaser saves private outbound directly, binds evidence and records the exemption without inventing approval', () => {
  const f = fixture();
  try {
    const result = f.submit({ purchaser_username: peer.username, purchaser_name: '伪造采购人', purchaser_approved_by: '伪造审批人' });
    assert.equal(result.approval_required, undefined);
    assert.equal(result.record.stock_before, 10);
    assert.equal(result.record.stock_after, 7);
    assert.equal(f.getRecord('lab_material_batches', f.batch._id).current_qty, 7);
    assert.equal(result.record.purchaser_username, student.username);
    assert.equal(result.record.purchaser_name, student.display_name);
    assert.equal(result.record.purchaser_approval_exempt, true);
    assert.equal(result.record.purchaser_approval_exempt_reason, 'purchaser_self');
    assert.equal(result.record.purchaser_approved_by, undefined);
    assert.equal(f.getRecord('lab_attachments', f.photo._id).target_id, result.record._id);
    assert.equal(f.listRecords('lab_stock_out_requests').length, 0);
    assert.equal(f.listRecords('lab_review_logs').length, 0);
    assert.equal(f.snapshot().audits.length, 2);
    assert.ok(f.state.reads.length > 0 && f.state.reads.every(row => row.inTransaction));
  } finally { f.db.close(); }
});

test('another purchaser still requires a real review before the applicant can deduct stock; spoofed names and flags cannot bypass it', () => {
  const f = fixture();
  try {
    f.updateRecord('lab_material_batches', f.batch._id, { purchaser_username: peer.username });
    const result = f.submit({ purchaser_username: student.username, purchaser_approval_exempt: true, purchaser_approval_exempt_reason: 'purchaser_self' }, { ...student, display_name: peer.display_name });
    assert.equal(result.approval_required, true);
    assert.equal(result.request.purchaser_username, peer.username);
    assert.equal(result.request.purchaser_approval_exempt, undefined);
    assert.equal(f.getRecord('lab_material_batches', f.batch._id).current_qty, 10);
    assert.equal(f.listRecords('lab_stock_transactions').length, 0);
    const before = f.snapshot();
    assert.throws(() => f.act('completeStockOutRequest', result.request), /须先取得采购人同意/);
    assert.throws(() => f.act('reviewStockOutRequest', result.request, student, { decision: '同意' }), /只有该批次采购人/);
    assert.deepEqual(f.snapshot(), before);
    f.act('reviewStockOutRequest', result.request, peer, { decision: '同意', review_note: '' });
    const completed = f.act('completeStockOutRequest', result.request);
    assert.equal(completed.record.stock_after, 7);
    assert.equal(completed.record.purchaser_approved_username, peer.username);
    assert.equal(completed.record.purchaser_approval_exempt, undefined);
    assert.equal(f.listRecords('lab_review_logs').length, 1);
  } finally { f.db.close(); }
});

test('public outbound and returns keep their existing direct flow without false private-purchase exemptions', () => {
  for (const mode of ['public-outbound', 'return']) {
    const f = fixture();
    try {
      if (mode === 'public-outbound') f.updateRecord('lab_material_batches', f.batch._id, { purchase_purpose: '公用' });
      const result = f.submit(mode === 'return' ? { transaction_type: '退库' } : {});
      assert.equal(result.record.stock_after, mode === 'return' ? 13 : 7);
      assert.equal(result.record.purchaser_approval_exempt, undefined);
      assert.equal(f.listRecords('lab_stock_out_requests').length, 0);
    } finally { f.db.close(); }
  }
});

test('direct purchaser submission still enforces profile, quantity, matching unit, location and the original uploader image evidence', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const patch of [{ quantity: 0 }, { quantity: '' }, { quantity: 11 }, { unit: 'kg' }, { storage_detail: '' }, { photo_attachment_id: '999' }]) {
      assert.throws(() => f.submit(patch), /大于0|库存不足|单位|位置|照片/);
      assert.deepEqual(f.snapshot(), before);
    }
    f.state.profileComplete = false;
    assert.throws(() => f.submit(), /完善个人信息/);
    assert.deepEqual(f.snapshot(), before);
    f.state.profileComplete = true;
    for (const patch of [{ uploaded_by_username: peer.username }, { original_name: 'example.pdf' }, { target_collection: 'lab_stock_transactions' }]) {
      const photoBefore = f.getRecord('lab_attachments', f.photo._id);
      f.updateRecord('lab_attachments', f.photo._id, patch);
      const invalid = f.snapshot();
      assert.throws(() => f.submit(), /照片/);
      assert.deepEqual(f.snapshot(), invalid);
      f.updateRecord('lab_attachments', f.photo._id, photoBefore);
    }
  } finally { f.db.close(); }
});

test('purchaser resolution follows server batch/purchase records, never the submitted purchaser, and refuses inactive or missing owners', () => {
  const f = fixture();
  try {
    const purchase = f.insertRecord('lab_purchase_requests', { public_id: 'PUR-example', applicant_username: peer.username });
    f.updateRecord('lab_material_batches', f.batch._id, { purchaser_username: '', related_purchase_record_id: purchase._id });
    assert.equal(f.submit({ purchaser_username: student.username }).request.purchaser_username, peer.username);
    for (const owner of [student.username, 'missing-purchaser']) {
      const g = fixture();
      try {
        g.updateRecord('lab_material_batches', g.batch._id, { purchaser_username: owner });
        if (owner === student.username) g.db.prepare('UPDATE accounts SET status = ? WHERE username = ?').run('disabled', owner);
        const before = g.snapshot();
        assert.throws(() => g.submit(), /出库审批人账号未启用/);
        assert.deepEqual(g.snapshot(), before);
      } finally { g.db.close(); }
    }
  } finally { f.db.close(); }
});

test('successful direct purchaser submission retries are idempotent even after its evidence has been bound', () => {
  const f = fixture();
  try {
    const first = f.submit();
    const committed = f.snapshot();
    const second = f.submit({ quantity: 9, purchaser_approval_exempt: false });
    assert.equal(second.record._id, first.record._id);
    assert.equal(second.record.quantity, 3);
    assert.deepEqual(f.snapshot(), committed);
  } finally { f.db.close(); }
});

test('legacy purchaser-self pending and approved requests complete directly, preserve real review history and never deduct twice', () => {
  for (const status of ['待采购人审批', '已同意待出库']) {
    const f = fixture();
    try {
      const request = f.legacySelfRequest(status);
      const reviews = f.listRecords('lab_review_logs');
      assert.equal(f.getRecord('lab_material_batches', f.batch._id).current_qty, 10);
      const result = f.act('completeStockOutRequest', request);
      assert.equal(result.request.status, '已出库');
      assert.equal(result.request.purchaser_approval_exempt_reason, 'purchaser_self');
      assert.equal(result.record.purchaser_approval_exempt, true);
      assert.equal(result.record.stock_after, 7);
      assert.equal(result.record.purchaser_approved_at, status === '已同意待出库' ? 'original-approval-time' : undefined);
      assert.deepEqual(f.listRecords('lab_review_logs'), reviews);
      assert.equal(f.getRecord('lab_attachments', f.photo._id).target_id, result.record._id);
      const committed = f.snapshot();
      assert.equal(f.act('completeStockOutRequest', request).already_completed, true);
      assert.deepEqual(f.snapshot(), committed);
    } finally { f.db.close(); }
  }
});

test('only the original student applicant can complete a legacy self-request; administrator or peer ownership does not grant it', () => {
  const f = fixture();
  try {
    const request = f.legacySelfRequest();
    const before = f.snapshot();
    for (const actor of [peer, admin, { ...student, account_type: 'teacher' }]) assert.throws(() => f.act('completeStockOutRequest', request, actor), /只有原出库申请人/);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.db.close(); }
});

test('rejected, withdrawn or unknown request states cannot become exempt outbound completions', () => {
  for (const status of ['已驳回', '已撤回', '未知状态']) {
    const f = fixture();
    try {
      const request = f.legacySelfRequest(status);
      const before = f.snapshot();
      assert.throws(() => f.act('completeStockOutRequest', request), /须先取得采购人同意/);
      assert.deepEqual(f.snapshot(), before);
    } finally { f.db.close(); }
  }
});

test('legacy self-completion rejects changed batch identity, specification, unit, purpose or purchaser without writing stock', () => {
  for (const patch of [{ material_id: 'different-material' }, { material_name: '更名材料' }, { spec: '不同规格' }, { unit: 'kg' }, { purchase_purpose: '公用' }, { purchaser_username: peer.username }]) {
    const f = fixture();
    try {
      const request = f.legacySelfRequest();
      f.updateRecord('lab_material_batches', f.batch._id, patch);
      const before = f.snapshot();
      assert.throws(() => f.act('completeStockOutRequest', request), /已变化/);
      assert.deepEqual(f.snapshot(), before);
    } finally { f.db.close(); }
  }
});

test('legacy completion keeps evidence ownership and request binding requirements, and rechecks the available quantity', () => {
  for (const patch of [{ uploaded_by_username: peer.username }, { target_collection: 'draft_attachments' }, { target_id: 'another-request' }, { deleted_at: 'deleted-time' }]) {
    const f = fixture();
    try {
      const request = f.legacySelfRequest();
      f.updateRecord('lab_attachments', f.photo._id, patch);
      const before = f.snapshot();
      assert.throws(() => f.act('completeStockOutRequest', request), /照片关联异常/);
      assert.deepEqual(f.snapshot(), before);
    } finally { f.db.close(); }
  }
  const f = fixture();
  try {
    const request = f.legacySelfRequest();
    f.updateRecord('lab_material_batches', f.batch._id, { current_qty: 2 });
    const before = f.snapshot();
    assert.throws(() => f.act('completeStockOutRequest', request), /库存不足/);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.db.close(); }
});

test('direct and legacy self-outbound failures roll stock, evidence, requests, movements, audits and IDs back as one transaction', () => {
  for (const mode of ['direct', 'legacy']) {
    for (const failure of ['stock-insert', 'evidence-bind', 'batch-audit', 'stock-audit', 'commit', ...(mode === 'legacy' ? ['request-update', 'request-audit'] : [])]) {
      const f = fixture();
      try {
        const request = mode === 'legacy' ? f.legacySelfRequest() : null;
        f.state.failure = failure;
        const before = f.snapshot();
        assert.throws(() => request ? f.act('completeStockOutRequest', request) : f.submit(), /failed|FOREIGN KEY constraint failed/);
        assert.deepEqual(f.snapshot(), before, `${mode}/${failure}`);
        assert.equal(f.db.inTransaction, false);
        f.state.failure = '';
        const result = request ? f.act('completeStockOutRequest', request) : f.submit();
        assert.equal(result.record.stock_after, 7, 'a retry after a rolled-back failure can commit exactly once');
        assert.equal(f.listRecords('lab_stock_transactions').length, 1);
      } finally { f.db.close(); }
    }
  }
});

test('other-purchaser request failures restore the photo draft binding and do not create an unreviewable request', () => {
  const f = fixture();
  try {
    f.updateRecord('lab_material_batches', f.batch._id, { purchaser_username: peer.username });
    f.state.failure = 'request-audit';
    const before = f.snapshot();
    assert.throws(() => f.submit(), /request audit failed/);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.db.close(); }
});

test('the outbound transaction takes the SQLite writer lock before reading the live batch', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-out-approval-'));
  const filename = path.join(directory, 'test.sqlite');
  let contender, observedLock = false;
  const f = fixture({ filename, onBatchRead: db => {
    assert.equal(db.inTransaction, true);
    assert.throws(() => contender.prepare('UPDATE id_counters SET value = value + 1 WHERE id = 1').run(), error => error.code === 'SQLITE_BUSY');
    observedLock = true;
  } });
  try {
    contender = new Database(filename, { timeout: 0 });
    f.submit();
    assert.equal(observedLock, true);
  } finally {
    if (contender) contender.close();
    f.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
