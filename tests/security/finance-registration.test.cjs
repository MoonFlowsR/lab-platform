const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('finance registers as an independent pending role, with its own code and existing read/reimbursement permissions',async()=>{
 const root=path.resolve(__dirname,'../..'),temporary=fs.mkdtempSync(path.join(root,'.tmp-finance-registration-'));let runtime,server;
 const originalCode=process.env.FINANCE_INVITE_CODE;
 try{
  fs.cpSync(path.join(root,'server'),path.join(temporary,'server'),{recursive:true,filter:source=>!['data','uploads','logs','backups'].includes(path.relative(path.join(root,'server'),source).split(path.sep)[0])});fs.cpSync(path.join(root,'src'),path.join(temporary,'src'),{recursive:true});
  const createRuntime=require(path.join(temporary,'server/runtime.cjs'));runtime=createRuntime();
  for(const name of ['auth','ops'])require(path.join(temporary,'server/routes/'+name+'.cjs'))(runtime);
  server=await new Promise(resolve=>{const listener=runtime.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const call=async(action,body={},token)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:response.status,json:await response.json()};};
  const password='synthetic-register-password',labels={admin:'管理员',student:'学生',teacher:'教师',finance:'财务'};
  const register=(role,extra={})=>call('auth/register',{username:'示例注册'+labels[role],display_name:'示例注册'+labels[role],password,account_type:role,...extra});
  for(const code of [runtime.STUDENT_INVITE_CODE,runtime.TEACHER_INVITE_CODE,runtime.ADMIN_INVITE_CODE,'']){const failed=await register('finance',{finance_code:code,teacher_code:runtime.TEACHER_INVITE_CODE});assert.equal(failed.status,400);assert.match(failed.json.message,/财务注册码错误/);}
  assert.equal(runtime.db.prepare('SELECT COUNT(*) AS total FROM accounts').get().total,0);
  const admin=await register('admin',{admin_code:runtime.ADMIN_INVITE_CODE});assert(admin.json.session_token);
  const student=await register('student',{student_code:runtime.STUDENT_INVITE_CODE});assert(student.json.session_token);
  const teacher=await register('teacher',{teacher_code:runtime.TEACHER_INVITE_CODE});assert.equal(teacher.json.pending,true);
  const finance=await register('finance',{finance_code:runtime.FINANCE_INVITE_CODE});assert.equal(finance.status,200);assert.equal(finance.json.pending,true);assert.equal(finance.json.account.account_type,'finance');assert.equal(finance.json.account.status,'pending');assert(!finance.json.session_token);assert(!finance.json.account.password_hash);
  const credentials={username:finance.json.account.username,password};assert.match((await call('auth/login',credentials)).json.message,/待管理员审核/);
  const account=runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(credentials.username);assert.equal((await call('ops/listAll',{},runtime.signToken(account))).status,401);
  assert.equal((await call('ops/adminSetAccountStatus',{id:account.id,status:'active'},admin.json.session_token)).status,200);
  const loggedIn=await call('auth/login',credentials);assert.equal(loggedIn.status,200);assert.equal(loggedIn.json.account.account_type,'finance');assert.equal(loggedIn.json.account.default_view_scope,'all');assert.equal(loggedIn.json.account.profile_required,false);
  const token=loggedIn.json.session_token;assert.equal((await call('ops/listAll',{},token)).status,200);assert.match((await call('ops/reviewWorkRequest',{},token)).json.message,/财务账号/);assert(!(await call('auth/me',{},token)).json.teachers.some(row=>row.username===credentials.username));
  await new Promise(resolve=>server.close(resolve));server=null;runtime.db.close();runtime=null;
  process.env.FINANCE_INVITE_CODE=process.env.TEACHER_INVITE_CODE;assert.throws(()=>createRuntime(),/互不相同/);
  delete process.env.FINANCE_INVITE_CODE;runtime=createRuntime();assert.equal(runtime.FINANCE_INVITE_CODE,'','Legacy configuration starts normally without borrowing another role code');
  require(path.join(temporary,'server/routes/auth.cjs'))(runtime);server=await new Promise(resolve=>{const listener=runtime.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const unavailable=await register('finance',{finance_code:'synthetic-guess'});assert.equal(unavailable.status,400);assert.match(unavailable.json.message,/尚未配置/);
  assert.deepEqual(runtime.db.pragma('foreign_key_check'),[]);
 }finally{
  if(originalCode===undefined)delete process.env.FINANCE_INVITE_CODE;else process.env.FINANCE_INVITE_CODE=originalCode;
  if(server)await new Promise(resolve=>server.close(resolve));runtime?.db.close();
  assert.equal(path.dirname(temporary),root);assert(path.basename(temporary).startsWith('.tmp-finance-registration-'));fs.rmSync(temporary,{recursive:true,force:true});
 }
});
