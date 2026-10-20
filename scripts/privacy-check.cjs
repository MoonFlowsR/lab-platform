// Checks files Git would publish; cannot be used as proof that arbitrary untracked folders are safe.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let files;
try{files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);}catch{console.error('请先在独立源码目录运行 git init 和 git add，然后重新检查。');process.exit(1);}
if(!files.length){console.error('没有已暂存或跟踪的文件。请先 git add，再运行检查。');process.exit(1);}
const blocked=/^work(?:\/|$)|(?:^|\/)(?:node_modules|dist|data|uploads|backups|logs|_platform_backups|outputs)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:db(?:-.+)?|sqlite3?(?:-.+)?|bak(?:-.+)?|pem|key|pfx|p12|log|csv|xlsx|docx|pdf|zip|7z)$/i;
const findings=[];
for(const rel of files){
  if((blocked.test(rel)&&rel!=='.env.example') || /(?:^|\/)(?:\.git\/|network-private\/|frp[cs][^/]*\.toml$|Caddyfile$)/i.test(rel)){findings.push(rel+': forbidden runtime/private file');continue;}
  const full=path.join(root,rel);if(!fs.existsSync(full))continue;
  const text=fs.readFileSync(full,'utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b/.test(text))findings.push(rel+': possible secret');
  if(rel!=='.env.example' && /^(?:JWT_SECRET|(?:STUDENT|TEACHER|FINANCE|ADMIN)_INVITE_CODE)\s*=\s*\S+/m.test(text))findings.push(rel+': populated runtime configuration');
}
if(findings.length){console.error(findings.join('\n'));process.exit(1);}
console.log('Git 待发布文件检查通过（'+files.length+' 个文件）：未包含数据库、附件、真实配置、日志、备份或常见密钥。发布前仍须查看 git diff --cached。');
