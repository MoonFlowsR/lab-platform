const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

async function fixture() {
  // Copy only application code. Runtime creates its own empty DB/uploads here;
  // never start index.cjs, copy existing business data, or bind a production port.
  const projectRoot = path.resolve(__dirname, "../..");
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, '.tmp-security-http-'));
  const sourceServer = path.join(projectRoot, 'server');
  fs.cpSync(sourceServer, path.join(temporaryRoot, 'server'), {
    recursive: true,
    filter: source => !['data', 'uploads', 'backups'].includes(path.relative(sourceServer, source).split(path.sep)[0]) && !source.endsWith('.test.cjs'),
  });
  fs.cpSync(path.join(projectRoot,'src'),path.join(temporaryRoot,'src'),{recursive:true});
  fs.copyFileSync(path.join(projectRoot, 'src/config/dropdown-options.json'), path.join(temporaryRoot, 'src/config/dropdown-options.json'));
  const runtime = require(path.join(temporaryRoot, 'server/runtime.cjs'))();
  require(path.join(temporaryRoot, 'server/routes/auth.cjs'))(runtime);
  require(path.join(temporaryRoot, 'server/routes/attachments.cjs'))(runtime);
  require(path.join(temporaryRoot, 'server/routes/ops.cjs'))(runtime);
  const accounts = {};
  for (const [username, role] of [['owner', 'student'], ['other', 'student'], ['teacher', 'teacher'], ['admin', 'admin']]) {
    runtime.db.prepare(`INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at)
      VALUES(?,?,?,'active','unused-test-hash',?,?)`).run(username, username, role, runtime.nowISO(), runtime.nowISO());
    accounts[username] = runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
  }
  const auditRequest = { headers: {}, ip: 'test' };
  for (const username of ['owner', 'other']) runtime.studentProfiles.save(auditRequest, accounts[username], {
    responsible_teacher_username: 'teacher', guiding_teacher_username: 'teacher', graduation_year: 2028,
  });
  const tokens = Object.fromEntries(Object.entries(accounts).map(([username, account]) => [username, runtime.signToken(account)]));
  const server = runtime.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  function request(url, { body, rawBody, token, sendBody = true, declaredLength, contentType = 'application/json' } = {}) {
    const bytes = Buffer.from(rawBody ?? JSON.stringify(body ?? {}));
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method: 'POST', headers: {
        'Content-Type': contentType, 'Content-Length': declaredLength ?? bytes.length, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()), headers: res.headers }); }
          catch (error) { reject(error); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(new Error('HTTP test timed out')));
      // Header-only requests prove auth responds before reading a large body.
      if (sendBody) req.end(bytes); else req.flushHeaders();
    });
  }
  function attachment(username = 'owner', patch = {}) {
    const record = runtime.insertRecord('lab_attachments', {
      target_collection: 'draft_attachments', target_id: 'draft-test', attachment_state: 'draft',
      uploaded_by_username: username, original_name: 'proof.png', mime_type: 'image/png', ...patch,
    });
    const storagePath = `test-evidence/${record._id}.png`;
    const fullPath = path.join(runtime.UPLOAD_DIR, storagePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, 'original-evidence-file');
    return { record: runtime.updateRecord('lab_attachments', record._id, { storage_path: storagePath }), fullPath };
  }
  return {
    ...runtime, accounts, tokens, request, attachment,
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      runtime.db.close();
      for (const file of Object.keys(require.cache)) if (file.startsWith(temporaryRoot + path.sep)) delete require.cache[file];
      const relative = path.relative(projectRoot, temporaryRoot);
      assert.ok(relative.startsWith('.tmp-security-http-') && !relative.includes(path.sep));
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    },
  };
}

