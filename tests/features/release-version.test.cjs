const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { check, bump, renderChangelog } = require('../../scripts/release.cjs');

const historyFile = 'src/config/release-history.json';
function write(root, file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}
function read(root, file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-release-'));
  write(root, 'package.json', { name: 'example-platform', version: '2.0.0', scripts: { server: 'example-command' } });
  write(root, 'package-lock.json', { name: 'example-platform', version: '2.0.0', lockfileVersion: 3, packages: { '': { name: 'example-platform', version: '2.0.0' }, 'node_modules/example': { version: '1.2.3' } } });
  write(root, historyFile, { schemaVersion: 1, historicalUpdates: 88, historicalThrough: '2026-10-27', releases: [{ version: '2.0.0', date: '2026-10-27', level: 'major', summary: '双端界面与主题体验升级', changes: ['优化页面布局', '新增主题选择'] }] });
  write(root, '.env', 'EXAMPLE_SECRET=unchanged\n');
  write(root, 'server/data/example.db', 'synthetic database bytes');
  write(root, 'docs/CHANGELOG.md', 'previous changelog\n');
  return root;
}
function snapshot(root) {
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files[path.relative(root, file)] = fs.readFileSync(file).toString('base64');
    }
  }
  visit(root);
  return files;
}
function cleanup(root) {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert(path.basename(root).startsWith('platform-release-'));
  fs.rmSync(root, { recursive: true, force: true });
}

test('release check counts the verified baseline once and does not write any files', () => {
  const root = fixture();
  try {
    const before = snapshot(root), result = check(root);
    assert.equal(result.version, '2.0.0');
    assert.equal(result.historicalUpdates, 88);
    assert.equal(result.totalUpdates, 89);
    assert.deepEqual(snapshot(root), before);
  } finally { cleanup(root); }
});

test('bump rejects inconsistent package, lock and history versions before any write', () => {
  for (const file of ['package.json', 'package-lock.json', 'lock-root', historyFile]) {
    const root = fixture();
    try {
      const target = file === 'lock-root' ? 'package-lock.json' : file, value = read(root, target);
      if (file === 'lock-root') value.packages[''].version = '2.0.1';
      else if (file === historyFile) value.releases[0].version = '2.0.1';
      else value.version = '2.0.1';
      write(root, target, value);
      const before = snapshot(root);
      assert.throws(() => bump(root, 'patch', '修复显示'), /不一致/);
      assert.deepEqual(snapshot(root), before);
    } finally { cleanup(root); }
  }
});

test('release history rejects duplicates, impossible dates, invalid versions and missing descriptions', () => {
  const invalid = [
    value => { value.schemaVersion = 2; },
    value => { value.historicalUpdates = 0; },
    value => { value.historicalUpdates = 1.5; },
    value => { value.historicalThrough = '2026-02-30'; },
    value => { value.releases[0].date = '2026-13-01'; },
    value => { value.releases[0].version = '02.0.0'; },
    value => { value.releases.push({ ...value.releases[0] }); },
    value => { value.releases[0].changes = []; },
    value => { value.releases[0].summary = ' '; },
    value => { value.releases[0].level = 'unknown'; },
  ];
  for (const mutate of invalid) {
    const root = fixture();
    try {
      const history = read(root, historyFile); mutate(history); write(root, historyFile, history);
      const before = snapshot(root);
      assert.throws(() => check(root));
      assert.throws(() => bump(root, 'patch', '修复显示'));
      assert.deepEqual(snapshot(root), before);
    } finally { cleanup(root); }
  }
});

