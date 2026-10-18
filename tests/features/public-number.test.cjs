const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let numbers, buildCsv, recordMatchesSearch;
test.before(async () => {
  numbers = await import('../../src/shared/lib/public-number.js');
  ({ buildCsv } = await import('../../src/shared/lib/csv-export.js'));
  ({ recordMatchesSearch } = await import('../../src/shared/lib/teacher-filter.js'));
});

const prefixes = ['TEST', 'PROC', 'PUR', 'OUT', 'IO', 'MAT', 'BATCH', 'UNIT', 'REV'];
const oldNumber = prefix => `${prefix}-20261016-000123`;
const shortNumber = prefix => `${prefix}-261016-000123`;
const csvRows = result => {
  const rows = result.csv.replace(/^\uFEFF/, '').split('\r\n').map(line =>
    [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));
  return rows.slice(1).map(row => Object.fromEntries(rows[0].map((header, index) => [header, row[index]])));
};

test('all nine public number types show two-digit years and formatting is idempotent', () => {
  for (const prefix of prefixes) {
    assert.equal(numbers.formatPublicNumber(oldNumber(prefix)), shortNumber(prefix));
    assert.equal(numbers.formatPublicNumber(shortNumber(prefix)), shortNumber(prefix));
  }
  assert.equal(numbers.formatPublicNumber('TEST-20270102-1000001'), 'TEST-270102-1000001');
});

test('public number formatting preserves dates, amounts, material names and unknown identifiers', () => {
  for (const value of [null, undefined, 2026, 2026.2, '2026-10-16', '20261016', '2030-12-31',
    'Example90/Model450', '聚乙烯醇（PVA）', 'OTHER-20261016-000123', 'TEST-20261316-000123',
    'TEST-EXAMPLE', 'TEST-20261016', '名称 TEST-20261016-000123']) {
    assert.equal(numbers.formatPublicNumber(value), value);
  }
});

test('mixed identifier text and search aliases retain both old and shortened public numbers', () => {
  const source = `批次 ${oldNumber('BATCH')}；申请 ${oldNumber('PUR')}；有效期 2030-12-31`;
  assert.equal(numbers.formatPublicNumbers(source), `批次 ${shortNumber('BATCH')}；申请 ${shortNumber('PUR')}；有效期 2030-12-31`);
  assert.ok(numbers.publicNumberSearchText(oldNumber('TEST')).includes(shortNumber('TEST')));
  assert.ok(numbers.publicNumberSearchText(shortNumber('TEST')).includes(oldNumber('TEST')));
  assert.ok(numbers.publicNumberSearchText(oldNumber('TEST')).includes(oldNumber('TEST')));
});

test('record search accepts old and new number formats and highlight terms match visible short numbers', () => {
  for (const prefix of prefixes) {
    for (const public_id of [oldNumber(prefix), shortNumber(prefix)]) {
      const row = { public_id, material_name: '示例材料' };
      assert.equal(recordMatchesSearch(row, oldNumber(prefix)), true);
      assert.equal(recordMatchesSearch(row, shortNumber(prefix)), true);
      assert.equal(recordMatchesSearch(row, `${prefix}-261016-999999`), false);
    }
    const terms = numbers.publicNumberHighlightTerms(oldNumber(prefix));
    assert.ok(terms.includes(oldNumber(prefix)));
    assert.ok(terms.includes(shortNumber(prefix)));
  }
  assert.ok(numbers.publicNumberHighlightTerms('TEST-20261016').includes('TEST-261016'));
  assert.deepEqual(numbers.publicNumberHighlightTerms('氧化铝'), ['氧化铝']);
  assert.deepEqual(numbers.publicNumberHighlightTerms('2026-10-16'), ['2026-10-16']);
});

test('work and purchase CSV shorten identifier columns while preserving filenames and ordinary field values', () => {
  const filename = `${oldNumber('TEST')}.pdf`;
  for (const [kind, prefix] of [['test', 'TEST'], ['processing', 'PROC'], ['purchases', 'PUR']]) {
    const row = { _id: '1', public_id: oldNumber(prefix), request_type: kind === 'processing' ? '加工' : '测试',
      work_content: oldNumber('MAT'), material_name: oldNumber('MAT'), specification: '2026型号',
      quantity: 1, workload_quantity: 1, workload_unit: '次', cost_test: 2026.2, cost_processing: 2026.2,
      estimated_price: 2026.2, status: '待教师审核', received_status: '已入库', expiry_date: '2030-12-31',
      created_at: '2026-10-16T00:00:00.000Z', remark: `保留原始资料 ${oldNumber('PUR')}` };
    const collection = kind === 'purchases' ? 'lab_purchase_requests' : 'lab_work_requests';
    const before = JSON.stringify(row);
    const [cells] = csvRows(buildCsv(kind, [row], { attachments: [{ target_collection: collection,
      target_id: row._id, target_public_id: row.public_id, original_name: filename }] }));
    assert.equal(cells['申请编号'], shortNumber(prefix));
    assert.equal(cells[kind === 'purchases' ? '采购物品' : kind === 'processing' ? '加工名称' : '测试名称'], oldNumber('MAT'));
    assert.equal(cells['附件文件名'], filename);
    assert.equal(cells['备注'], row.remark);
    assert.ok(cells['提交时间'].startsWith('2026-10-16'));
    assert.ok(Object.values(cells).includes('2026.2'));
    if (kind === 'purchases') assert.equal(cells['有效期'], '2030-12-31');
    assert.equal(JSON.stringify(row), before, 'export must not mutate IDs used by actions and links');
  }
});

