const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const createPurchaseOperations = require('../../server/services/operations/purchase.cjs');

function fixture(failAt) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE records(id INTEGER PRIMARY KEY, collection TEXT, data_json TEXT);
    CREATE TABLE accounts(username TEXT, display_name TEXT);
    CREATE TABLE counters(value INTEGER); INSERT INTO counters VALUES(0);
    CREATE TABLE audits(action TEXT, target TEXT);
    INSERT INTO accounts VALUES('示例学生','示例学生');`);
  const account = { username: '示例学生', display_name: '示例学生', account_type: 'student' };
  const getRecord = (collection, id) => {
    const row = db.prepare('SELECT * FROM records WHERE collection=? AND id=?').get(collection, Number(id));
    return row ? { ...JSON.parse(row.data_json), _id: String(row.id) } : null;
  };
  const insertRecord = (collection, data) => {
    if (failAt === `insert:${collection}`) throw Error('injected write failure');
    const row = db.prepare('INSERT INTO records(collection,data_json) VALUES(?,?)').run(collection, JSON.stringify(data));
    return getRecord(collection, row.lastInsertRowid);
  };
  const updateRecord = (collection, id, patch) => {
    if (failAt === `update:${collection}`) throw Error('injected write failure');
    const data = { ...getRecord(collection, id), ...patch };
    db.prepare('UPDATE records SET data_json=? WHERE collection=? AND id=?').run(JSON.stringify(data), collection, Number(id));
    return getRecord(collection, id);
  };
  const purchase = insertRecord('lab_purchase_requests', { public_id: 'PUR-example', status: '待入库',
    applicant_username: account.username, applicant_name: account.display_name, material_name: '示例材料',
    specification: '规格A', unit: '瓶', quantity: 2, estimated_price: 100, purchase_category: '试剂原料',
    purchase_purpose: '公用', safety_notes: '示例', preferred_supplier: '示例供应商' });
  const photo = insertRecord('lab_attachments', { target_collection: 'lab_purchase_requests', target_id: purchase._id,
    original_name: 'photo.png', uploaded_by_username: account.username, attachment_state: 'draft' });
  const context = { db, getRecord, insertRecord, updateRecord, nowISO: () => '2026-10-13T00:00:00.000Z',
    listRecords: (collection, filter) => db.prepare('SELECT id FROM records WHERE collection=?').all(collection)
      .map(row => getRecord(collection, row.id)).filter(filter || (() => true)),
    nextPublicId: prefix => {
      db.prepare('UPDATE counters SET value=value+1').run();
      return { public_id: `${prefix}-${db.prepare('SELECT value FROM counters').get().value}` };
    },
    addAudit: (_req, _account, action, target, id) => {
      if (failAt === `audit:${target}`) throw Error('injected audit failure');
      db.prepare('INSERT INTO audits VALUES(?,?)').run(action, `${target}:${id}`);
    },
    num: value => Number(value || 0), normalizeItemName: value => String(value || '').trim(),
    selectedStockTeachers: () => ({}), isImageAttachmentRecord: row => row.original_name.endsWith('.png'),
    requiredPurchaseExpiryDate: value => value,
    storageDetails: value => ({ storage_location: `${value.storage_room} ${value.storage_detail}`, storage_room: value.storage_room, storage_detail: value.storage_detail }),
  };
  const payload = { id: purchase._id, photo_attachment_id: photo._id, actual_qty: 2,
    storage_room: 'A101', storage_detail: 'A柜', expiry_date: '长期' };
  let response;
  const res = { json: value => { assert.equal(db.inTransaction, false, 'success must follow COMMIT'); response = value; return value; } };
  const execute = (who = account, change = {}) => createPurchaseOperations(context).completePurchaseInbound({}, res, 'completePurchaseInbound', { ...payload, ...change }, who);
  const snapshot = () => JSON.stringify({ records: db.prepare('SELECT * FROM records ORDER BY id').all(),
    counters: db.prepare('SELECT * FROM counters').all(), audits: db.prepare('SELECT * FROM audits').all() });
  return { db, execute, snapshot, getRecord, purchase, photo, account, context, get response() { return response; } };
}

test('purchase inbound commits material, batch, stock entry, purchase, photo binding and audits together', () => {
  const f = fixture();
  try {
    const result = f.execute();
    assert.equal(result.ok, true);
    assert.equal(result.record.status, '已完成');
    assert.equal(result.batch.current_qty, 2);
    assert.equal(result.transaction.batch_id, result.batch._id);
    assert.equal(result.record.inbound_transaction_id, result.transaction._id);
    assert.equal(result.record.inbound_photo_attachment_id, f.photo._id);
    assert.equal(f.getRecord('lab_attachments', f.photo._id).attachment_state, 'bound');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM audits').get().n, 4);
    const saved = f.snapshot();
    assert.throws(() => f.execute(), /待入库/);
    assert.equal(f.snapshot(), saved, 'duplicate completion cannot add inventory twice');
  } finally { f.db.close(); }
});

test('receiving in a different unit preserves the purchase total and recalculates unit price', () => {
  const f = fixture();
  try {
    const result = f.execute(f.account, { actual_qty: 100, unit: 'mL' });
    assert.equal(result.batch.total_price, 100);
    assert.equal(result.batch.unit_price, 1);
    assert.equal(result.batch.current_qty, 100);
    assert.equal(result.batch.unit, 'mL');
    assert.equal(result.record.status, '已完成');
  } finally { f.db.close(); }
});

for (const boundary of ['insert:lab_material_batches', 'insert:lab_stock_transactions',
  'update:lab_purchase_requests', 'update:lab_attachments', 'audit:lab_purchase_requests']) {
  test(`purchase inbound rolls back every earlier write on ${boundary} failure`, () => {
    const f = fixture(boundary);
    try {
      const before = f.snapshot();
      assert.throws(() => f.execute(), /injected/);
      assert.equal(f.snapshot(), before);
      assert.equal(f.response, undefined);
      assert.equal(f.db.inTransaction, false);
    } finally { f.db.close(); }
  });
}

test('purchase inbound keeps existing ownership, status and photo checks inside the transaction', () => {
  const f = fixture();
  try {
    const before = f.snapshot();
    assert.throws(() => f.execute({ ...f.account, username: '另一学生' }), /原采购申请人/);
    assert.throws(() => f.execute(f.account, { photo_attachment_id: '999' }), /实物照片/);
    assert.throws(() => f.execute(f.account, { actual_qty: 0 }), /大于 0/);
    assert.equal(f.snapshot(), before);
    assert.equal(f.response, undefined);
  } finally { f.db.close(); }
});

test('a purchase COMMIT failure returns no success and rolls back stock, bindings, counters and audits', () => {
  const f = fixture();
  try {
    f.db.pragma('foreign_keys=ON');
    f.db.exec(`CREATE TABLE parent(id INTEGER PRIMARY KEY);
      CREATE TABLE commit_guard(id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER force_commit_failure AFTER INSERT ON audits
      WHEN NEW.target LIKE 'lab_purchase_requests:%'
      BEGIN INSERT INTO commit_guard VALUES(999); END;`);
    const before = f.snapshot();
    assert.throws(() => f.execute(), /FOREIGN KEY/);
    assert.equal(f.snapshot(), before);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM commit_guard').get().n, 0);
    assert.equal(f.response, undefined);
  } finally { f.db.close(); }
});
