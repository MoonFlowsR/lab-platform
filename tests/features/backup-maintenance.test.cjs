const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const Database = require('better-sqlite3');
const createBackup = require('../../server/services/database-backup.cjs');
const compatible = require('../../scripts/runtime-dependencies.cjs');
function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'platform-maintenance-')); }
function write(root, file, content) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content)); }
test('database and config snapshots retain together, exclude uploads and clean only completed empty sidecars', async () => {
  const root = temporary(), backupDir = path.join(root, 'backups'), db = new Database(path.join(root, 'live.db'));
  db.pragma('journal_mode=WAL'); db.exec('CREATE TABLE items(value); INSERT INTO items VALUES(42)');
  write(root, '.env', 'PRIVATE_TEST_CONFIG=example'); write(root, 'src/config/platform-settings.json', { title: '示例' }); write(root, 'server/uploads/photo.jpg', 'not copied');
  fs.mkdirSync(backupDir);
  const old = 'lab_platform_20000101000000000.db', retained = 'lab_platform_20000101000000001.db';
  for (const name of [old, retained]) { write(backupDir, name, 'previous'); write(backupDir, name + '.partial-shm', 'shared'); write(backupDir, name + '.partial-wal', name === old ? '' : 'unrecovered'); }
  let stamp = 0;
  const backup = createBackup({ db, backupDir, projectRoot: root, retain: 3, clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, stamp++)) });
  try {
    const first = await backup();
    assert.equal(fs.readFileSync(first + '.config/.env', 'utf8'), 'PRIVATE_TEST_CONFIG=example');
    assert(!fs.existsSync(first + '.config/server/uploads'));
    assert(!fs.existsSync(path.join(backupDir, old + '.partial-shm')));
    assert(fs.existsSync(path.join(backupDir, retained + '.partial-wal')));
    assert(!fs.existsSync(first + '.partial-shm')); assert(!fs.existsSync(first + '.partial-wal'));
    const copy = new Database(first, { readonly: true }); try { assert.equal(copy.prepare('SELECT value FROM items').get().value, 42); assert.equal(copy.pragma('journal_mode', { simple: true }), 'delete'); } finally { copy.close(); }
    await backup(); await backup(); await backup();
    assert(!fs.existsSync(first)); assert(!fs.existsSync(first + '.config'));
    const snapshots = fs.readdirSync(backupDir).filter(name => /^lab_platform_\d+\.db$/.test(name));
    assert.equal(snapshots.length, 3); assert(snapshots.every(name => fs.existsSync(path.join(backupDir, name + '.config/manifest.json'))));
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
test('failed database snapshot removes its config and temporary sidecars without publishing a pair', async () => {
  const root = temporary(), backupDir = path.join(root, 'backups'); write(root, '.env', 'example');
  const db = { async backup(file) { write(root, path.relative(root, file), 'partial'); write(root, path.relative(root, file) + '-wal', 'partial'); throw Error('injected failure'); } };
  try { await assert.rejects(createBackup({ db, backupDir, projectRoot: root })(), /injected/); assert.deepEqual(fs.readdirSync(backupDir), []); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
function dependencyFixture(root, version = '1.0.0') {
  const dependencies = { example: '^1.0.0' };
  write(root, 'package.json', { dependencies });
  write(root, 'package-lock.json', { lockfileVersion: 3, packages: { '': { dependencies }, 'node_modules/example': { version, dependencies: { nested: '^2.0.0' } }, 'node_modules/nested': { version: '2.0.0' } } });
  write(root, 'node_modules/example/package.json', { version }); write(root, 'node_modules/nested/package.json', { version: '2.0.0' });
}
test('runtime guard rejects lock-only version and transitive changes before maintenance', () => {
  const root = temporary(), current = path.join(root, 'current'), candidate = path.join(root, 'candidate');
  try { dependencyFixture(current); dependencyFixture(candidate, '1.1.0'); assert.throws(() => compatible(current, candidate), /锁定/);
    dependencyFixture(candidate); const lock = JSON.parse(fs.readFileSync(path.join(candidate, 'package-lock.json'))); lock.packages['node_modules/nested'].version = '2.1.0'; write(candidate, 'package-lock.json', lock); assert.throws(() => compatible(current, candidate), /锁定/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('runtime guard checks installed versions and supports program-only rollback and development-only updates', () => {
  const root = temporary(), current = path.join(root, 'current'), candidate = path.join(root, 'candidate');
  try { dependencyFixture(current); dependencyFixture(candidate); assert.doesNotThrow(() => compatible(current, candidate));
    write(current, 'node_modules/example/package.json', { version: '0.9.0' }); assert.throws(() => compatible(current, candidate), /已安装/); dependencyFixture(current);
    const lock = JSON.parse(fs.readFileSync(path.join(candidate, 'package-lock.json'))); lock.packages['node_modules/dev-tool'] = { version: '2.0.0', dev: true }; write(candidate, 'package-lock.json', lock); assert.doesNotThrow(() => compatible(current, candidate));
    fs.rmSync(path.join(candidate, 'node_modules'), { recursive: true }); assert.doesNotThrow(() => compatible(current, candidate));
    fs.unlinkSync(path.join(candidate, 'package-lock.json')); assert.throws(() => compatible(current, candidate), /package-lock/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
