const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const initializeSchema = require('../../server/db/schema.cjs');
const createInventoryOperations = require('../../server/services/operations/inventory.cjs');

function fixture({ filename = ':memory:', onBatchRead } = {}) {
  const db = new Database(filename);
  initializeSchema(db);
  db.prepare('INSERT INTO id_counters VALUES (1, 100, ?)').run('original-time');
  db.exec('CREATE TABLE commit_parent (id INTEGER PRIMARY KEY); CREATE TABLE commit_guard (parent_id INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED);');
  const state = { failure: '', active: false, responses: [], reads: [] };
  let clock = 0;
  const nowISO = () => new Date(Date.UTC(2026, 9, 13, 0, 0, 0, ++clock)).toISOString();
  const getRecord = (collection, id) => {
    if (state.active) {
      state.reads.push({ collection, inTransaction: db.inTransaction });
      if (collection === 'lab_material_batches' && onBatchRead) onBatchRead(db);
    }
    const row = db.prepare('SELECT * FROM records WHERE collection = ? AND id = ? AND deleted_at IS NULL').get(collection, Number(id));
    return row ? { ...JSON.parse(row.data_json), _id: String(row.id), id: row.id, updated_at: row.updated_at, created_at: row.created_at } : null;
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
    const existing = getRecord(collection, id);
    if (!existing) throw new Error('未找到记录。');
    const updated = { ...existing, ...patch, _id: undefined, id: undefined, updated_at: nowISO() };
    db.prepare('UPDATE records SET updated_at = ?, data_json = ? WHERE collection = ? AND id = ?').run(updated.updated_at, JSON.stringify(updated), collection, Number(id));
    return getRecord(collection, id);
  };
  const nextPublicId = type => {
    const seq = db.transaction(() => {
      const { value } = db.prepare('SELECT value FROM id_counters WHERE id = 1').get();
      db.prepare('UPDATE id_counters SET value = ?, updated_at = ? WHERE id = 1').run(value + 1, nowISO());
      return value + 1;
    })();
    return { public_id: `${type}-${seq}`, global_seq: seq };
  };
  const addAudit = (req, account, action, targetType, targetId, before, after) => {
    db.prepare('INSERT INTO audit_logs (operator_username, operator_role, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(account.username, account.account_type, action, targetType, String(targetId), before ? JSON.stringify(before) : '', after ? JSON.stringify(after) : '', nowISO());
    if (state.failure === 'batch-audit' && targetType === 'lab_material_batches') throw new Error('batch audit failed');
    if (state.failure === 'stock-audit' && targetType === 'lab_stock_transactions') throw new Error('stock audit failed');
    if (state.failure === 'commit') db.prepare('INSERT INTO commit_guard VALUES (999)').run();
  };
  const material = insertRecord('lab_materials', { name_cn: '示例材料', direction: '示例方向' });
  const batch = insertRecord('lab_material_batches', { material_id: material._id, material_name: material.name_cn, batch_code: 'BATCH-original', unit: 'g', current_qty: 10, min_qty: 1, storage_room: 'A102', storage_detail: '示例柜', storage_location: 'A102 · 示例柜' });
  const evidence = insertRecord('lab_attachments', { target_collection: 'draft_attachments', uploaded_by_username: 'teacher', attachment_state: 'draft' });
  const operations = createInventoryOperations({
    db, getRecord, insertRecord, updateRecord, nextPublicId, addAudit, nowISO,
    num: value => Number.isFinite(Number(value || 0)) ? Number(value || 0) : 0,
    requireTeacherOrAdmin: account => { if (!['teacher', 'admin'].includes(account.account_type)) throw new Error('只有教师或管理员账号可以执行此操作。'); },
    storageDetails: values => ({ storage_room: values.storage_room, storage_detail: values.storage_detail, storage_location: `${values.storage_room} · ${values.storage_detail}` }),
    batchPurchasePurpose: values => values.purchase_purpose || '公用',
    requireStockEvidence: (account, id) => {
      const photo = getRecord('lab_attachments', id);
      if (!photo || photo.uploaded_by_username !== account.username || photo.attachment_state !== 'draft') throw new Error('入库凭证无效。');
      return photo;
    },
    bindStockEvidence: (photo, transaction) => {
      updateRecord('lab_attachments', photo._id, { target_collection: 'lab_stock_transactions', target_id: transaction._id, attachment_state: 'bound' });
      if (state.failure === 'evidence-bind') throw new Error('evidence bind failed');
    },
  });
  const snapshot = () => ({
    records: db.prepare('SELECT * FROM records ORDER BY id').all(),
    audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
    counters: db.prepare('SELECT * FROM id_counters').all(),
    commitGuard: db.prepare('SELECT * FROM commit_guard').all(),
  });
  const run = (action, payload, account = { username: 'teacher', display_name: '示例教师', account_type: 'teacher' }) => {
    state.active = true;
    try {
      return operations[action === 'updateMaterialBatch' ? 'updateMaterialBatch' : 'addMaterialBatch']({}, { json: result => {
        assert.equal(db.inTransaction, false, 'success must be sent after SQLite commits');
        state.responses.push(result);
        return result;
      } }, action, payload, account);
    } finally { state.active = false; }
  };
  const adjustment = patch => ({ id: batch._id, expected_updated_at: batch.updated_at, current_qty: 7, min_qty: 2, storage_location: batch.storage_location, reason: '核对盘点结果', ...patch });
  const inbound = patch => ({ material_id: material._id, initial_qty: 3, unit_price: 2, unit: 'g', photo_attachment_id: evidence._id, ...patch });
  return { db, state, getRecord, batch, evidence, run, snapshot, adjustment, inbound };
}

test('inventory adjustment saves one movement and both audits before responding, and reads inventory inside its transaction', () => {
  const f = fixture();
  try {
    const result = f.run('updateMaterialBatch', f.adjustment());
    assert.equal(result.record.current_qty, 7);
    assert.equal(result.record.min_qty, 2);
    assert.equal(result.record.storage_room, 'A102');
    assert.equal(result.transaction.stock_before, 10);
    assert.equal(result.transaction.stock_after, 7);
    assert.equal(result.transaction.quantity, 3);
    assert.equal(f.snapshot().audits.length, 2);
    const audits = f.snapshot().audits;
    assert.equal(JSON.parse(audits[0].before_json).current_qty, 10);
    assert.equal(JSON.parse(audits[0].after_json).current_qty, 7);
    assert.equal(f.state.responses.length, 1);
    assert.ok(f.state.reads.length > 0 && f.state.reads.every(row => row.inTransaction));
  } finally { f.db.close(); }
});

test('missing or stale page versions reject without changing inventory, movements, audits or IDs', () => {
  const f = fixture();
  try {
    for (const expected_updated_at of [undefined, '', 'older-version']) {
      const before = f.snapshot();
      assert.throws(() => f.run('updateMaterialBatch', f.adjustment({ expected_updated_at })), /本次修改未保存.*刷新库存/);
      assert.deepEqual(f.snapshot(), before);
    }
    const first = f.run('updateMaterialBatch', f.adjustment());
    assert.notEqual(first.record.updated_at, f.batch.updated_at);
    const committed = f.snapshot();
    assert.throws(() => f.run('updateMaterialBatch', f.adjustment({ current_qty: 20 })), /本次修改未保存/);
    assert.deepEqual(f.snapshot(), committed);
    assert.equal(f.state.responses.length, 1);
  } finally { f.db.close(); }
});

test('movement or either audit failure rolls the adjustment, inserted movement, audits and ID counter back together', () => {
  for (const failure of ['stock-insert', 'batch-audit', 'stock-audit']) {
    const f = fixture();
    try {
      f.state.failure = failure;
      const before = f.snapshot();
      assert.throws(() => f.run('updateMaterialBatch', f.adjustment()), /failed/);
      assert.deepEqual(f.snapshot(), before, failure);
      assert.equal(f.state.responses.length, 0, failure);
    } finally { f.db.close(); }
  }
});

test('a deferred constraint failure at COMMIT rolls inventory back and sends no success response', () => {
  for (const action of ['updateMaterialBatch', 'addMaterialBatch']) {
    const f = fixture();
    try {
      f.state.failure = 'commit';
      const before = f.snapshot();
      assert.throws(() => f.run(action, action === 'updateMaterialBatch' ? f.adjustment() : f.inbound()), /FOREIGN KEY constraint failed/);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.state.responses.length, 0);
      assert.equal(f.db.inTransaction, false);
    } finally { f.db.close(); }
  }
});

