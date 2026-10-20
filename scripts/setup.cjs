const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.env');
if(Number(process.versions.node.split('.')[0])!==24){console.error('请安装 Node.js 24.x LTS 后再运行。');process.exit(1);}
const random=bytes=>crypto.randomBytes(bytes).toString('hex');
if(fs.existsSync(file)){
  const content=fs.readFileSync(file,'utf8');
  const financeLine=/^[ \t]*FINANCE_INVITE_CODE[ \t]*=[ \t]*([^\r\n]*)/m;
  const existing=[...content.matchAll(new RegExp(financeLine.source,'gm'))].some(match=>match[1].trim().replace(/^(["'])(.*)\1$/, '$2').trim());
  if(existing){console.log('.env 已存在，保留原密钥和注册码。');process.exit(0);}
  const usedCodes=[...content.matchAll(/^[ \t]*(?:STUDENT|TEACHER|ADMIN)_INVITE_CODE[ \t]*=[ \t]*([^\r\n]*)/gm)].map(match=>match[1].trim().replace(/^(["'])(.*)\1$/, '$2'));
  let code;do{code=random(12);}while(usedCodes.includes(code));
  const line='FINANCE_INVITE_CODE='+code;
  const updated=financeLine.test(content)?content.replace(financeLine,line):content+(content.endsWith('\n')?'':'\n')+line+'\n';
  const temporary=file+'.setup-'+process.pid+'.tmp';
  try{fs.writeFileSync(temporary,updated,{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  console.log('已补充独立财务注册码，原密钥、其他注册码和服务配置保持不变。');
}else{
  const content=['# Private local configuration. Never publish this file.','HOST=127.0.0.1','PORT=3001','JWT_SECRET='+random(32),'STUDENT_INVITE_CODE='+random(12),'TEACHER_INVITE_CODE='+random(12),'FINANCE_INVITE_CODE='+random(12),'ADMIN_INVITE_CODE='+random(12),''].join('\n');
  fs.writeFileSync(file,content,{flag:'wx',mode:0o600});
  console.log('已生成本机独立的 .env，包含四类账号的注册码。下一步运行 npm ci，再运行 npm run local。');
}