test('stock, outgoing approval, batch and review CSV use the same shortened reference numbers', () => {
  const rows = [
    ['stock', { public_id: oldNumber('IO'), batch_code: oldNumber('BATCH'), stock_out_request_public_id: oldNumber('OUT') },
      { '流水编号': shortNumber('IO'), '库存批次': shortNumber('BATCH'), '出库申请编号': shortNumber('OUT') }],
    ['stockRequests', { public_id: oldNumber('OUT'), batch_code: oldNumber('BATCH'), transaction_public_id: oldNumber('IO') },
      { '申请编号': shortNumber('OUT'), '库存批次': shortNumber('BATCH'), '关联出库流水': shortNumber('IO') }],
    ['batches', { public_id: oldNumber('BATCH'), batch_code: oldNumber('BATCH') }, { '批次编号': shortNumber('BATCH') }],
    ['reviews', { target_public_id: oldNumber('PUR') }, { '申请编号': shortNumber('PUR') }],
  ];
  for (const [kind, row, expected] of rows) {
    const before = JSON.stringify(row), [cells] = csvRows(buildCsv(kind, [row]));
    for (const [column, value] of Object.entries(expected)) assert.equal(cells[column], value);
    assert.equal(JSON.stringify(row), before);
  }
});

test('material and inventory summary CSV shorten batch lists without changing grouping identity', () => {
  const batch_codes = [oldNumber('BATCH'), 'BATCH-261015-000124'];
  const materials = { name_cn: '示例材料', batch_codes, storage_locations: ['A101'], stock_by_spec: [] };
  const [materialCells] = csvRows(buildCsv('materials', [materials]));
  assert.equal(materialCells['所有批次编号'], `${shortNumber('BATCH')}；BATCH-261015-000124`);
  const [inventoryCells] = csvRows(buildCsv('inventorySummary', [{ material_name: '示例材料', spec: '无',
    storage_room: 'A101', current_qty: 1, unit: '瓶', batches: [{ _id: '7' }], batch_codes }]));
  assert.equal(inventoryCells['批次编号'], `${shortNumber('BATCH')}；BATCH-261015-000124`);
  assert.deepEqual(batch_codes, [oldNumber('BATCH'), 'BATCH-261015-000124']);
});

