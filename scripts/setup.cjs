const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.env');
if(Number(process.versions.node.split('.')[0])!==24){console.error('请安装 Node.js 24.x LTS 后再运行。');process.exit(1);}
if(fs.existsSync(file)){console.log('.env 已存在，保留原密钥和注册码。请勿删除或覆盖正在使用的配置。');process.exit(0);}
const random=bytes=>crypto.randomBytes(bytes).toString('hex');
const content=['# Private local configuration. Never publish this file.','HOST=127.0.0.1','PORT=3001','JWT_SECRET='+random(32),'STUDENT_INVITE_CODE='+random(12),'TEACHER_INVITE_CODE='+random(12),'ADMIN_INVITE_CODE='+random(12),''].join('\n');
fs.writeFileSync(file,content,{flag:'wx',mode:0o600});
console.log('已生成本机独立的 .env。注册码在此文件中查看，按角色分别提供给组内成员。下一步运行 npm ci，再运行 npm run local。');