test('BEGIN IMMEDIATE acquires a writer lock before inventory is read', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-consistency-'));
  const filename = path.join(directory, 'test.sqlite');
  let contender, observedLock = false;
  const f = fixture({ filename, onBatchRead: db => {
    assert.equal(db.inTransaction, true);
    assert.throws(() => contender.prepare('UPDATE id_counters SET value = value + 1 WHERE id = 1').run(), error => error.code === 'SQLITE_BUSY');
    observedLock = true;
  } });
  try {
    contender = new Database(filename, { timeout: 0 });
    f.run('updateMaterialBatch', f.adjustment());
    assert.equal(observedLock, true);
  } finally {
    if (contender) contender.close();
    f.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('adjustment rejects blank, nonfinite or malformed numbers without silently replacing stock with zero', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const field of ['current_qty', 'min_qty']) {
      for (const value of ['', '  ', undefined, null, false, [], {}, 'not-a-number', NaN, Infinity, -Infinity, -1]) {
        assert.throws(() => f.run('updateMaterialBatch', f.adjustment({ [field]: value })), /有效数字|不能小于/);
        assert.deepEqual(f.snapshot(), before);
      }
    }
    assert.equal(f.state.responses.length, 0);
    const zero = f.run('updateMaterialBatch', f.adjustment({ current_qty: 0, min_qty: '0' }));
    assert.equal(zero.record.current_qty, 0);
    assert.equal(zero.record.min_qty, 0);
  } finally { f.db.close(); }
});

