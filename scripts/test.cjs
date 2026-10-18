const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),env={...process.env};
for(const key of ['JWT_SECRET','STUDENT_INVITE_CODE','TEACHER_INVITE_CODE','ADMIN_INVITE_CODE'])env[key]=randomBytes(32).toString('hex');
const commands=[['--test','tests/**/*.test.cjs']];
if(fs.existsSync(path.join(root,'scripts/smoke-test.cjs')))commands.push(['scripts/smoke-test.cjs']);
for(const args of commands){
  const result=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit',env});
  if(result.status!==0){process.exitCode=result.status||1;break;}
}
