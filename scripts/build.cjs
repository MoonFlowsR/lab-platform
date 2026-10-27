require('../server/config.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
require('./release.cjs').check(root);
const staging = path.join(root, '.build-' + process.pid);
const target = path.join(root, 'dist');
try {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', staging], {cwd:root, stdio:'inherit'});
  if (result.status !== 0) throw new Error('页面构建失败，已发布页面保持原样。');
  const html = fs.readFileSync(path.join(staging, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
  if (!assets.some(name => name.endsWith('.js')) || assets.some(name => !fs.existsSync(path.join(staging,name)))) throw new Error('构建文件不完整。');
  fs.mkdirSync(target, {recursive:true});
  for (const name of fs.readdirSync(staging)) if (name !== 'index.html') fs.cpSync(path.join(staging,name),path.join(target,name),{recursive:true});
  // Publish the entry last. Keep earlier hashed assets available to already-open tabs.
  const next = path.join(target, 'index.next.html');
  fs.copyFileSync(path.join(staging,'index.html'),next);
  fs.renameSync(next,path.join(target,'index.html'));
  console.log('页面发布完成，已打开的页面仍可读取原有资源。');
} catch(error) { console.error(error.message); process.exitCode=1; }
finally { if (staging.startsWith(root+path.sep) && fs.existsSync(staging)) fs.rmSync(staging,{recursive:true,force:true}); }
