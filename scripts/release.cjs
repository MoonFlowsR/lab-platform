const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const levels = new Set(['major', 'minor', 'patch']);
const levelNames = { major: '大版本', minor: '功能更新', patch: '修复更新' };
const historyFile = 'src/config/release-history.json';

function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('版本号须为三个非负整数，例如 2.0.0。');
  }
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('版本号超出可用范围。');
  return parts;
}

function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
    throw new Error('发布日期须为有效的 YYYY-MM-DD 日期。');
  }
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/[\r\n]/.test(value);
}

function validate(pkg, lock, history) {
  versionParts(pkg.version);
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json 与 package-lock.json 的三处版本号不一致。');
  }
  if (history?.schemaVersion !== 1 || !Number.isSafeInteger(history.historicalUpdates)
    || history.historicalUpdates <= 0 || !Array.isArray(history.releases) || !history.releases.length) {
    throw new Error('发布记录格式无效；历史更新次数须为正整数且须保留发布记录。');
  }
  validateDate(history.historicalThrough);
  if (history.legacyEntries !== undefined) {
    if (!Array.isArray(history.legacyEntries) || history.legacyEntries.length !== history.historicalUpdates) {
      throw new Error('早期更新条数须与历史更新次数一致。');
    }
    for (const entry of history.legacyEntries) {
      if (!entry || !text(entry.summary) || Object.keys(entry).sort().join(',') !== 'date,summary') {
        throw new Error('早期更新须仅包含日期和通用摘要。');
      }
      if (entry.date !== null) validateDate(entry.date);
    }
  }
  const versions = new Set();
  for (const release of history.releases) {
    versionParts(release?.version);
    validateDate(release.date);
    if (!levels.has(release.level) || !text(release.summary) || !Array.isArray(release.changes)
      || !release.changes.length || !release.changes.every(text)) {
      throw new Error('每次发布须包含变更级别、摘要和变更说明。');
    }
    if (versions.has(release.version)) throw new Error('发布记录中存在重复版本号。');
    versions.add(release.version);
  }
  if (history.releases[0].version !== pkg.version) throw new Error('最新发布记录与 package.json 版本号不一致。');
  const totalUpdates = history.historicalUpdates + history.releases.length;
  if (!Number.isSafeInteger(totalUpdates)) throw new Error('累计更新次数超出可用范围。');
  return { version: pkg.version, historicalUpdates: history.historicalUpdates, totalUpdates, history };
}

function load(root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
  return { pkg: read('package.json'), lock: read('package-lock.json'), history: read(historyFile) };
}

function check(root = projectRoot) {
  const { pkg, lock, history } = load(path.resolve(root));
  return validate(pkg, lock, history);
}

function changelog(history) {
  const lines = ['# 更新记录', '', `累计更新 ${history.historicalUpdates + history.releases.length} 次；${history.historicalThrough} 及以前的 ${history.historicalUpdates} 次更新计入历史基线。`, ''];
  if (history.historyNote) lines.push(history.historyNote, '');
  for (const release of history.releases) {
    lines.push(`## ${release.version} · ${release.date} · ${levelNames[release.level]}`, '', release.summary, '');
    const changes = [...new Set(release.changes)].filter(change => change !== release.summary);
    if (changes.length) lines.push(...changes.map(change => '- ' + change), '');
  }
  if (history.legacyEntries?.length) {
    lines.push(`## 早期更新（${history.historicalUpdates} 次）`, '', '以下逐次说明已计入历史基线，不重复累计。', '',
      ...history.legacyEntries.map(entry => `- ${entry.date ?? '日期未记录'} · ${entry.summary}`), '');
  }
  return lines.join('\n');
}

// Prepare every file first; restore the previous bytes if a replacement fails.
function writeCandidate(root, files) {
  const suffix = `.release-${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  const staged = [], replaced = [], createdDirs = [];
  try {
    for (const [file, content] of files) {
      const target = path.join(root, file), directory = path.dirname(target);
      if (!fs.existsSync(directory)) { fs.mkdirSync(directory, { recursive: true }); createdDirs.push(directory); }
      const item = { target, temporary: target + suffix, original: fs.existsSync(target) ? fs.readFileSync(target) : null };
      staged.push(item);
      fs.writeFileSync(item.temporary, content, { flag: 'wx' });
    }
    for (const item of staged) { fs.renameSync(item.temporary, item.target); replaced.push(item); }
  } catch (error) {
    for (const item of replaced.reverse()) {
      if (item.original === null) fs.unlinkSync(item.target);
      else fs.writeFileSync(item.target, item.original);
    }
    throw error;
  } finally {
    for (const item of staged) if (fs.existsSync(item.temporary)) fs.unlinkSync(item.temporary);
    for (const directory of createdDirs.reverse()) if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
}

function bump(root, level, summary, options = {}) {
  root = path.resolve(root);
  const { pkg, lock, history } = load(root);
  validate(pkg, lock, history);
  if (!levels.has(level)) throw new Error('更新级别须为 major、minor 或 patch。');
  if (!text(summary)) throw new Error('请填写本次更新摘要。');
  const date = options.date ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  validateDate(date);
  const parts = versionParts(pkg.version), index = { major: 0, minor: 1, patch: 2 }[level];
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  const version = parts.join('.');
  versionParts(version);
  pkg.version = lock.version = lock.packages[''].version = version;
  history.releases.unshift({ version, date, level, summary: summary.trim(), changes: [summary.trim()] });
  const result = validate(pkg, lock, history);
  const json = value => JSON.stringify(value, null, 2) + '\n';
  writeCandidate(root, [
    ['package.json', json(pkg)], ['package-lock.json', json(lock)],
    [historyFile, json(history)], ['docs/CHANGELOG.md', changelog(history)],
  ]);
  return result;
}

module.exports = { check, bump, renderChangelog: changelog };

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (!args.length || (args.length === 1 && args[0] === '--check')) {
      result = check();
      console.log(`版本 ${result.version} 校验通过，累计更新 ${result.totalUpdates} 次。`);
    } else {
      if (args.length !== 2) throw new Error('用法：npm run release -- major|minor|patch "更新摘要"');
      result = bump(projectRoot, args[0], args[1]);
      console.log(`已准备 ${result.version} 发布候选，累计更新 ${result.totalUpdates} 次；尚未发布上线。`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