test('patch, minor and major each prepare one counted candidate and keep dependency and business bytes', () => {
  const root = fixture();
  try {
    const packageScripts = read(root, 'package.json').scripts;
    const secret = fs.readFileSync(path.join(root, '.env'));
    const data = fs.readFileSync(path.join(root, 'server/data/example.db'));
    const cases = [['patch', '2.0.1', 90], ['minor', '2.1.0', 91], ['major', '3.0.0', 92]];
    for (const [level, version, total] of cases) {
      const result = bump(root, level, '本次通用更新', { date: '2026-10-28' });
      const pkg = read(root, 'package.json'), lock = read(root, 'package-lock.json'), history = read(root, historyFile);
      assert.equal(result.totalUpdates, total);
      assert.equal(pkg.version, version); assert.equal(lock.version, version); assert.equal(lock.packages[''].version, version);
      assert.equal(history.releases[0].version, version);
      assert.equal(history.releases[0].level, level);
      assert.equal(history.historicalUpdates, 88);
      assert.equal(history.releases.length, total - 88);
      assert.equal(lock.packages['node_modules/example'].version, '1.2.3');
      assert.deepEqual(pkg.scripts, packageScripts);
      assert.deepEqual(fs.readFileSync(path.join(root, '.env')), secret);
      assert.deepEqual(fs.readFileSync(path.join(root, 'server/data/example.db')), data);
      const markdown = fs.readFileSync(path.join(root, 'docs/CHANGELOG.md'), 'utf8');
      assert(markdown.includes(`累计更新 ${total} 次`));
      assert(markdown.includes(`## ${version} · 2026-10-28`));
      assert.equal((markdown.match(/## /g) || []).length, history.releases.length);
      assert(!Object.keys(snapshot(root)).some(file => file.endsWith('.tmp')));
    }
  } finally { cleanup(root); }
});

test('CLI defaults to read-only checks and refuses missing summaries or unsupported arguments', () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.resolve(__dirname, '../../scripts/release.cjs'), path.join(root, 'scripts/release.cjs'));
    const before = snapshot(root);
    for (const args of [[], ['--check']]) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/release.cjs'), ...args], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /2\.0\.0.*89/);
      assert.deepEqual(snapshot(root), before);
    }
    for (const args of [['patch'], ['patch', ' '], ['unknown', '更新说明'], ['patch', '更新\n说明']]) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/release.cjs'), ...args], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 1);
      assert.deepEqual(snapshot(root), before);
    }
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/release.cjs'), 'patch', '修复通用显示'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /发布候选.*90.*尚未发布上线/);
    assert.equal(check(root).version, '2.0.1');
  } finally { cleanup(root); }
});

test('failed candidate replacement rolls back changed files and removes temporary files', () => {
  const root = fixture(), rename = fs.renameSync;
  try {
    const before = snapshot(root);
    fs.renameSync = (source, target) => {
      if (target === path.join(root, historyFile)) throw new Error('synthetic replacement failure');
      return rename(source, target);
    };
    assert.throws(() => bump(root, 'patch', '修复通用显示'), /synthetic replacement failure/);
    assert.deepEqual(snapshot(root), before);
  } finally { fs.renameSync = rename; cleanup(root); }
});

test('legacy summaries validate their baseline count and dates, survive bumps, and never count twice', () => {
  const root = fixture();
  try {
    const history = read(root, historyFile);
    history.historyNote = '历史版本按已完成更新回执整理补录。';
    history.legacyEntries = Array.from({ length: 88 }, (_, i) => ({ date: i % 2 ? '2026-10-22' : null, summary: `通用早期更新 ${i + 1}` }));
    write(root, historyFile, history);
    assert.equal(check(root).totalUpdates, 89);
    const markdown = renderChangelog(history);
    assert(markdown.includes(history.historyNote));
    assert(markdown.includes('日期未记录 · 通用早期更新 1'));
    assert(markdown.includes('2026-10-22 · 通用早期更新 2'));
    assert(markdown.includes('不重复累计'));
    assert.equal(bump(root, 'patch', '修复通用显示').totalUpdates, 90);
    assert.deepEqual(read(root, historyFile).legacyEntries, history.legacyEntries);
    for (const mutate of [value => value.legacyEntries.pop(), value => { value.legacyEntries[0].date = '2026-02-30'; }, value => { value.legacyEntries[0].summary = ''; }, value => { value.legacyEntries[0].task = 'private-only'; }]) {
      const current = read(root, historyFile); mutate(current); write(root, historyFile, current);
      const before = snapshot(root);
      assert.throws(() => check(root)); assert.throws(() => bump(root, 'patch', '修复通用显示'));
      assert.deepEqual(snapshot(root), before);
      current.legacyEntries = structuredClone(history.legacyEntries); write(root, historyFile, current);
    }
  } finally { cleanup(root); }
});