test('real HTTP JSON bounds, inventory evidence protection, and ordinary attachment permissions', async t => {
  const f = await fixture();
  t.after(() => f.close());

  await t.test('large upload bodies require auth before parsing, including case and trailing slash variants', async () => {
    for (const url of ['/api/attachments/uploadJson', '/api/attachments/uploadDraftJson', '/API/ATTACHMENTS/UPLOADJSON/', '/api/attachments/uploadDraftJson/']) {
      for (const token of [undefined, 'invalid-token']) {
        const response = await f.request(url, { token, sendBody: false, declaredLength: 29 * 1024 * 1024 });
        assert.equal(response.status, 401, url);
        assert.equal(response.body.code, 'SESSION_EXPIRED');
      }
      const malformed = await f.request(url, { rawBody: '{invalid json', token: f.tokens.owner });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.body.message, 'JSON 请求格式无效。');
    }
    const blocked = await f.request('/api/attachments/uploadDraftJson', {
      token: f.tokens.owner, rawBody: JSON.stringify({ padding: 'a'.repeat(28 * 1024 * 1024) }),
    });
    assert.equal(blocked.status, 413);
    assert.equal(blocked.body.ok, false);
    assert.match(blocked.headers['content-type'], /application\/json/);
  });

  await t.test('ordinary APIs cap JSON at 1 MiB and retain auth behavior for small requests', async () => {
    for (const url of ['/api/auth/login', '/api/ops/unknown', '/api/attachments/commitDraft', '/api/attachments/delete']) {
      const response = await f.request(url, { token: f.tokens.owner, body: { padding: 'a'.repeat(1024 * 1024) } });
      assert.equal(response.status, 413, url);
      assert.equal(response.body.ok, false);
    }
    assert.equal((await f.request('/api/ops/unknown', { body: {} })).status, 401);
  });

  await t.test('both authenticated base64 uploads still accept exactly 20 MiB and reject larger decoded files', async () => {
    const work = f.insertRecord('lab_work_requests', { applicant_username: 'owner', public_id: 'WORK-TEST' });
    const base64 = Buffer.alloc(20 * 1024 * 1024, 97).toString('base64');
    const endpoints = [
      ['/api/attachments/uploadJson', { target_collection: 'lab_work_requests', target_id: work._id }],
      ['/api/attachments/uploadDraftJson', { draft_id: 'large-draft' }],
    ];
    for (const [url, target] of endpoints) {
      const response = await f.request(url, { token: f.tokens.owner, body: { ...target, original_name: 'large.bin', file_base64: base64 } });
      assert.equal(response.status, 200, url);
      assert.equal(response.body.attachment.size_bytes, 20 * 1024 * 1024);
      assert.equal(fs.statSync(path.join(f.UPLOAD_DIR, response.body.attachment.storage_path)).size, 20 * 1024 * 1024);
      const oversized = await f.request(url, { token: f.tokens.owner, body: { ...target, file_base64: Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64') } });
      assert.equal(oversized.status, 400, url);
      assert.match(oversized.body.message, /20 MB/);
    }
    const forbidden = f.insertRecord('lab_work_requests', { applicant_username: 'other' });
    const response = await f.request('/api/attachments/uploadJson', { token: f.tokens.owner, body: {
      target_collection: 'lab_work_requests', target_id: forbidden._id, file_base64: 'YQ==',
    } });
    assert.equal(response.status, 400);
    assert.match(response.body.message, /无权/);
  });

  await t.test('multipart uploads retain authentication and their existing 30 MiB allowance', async () => {
    const work = f.insertRecord('lab_work_requests', { applicant_username: 'owner' });
    const boundary = 'test-safety-boundary';
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="target_collection"\r\n\r\nlab_work_requests\r\n--${boundary}\r\nContent-Disposition: form-data; name="target_id"\r\n\r\n${work._id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="multipart.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.alloc(21 * 1024 * 1024, 97), Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const response = await f.request('/api/attachments/upload', {
      token: f.tokens.owner, rawBody: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}`,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.attachment.size_bytes, 21 * 1024 * 1024);
    const noAuth = await f.request('/api/attachments/upload', { sendBody: false, declaredLength: 30 * 1024 * 1024, contentType: `multipart/form-data; boundary=${boundary}` });
    assert.equal(noAuth.status, 401);
  });

  await t.test('actual stock photo references block deletion by every role, including stale draft bindings and legacy photos', async () => {
    const references = [
      ['lab_material_batches', 'inbound_photo_attachment_id'], ['lab_stock_transactions', 'photo_attachment_id'],
      ['lab_purchase_requests', 'inbound_photo_attachment_id'], ['lab_stock_out_requests', 'photo_attachment_id'],
      ['lab_material_batches', 'storage_photo_attachment_id'],
    ];
    for (const [collection, field] of references) {
      for (const username of ['owner', 'teacher', 'admin']) {
        const evidence = f.attachment(username);
        // Legacy storage photos are also protected by the existing retired-photo guard.
        const before = f.insertRecord(collection, { [field]: evidence.record._id, public_id: `${collection}-${evidence.record._id}` });
        const response = await f.request('/api/attachments/delete', { token: f.tokens[username], body: { id: evidence.record._id } });
        assert.equal(response.status, 400, `${collection}/${username}`);
        assert.match(response.body.message, /库存凭证|历史附件入口已停用/);
        assert.equal(f.getRecord('lab_attachments', evidence.record._id).deleted_at, undefined);
        assert.deepEqual(f.getRecord(collection, before._id), before);
        assert.equal(fs.readFileSync(evidence.fullPath, 'utf8'), 'original-evidence-file');
      }
    }
  });

  await t.test('existing stock binding protects evidence without a photo field, while ordinary drafts and work/purchase files stay deletable', async () => {
    for (const collection of ['lab_material_batches', 'lab_stock_transactions', 'lab_stock_out_requests']) {
      const target = f.insertRecord(collection, { public_id: `BOUND-${collection}` });
      for (const binding of [{ target_id: target._id }, { target_id: 'stale-id', target_public_id: target.public_id }]) {
        const evidence = f.attachment('owner', { target_collection: collection, attachment_state: 'bound', ...binding });
        const response = await f.request('/api/attachments/delete', { token: f.tokens.owner, body: { id: evidence.record._id } });
        assert.equal(response.status, 400);
        assert.match(response.body.message, /关联记录管理/);
        assert.equal(fs.existsSync(evidence.fullPath), true);
      }
    }
    for (const collection of ['draft_attachments', 'lab_work_requests', 'lab_purchase_requests']) {
      const target = f.insertRecord(collection, {});
      const ordinary = f.attachment('owner', { target_collection: collection, target_id: target._id });
      const forbidden = await f.request('/api/attachments/delete', { token: f.tokens.other, body: { id: ordinary.record._id } });
      assert.equal(forbidden.status, 400);
      assert.match(forbidden.body.message, /无权/);
      const response = await f.request('/api/attachments/delete', { token: f.tokens.owner, body: { id: ordinary.record._id } });
      assert.equal(response.status, 200, collection);
      assert.ok(f.getRecord('lab_attachments', ordinary.record._id).deleted_at);
      assert.equal(fs.existsSync(ordinary.fullPath), false);
    }
    const ordinary = f.attachment('other');
    assert.equal((await f.request('/api/attachments/delete', { token: f.tokens.admin, body: { id: ordinary.record._id } })).status, 200);
  });

  await t.test('admin permanent record deletion remains available and preserves a shared stock file', async () => {
    const photo = f.attachment('owner');
    const transaction = f.insertRecord('lab_stock_transactions', { public_id: 'IO-SHARED', photo_attachment_id: photo.record._id });
    f.updateRecord('lab_attachments', photo.record._id, { target_collection: 'lab_stock_transactions', target_id: transaction._id });
    const batch = f.insertRecord('lab_material_batches', { public_id: 'BATCH-SHARED', inbound_photo_attachment_id: photo.record._id });
    const preview = await f.request('/api/ops/adminDeletePreview', { token: f.tokens.admin, body: { collection: 'lab_stock_transactions', id: transaction._id } });
    assert.equal(preview.status, 200);
    const response = await f.request('/api/ops/adminDeleteRecord', { token: f.tokens.admin, body: {
      collection: 'lab_stock_transactions', id: transaction._id, token: preview.body.preview.token,
    } });
    assert.equal(response.status, 200);
    assert.equal(f.getRecord('lab_stock_transactions', transaction._id), null);
    assert.equal(f.getRecord('lab_material_batches', batch._id).inbound_photo_attachment_id, photo.record._id);
    assert.equal(f.getRecord('lab_attachments', photo.record._id).target_collection, 'lab_material_batches');
    assert.equal(fs.existsSync(photo.fullPath), true);
  });

  await t.test('record timestamps strictly advance even within a millisecond or after a future timestamp', () => {
    let record = f.insertRecord('lab_material_batches', { current_qty: 1, updated_at: '2090-01-01T00:00:00.000Z' });
    for (let i = 0; i < 3; i++) {
      const next = f.updateRecord('lab_material_batches', record._id, { current_qty: i + 2 });
      assert.equal(Date.parse(next.updated_at), Date.parse(record.updated_at) + 1);
      record = next;
    }
    f.db.prepare("UPDATE records SET updated_at='invalid' WHERE collection=? AND id=?").run('lab_material_batches', Number(record._id));
    assert.ok(Number.isFinite(Date.parse(f.updateRecord('lab_material_batches', record._id, { current_qty: 2 }).updated_at)));
  });
});