test('adjustment retains teacher/admin authorization and rejects missing batches or reasons', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    assert.throws(() => f.run('updateMaterialBatch', f.adjustment(), { username: 'student', account_type: 'student' }), /教师或管理员/);
    assert.throws(() => f.run('updateMaterialBatch', f.adjustment({ id: '999' })), /未找到材料批次/);
    assert.throws(() => f.run('updateMaterialBatch', f.adjustment({ reason: '  ' })), /必须填写原因/);
    assert.deepEqual(f.snapshot(), before);
  } finally { f.db.close(); }
});

test('batch inbound binds evidence and commits batch, movement and audits before responding', () => {
  const f = fixture();
  try {
    const result = f.run('addMaterialBatch', f.inbound({ initial_qty: '3', unit_price: '2' }));
    assert.equal(result.batch.current_qty, 3);
    assert.equal(result.batch.unit_price, 2);
    assert.equal(result.batch.total_price, 6);
    assert.equal(result.transaction.stock_before, 0);
    assert.equal(result.transaction.stock_after, 3);
    assert.equal(f.getRecord('lab_attachments', f.evidence._id).target_id, result.transaction._id);
    assert.equal(f.snapshot().audits.length, 2);
    assert.ok(f.state.reads.every(row => row.inTransaction));
  } finally { f.db.close(); }
});

test('batch inbound failures roll back batch, movement, evidence binding, audits and both allocated IDs', () => {
  for (const failure of ['stock-insert', 'batch-audit', 'stock-audit', 'evidence-bind']) {
    const f = fixture();
    try {
      f.state.failure = failure;
      const before = f.snapshot();
      assert.throws(() => f.run('addMaterialBatch', f.inbound()), /failed/);
      assert.deepEqual(f.snapshot(), before, failure);
      assert.equal(f.state.responses.length, 0);
    } finally { f.db.close(); }
  }
});

test('batch inbound rejects invalid quantities, prices and overflowing totals without writing anything', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    for (const field of ['initial_qty', 'unit_price']) {
      const invalidValues = [[], {}, false, NaN, Infinity, -Infinity, 'invalid', -1];
      if (field === 'initial_qty') invalidValues.push('', ' ', null, undefined);
      for (const value of invalidValues) {
        assert.throws(() => f.run('addMaterialBatch', f.inbound({ [field]: value })), /有效数字|不能小于|必须大于/);
        assert.deepEqual(f.snapshot(), before);
      }
    }
    assert.throws(() => f.run('addMaterialBatch', f.inbound({ initial_qty: 0 })), /必须大于/);
    assert.throws(() => f.run('addMaterialBatch', f.inbound({ initial_qty: Number.MAX_VALUE, unit_price: 2 })), /总价超出/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.run('addMaterialBatch', f.inbound({ unit_price: 0 })).batch.total_price, 0);
  } finally { f.db.close(); }
});

test('batch inbound preserves optional unit prices: omitted, empty, whitespace or null means zero', () => {
  for (const unitPrice of [undefined, null, '', '  ', 0, '0']) {
    const f = fixture();
    try {
      const payload = f.inbound({ unit_price: unitPrice });
      if (unitPrice === undefined) delete payload.unit_price;
      const result = f.run('addMaterialBatch', payload);
      assert.equal(result.batch.unit_price, 0);
      assert.equal(result.batch.total_price, 0);
      assert.equal(result.batch.current_qty, 3);
      assert.equal(result.transaction.stock_after, 3);
      assert.equal(f.snapshot().audits.length, 2);
      assert.equal(f.state.responses.length, 1);
    } finally { f.db.close(); }
  }
});
