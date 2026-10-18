const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const env={...process.env};
for(const key of ['JWT_SECRET','STUDENT_INVITE_CODE','TEACHER_INVITE_CODE','ADMIN_INVITE_CODE'])env[key]=randomBytes(32).toString('hex');
for(const args of [['--test','tests/**/*.test.cjs'],['scripts/smoke-test.cjs']]){
  const result=spawnSync(process.execPath,args,{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:'inherit',env});
  if(result.status!==0){process.exitCode=result.status||1;break;}
}