function runtimeFixture() {
  const projectRoot = path.resolve(__dirname, "../..");
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, 'tmp-security-public-number-'));
  const sourceServer = path.join(projectRoot, 'server');
  let runtime;
  try {
    fs.cpSync(sourceServer, path.join(temporaryRoot, 'server'), { recursive: true,
      filter: source => !['data', 'uploads', 'backups', 'logs'].includes(path.relative(sourceServer, source).split(path.sep)[0]) && !source.endsWith('.test.cjs'),
    });
    fs.cpSync(path.join(projectRoot,'src'),path.join(temporaryRoot,'src'),{recursive:true});
    fs.copyFileSync(path.join(projectRoot, 'src/config/dropdown-options.json'), path.join(temporaryRoot, 'src/config/dropdown-options.json'));
    runtime = require(path.join(temporaryRoot, 'server/runtime.cjs'))();
    require(path.join(temporaryRoot, 'server/routes/ops.cjs'))(runtime);
    require(path.join(temporaryRoot, 'server/routes/attachments.cjs'))(runtime);
    return { ...runtime, close() {
      runtime.db.close();
      for (const file of Object.keys(require.cache)) if (file.startsWith(temporaryRoot + path.sep)) delete require.cache[file];
      const relative = path.relative(projectRoot, temporaryRoot);
      assert.ok(relative.startsWith('tmp-security-public-number-') && !relative.includes(path.sep));
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    } };
  } catch (error) {
    runtime?.db.close();
    const relative = path.relative(projectRoot, temporaryRoot);
    assert.ok(relative.startsWith('tmp-security-public-number-') && !relative.includes(path.sep));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

test('actual runtime generates short numbers for all prefixes, preserves full date metadata and global counter, and never rewrites legacy records', () => {
  const f = runtimeFixture();
  try {
    f.db.prepare('UPDATE id_counters SET value=999990 WHERE id=1').run();
    f.insertRecord('lab_purchase_requests', { public_id: oldNumber('PUR'), material_name: '示例材料', status: '待入库' });
    const before = f.db.prepare('SELECT * FROM records ORDER BY id').all();
    const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
    const dates = new Set([stamp()]);
    const generated = prefixes.map(prefix => f.nextPublicId(prefix)); dates.add(stamp());
    generated.forEach((row, index) => {
      assert.equal(row.id_type, prefixes[index]);
      assert.equal(row.global_seq, 999991 + index);
      assert.equal(row.date_stamp.length, 8);
      assert.ok(dates.has(row.date_stamp));
      assert.equal(row.public_id, `${prefixes[index]}-${row.date_stamp.slice(2)}-${String(row.global_seq).padStart(6, '0')}`);
    });
    assert.equal(new Set(generated.map(row => row.public_id)).size, 9);
    assert.equal(f.db.prepare('SELECT value FROM id_counters WHERE id=1').get().value, 999999);
    assert.deepEqual(f.db.prepare('SELECT * FROM records ORDER BY id').all(), before);
    assert.match(f.nextPublicId('TEST').public_id, /^TEST-\d{6}-1000000$/);
  } finally { f.close(); }
});

test('actual HTTP snapshots, approvals and attachment downloads preserve original old and new record identities', async () => {
  const f = runtimeFixture();
  let server;
  try {
    for (const [username, role] of [['number-owner', 'student'], ['number-teacher', 'teacher']]) {
      f.db.prepare(`INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at)
        VALUES(?,?,?,'active','unused-test-hash',?,?)`).run(username, username, role, f.nowISO(), f.nowISO());
    }
    const getAccount = username => f.db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
    const owner = getAccount('number-owner'), teacher = getAccount('number-teacher');
    f.studentProfiles.save({ headers: {}, ip: 'test' }, owner, {
      responsible_teacher_username: teacher.username, guiding_teacher_username: teacher.username, graduation_year: 2028,
    });
    const accounts = { owner, teacher };
    const tokens = Object.fromEntries(Object.entries(accounts).map(([key, account]) => [key, f.signToken(account)]));
    const records = [oldNumber('TEST'), f.nextPublicId('TEST').public_id].map(public_id => {
      const row = f.insertRecord('lab_work_requests', { public_id, applicant_username: owner.username,
        applicant_name: owner.display_name, request_type: '测试', work_content: '示例测试', status: '待教师审核',
        review_teacher_username: teacher.username, review_teacher_name: teacher.display_name, cost_test: 1 });
      const storage_path = `number-tests/${row._id}.txt`;
      const fullPath = path.join(f.UPLOAD_DIR, storage_path); fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `evidence:${public_id}`);
      const attachment = f.insertRecord('lab_attachments', { target_collection: 'lab_work_requests', target_id: row._id,
        target_public_id: public_id, uploaded_by_username: owner.username, attachment_state: 'bound', storage_path,
        original_name: `${public_id}.txt`, mime_type: 'text/plain' });
      return { row, attachment };
    });
    const purchase = f.insertRecord('lab_purchase_requests', { public_id: oldNumber('PUR'), applicant_username: owner.username,
      applicant_name: owner.display_name, material_name: '示例材料', status: '已入库' });
    const batch = f.insertRecord('lab_material_batches', { ...f.nextPublicId('BATCH'), material_name: '示例材料',
      related_purchase_id: purchase.public_id, current_qty: 1, unit: '瓶', expiry_date: '长期' });
    server = f.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const request = (url, role, body) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens[role]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    });
    for (const { row, attachment } of records) {
      const response = await request('/api/ops/reviewWorkRequest', 'teacher', { id: row._id, next_status: '已通过', review_note: '' });
      assert.equal(response.status, 200); const approved = await response.json();
      assert.equal(approved.record._id, row._id); assert.equal(approved.record.public_id, row.public_id);
      assert.equal(approved.record.status, '已通过');
      const download = await request(`/api/attachments/download/${attachment._id}`, 'owner');
      const evidence = await download.text();
      assert.equal(download.status, 200, evidence); assert.equal(evidence, `evidence:${row.public_id}`);
      assert.equal(f.getRecord('lab_attachments', attachment._id).target_public_id, row.public_id);
    }
    const response = await request('/api/ops/listAll', 'owner', {}); assert.equal(response.status, 200);
    const { data } = await response.json();
    for (const { row, attachment } of records) {
      assert.equal(data.lab_work_requests.find(item => item._id === row._id).public_id, row.public_id);
      assert.ok(data.lab_review_logs.some(item => item.target_id === row._id && item.target_public_id === row.public_id));
      assert.equal(data.lab_attachments.find(item => item._id === attachment._id).target_public_id, row.public_id);
    }
    const shownBatch = data.lab_material_batches.find(item => item._id === batch._id);
    assert.equal(shownBatch.related_purchase_id, purchase.public_id); assert.equal(shownBatch.purchaser_username, owner.username);
    assert.equal(f.getRecord('lab_purchase_requests', purchase._id).public_id, oldNumber('PUR'));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    f.close();
  }
});
