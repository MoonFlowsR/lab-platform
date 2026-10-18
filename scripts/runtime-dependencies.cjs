const fs = require('node:fs');
const path = require('node:path');
const stable = value => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
}
const declarations = value => ({ dependencies: value.dependencies || {}, optionalDependencies: value.optionalDependencies || {} });
function runtimeLock(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  let lock;
  try { lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')); } catch { throw Error('缺少有效package-lock.json，请先按锁文件安装依赖。当前服务未变。'); }
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages?.['']) throw Error('锁文件格式不受支持，请先重新生成并验证。当前服务未变。');
  if (stable(declarations(manifest)) !== stable(declarations(lock.packages['']))) throw Error('依赖声明与锁文件不一致，请先完成依赖安装。当前服务未变。');
  const packages = {};
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative || entry.dev === true) continue;
    if (!relative.startsWith('node_modules/') || relative.includes('..') || relative.includes('\\') || entry.link || !entry.version) throw Error('运行依赖包含非标准本地链接，请按维护文档更新。当前服务未变。');
    packages[relative] = entry;
  }
  return { root, declarations: declarations(manifest), packages };
}
function verifyInstalled(lock) {
  for (const [relative, entry] of Object.entries(lock.packages)) {
    const file = path.join(lock.root, relative, 'package.json');
    if (!fs.existsSync(file) && (entry.optional || entry.devOptional)) continue;
    let installed;
    try { installed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw Error('运行依赖尚未完整安装：' + relative + '。当前服务未变。'); }
    if (installed.version !== entry.version) throw Error('已安装依赖与锁文件版本不同：' + relative + '。请先完成依赖安装，当前服务未变。');
  }
}
module.exports = function assertCompatibleRuntime(currentRoot, candidateRoot) {
  const current = runtimeLock(currentRoot), candidate = runtimeLock(candidateRoot);
  if (stable(current.declarations) !== stable(candidate.declarations) || stable(current.packages) !== stable(candidate.packages)) throw Error('锁定的运行依赖有变化，请先按维护文档完成依赖升级。当前服务未变。');
  verifyInstalled(current);
  // Program-only rollback backups intentionally omit node_modules.
  if (fs.existsSync(path.join(candidateRoot, 'node_modules'))) verifyInstalled(candidate);
};
