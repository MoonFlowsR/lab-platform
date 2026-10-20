// Isolated synthetic deployment test. It never opens a user's database or .env.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),testRoot=fs.mkdtempSync(path.join(os.tmpdir(),'lab-platform-test-'));
const random=()=>crypto.randomBytes(24).toString('hex');
const configuration={JWT_SECRET:random(),STUDENT_INVITE_CODE:random(),TEACHER_INVITE_CODE:random(),FINANCE_INVITE_CODE:random(),ADMIN_INVITE_CODE:random()};
const password=random();let child,db,base;
const port=()=>new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const selected=socket.address().port;socket.close(()=>resolve(selected));});});
async function post(route,body={},token,ok=true){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const json=await response.json();assert.equal(json.ok,ok,json.message);return json;}
(async()=>{
  fs.mkdirSync(path.join(testRoot,'server'));fs.mkdirSync(path.join(testRoot,'src'));
  fs.cpSync(path.join(root,'server'),path.join(testRoot,'server'),{recursive:true,filter:file=>! /^(?:data|uploads|backups|logs)(?:[\\/]|$)/.test(path.relative(path.join(root,'server'),file))});
  fs.cpSync(path.join(root,'src'),path.join(testRoot,'src'),{recursive:true});
  fs.copyFileSync(path.join(root,'package.json'),path.join(testRoot,'package.json'));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(testRoot,'node_modules'),process.platform==='win32'?'junction':'dir');
  const selectedPort=await port();base='http://127.0.0.1:'+selectedPort+'/api/';
  child=spawn(process.execPath,[path.join(testRoot,'server/index.cjs')],{cwd:testRoot,windowsHide:true,env:{...process.env,...configuration,PORT:String(selectedPort),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',bytes=>{errors+=bytes.toString();});child.stdout.on('data',()=>{});
  for(let attempt=0;attempt<80;attempt++){if(child.exitCode!==null)throw Error('Isolated startup failed: '+errors);try{const response=await fetch(base+'health');if(response.status===200)break;}catch{ /* The isolated server may not be ready on the first probe. */ }await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal((await fetch(base+'health')).status,200);
  const Database=require('better-sqlite3');db=new Database(path.join(testRoot,'server/data/lab_platform.db'),{readonly:true});
  for(const table of ['accounts','records','help_comments'])assert.equal(db.prepare('SELECT COUNT(*) AS total FROM '+table).get().total,0,'Fresh deployment must be empty');
  assert.equal((await fetch(base+'help-comments')).status,401,'Anonymous comments must remain private');
  const admin=(await post('auth/register',{username:'示例管理员',password,account_type:'admin',admin_code:configuration.ADMIN_INVITE_CODE})).session_token;assert.ok(admin);
  const registration=await post('auth/register',{username:'示例教师',password,account_type:'teacher',teacher_code:configuration.TEACHER_INVITE_CODE});assert.equal(registration.pending,true);
  for(const username of ['示例未知用户','示例教师'])assert.equal((await post('auth/login',{username,password:'wrong-'+password},undefined,false)).message,'账号或密码错误。');
  assert.match((await post('auth/login',{username:'示例教师',password},undefined,false)).message,/待管理员审核/);
  await post('ops/adminSetAccountStatus',{id:registration.account.id||registration.account._id,status:'active'},admin);
  const teacher=(await post('auth/login',{username:'示例教师',password})).session_token;
  const financeRegistration=await post('auth/register',{username:'示例财务',password,account_type:'finance',finance_code:configuration.FINANCE_INVITE_CODE});assert.equal(financeRegistration.pending,true);assert.equal(financeRegistration.account.account_type,'finance');
  await post('ops/adminSetAccountStatus',{id:financeRegistration.account._id,status:'active'},admin);
  const finance=(await post('auth/login',{username:'示例财务',password})).session_token;assert.equal((await post('ops/listAll',{},finance)).data.current_account.default_view_scope,'all');
  const student=(await post('auth/register',{username:'示例学生',password,account_type:'student',student_code:configuration.STUDENT_INVITE_CODE})).session_token;
  assert.equal((await post('ops/listAll',{},student,false)).code,'PROFILE_REQUIRED');
  await post('profile/save',{responsible_teacher_username:'示例教师',guiding_teacher_username:'示例教师',graduation_year:2028},student);
  const work=(await post('ops/submitWorkRequest',{request_type:'测试',work_content:'示例测试',external_unit:'示例渠道',workload_quantity:1,workload_unit:'按组',cost_test:10,review_teacher_username:'示例教师'},student)).record;
  await post('ops/reviewWorkRequest',{id:work._id,next_status:'已通过'},teacher);
  const snapshot=(await post('ops/listAll',{},student)).data;
  const approved=snapshot.lab_work_requests.find(row=>String(row._id)===String(work._id));
  const completed=(await post('ops/completeWorkRequest',{id:work._id,confirmed:true,expected_updated_at:approved.updated_at,settlement_status:'已开票',patch:{workload_quantity:2,workload_unit:'按组',cost_test:20}},student)).record;assert.equal(completed.status,'已完成');assert.equal(completed.completion_modified,true);
  const reimbursed=await post('ops/setReimbursementStatus',{collection:'lab_work_requests',id:completed._id,expected_updated_at:completed.updated_at,reimbursed:true},finance);assert.equal(reimbursed.record.reimbursed,true);assert.equal(reimbursed.record.cost_test,20);
  const purchase=(await post('ops/submitPurchaseRequest',{material_name:'示例物品',specification:'示例规格',quantity:2,unit:'套',preferred_supplier:'示例供应商',purchase_category:'耗材',purchase_purpose:'公用',estimated_price:10,safety_notes:'示例安全说明',review_teacher_username:'示例教师'},student)).record;
  assert.equal(purchase.expiry_date,undefined);const approvedPurchase=(await post('ops/reviewPurchaseRequest',{id:purchase._id,next_status:'已通过'},teacher)).record;
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const photo=(await post('attachments/uploadJson',{target_collection:'lab_purchase_requests',target_id:purchase._id,target_public_id:purchase.public_id,original_name:'example.png',mime_type:'image/png',file_base64:image},student)).attachment;
  const inbound={id:purchase._id,confirmed:true,expected_updated_at:approvedPurchase.updated_at,actual_total_price:12,settlement_status:'已挂账',actual_qty:2,unit:'套',storage_room:'A101',storage_detail:'示例柜上层',photo_attachment_id:photo._id};
  assert.match((await post('ops/completePurchaseInbound',{...inbound,settlement_status:''},student,false)).message,/工单状态/);
  assert.match((await post('ops/completePurchaseInbound',inbound,student,false)).message,/有效期/);
  const received=await post('ops/completePurchaseInbound',{...inbound,expiry_date:'长期'},student);assert.equal(received.batch.current_qty,2);assert.equal(received.batch.total_price,12);assert.equal(received.batch.unit_price,6);assert.equal(received.record.actual_total_price,12);assert.equal(received.record.estimated_price,10);assert.equal(received.record.inbound_modified,true);assert.equal(received.record.settlement_status,'已挂账');
  const shared=(await post('ops/listAll',{},teacher)).data;assert.ok(shared.lab_material_catalog.find(row=>row.name==='示例物品'));
  await post('help-comments',{kind:'message',body:'示例帮助讨论'},student);
  const readable=await fetch(base+'help-comments',{headers:{Authorization:'Bearer '+teacher}});assert.equal(readable.status,200);assert.ok((await readable.json()).comments.some(row=>row.body==='示例帮助讨论'));
  assert.equal((await fetch(base+'help-comments')).status,401);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  // Password changes must invalidate all tokens of this account, including tokens from older deployments.
  const jwt=require('jsonwebtoken'),row=db.prepare("SELECT * FROM accounts WHERE username='示例学生'").get();
  const legacy=jwt.sign({account_id:row.id,username:row.username,account_type:row.account_type,auth_version:db.prepare("SELECT value FROM platform_settings WHERE key='auth_version'").get().value},configuration.JWT_SECRET,{expiresIn:'7d'});
  assert.equal((await post('auth/me',{},legacy)).ok,true);
  await post('ops/changeMyPassword',{old_password:'wrong-fixture-password',new_password:'new-'+password},student,false);
  assert.equal((await post('auth/me',{},student)).ok,true);
  const stream=await fetch(base+'events',{headers:{Authorization:'Bearer '+legacy},signal:AbortSignal.timeout(3000)});assert.equal(stream.status,200);
  await post('ops/changeMyPassword',{old_password:password,new_password:'new-'+password},student);
  async function revoked(token){const response=await fetch(base+'auth/me',{method:'POST',headers:{Authorization:'Bearer '+token}});assert.equal(response.status,401);assert.equal((await response.json()).code,'SESSION_EXPIRED');}
  await revoked(student);await revoked(legacy);assert.match(await stream.text(),/event: session-expired/);
  assert.equal((await post('auth/me',{},admin)).ok,true);assert.equal((await post('auth/me',{},teacher)).ok,true);
  const changed=(await post('auth/login',{username:row.username,password:'new-'+password})).session_token;
  await post('ops/adminResetPassword',{id:row.id},teacher,false);assert.equal((await post('auth/me',{},changed)).ok,true);
  await post('ops/adminResetPassword',{id:row.id},admin);await revoked(changed);
  const reset=(await post('auth/login',{username:row.username,password:'123456'})).session_token;assert.equal((await post('auth/me',{},reset)).ok,true);
  // Status changes revoke only this account, including tokens from older deployments.
  const statusRegistration=await post('auth/register',{username:'示例状态学生',password,account_type:'student',student_code:configuration.STUDENT_INVITE_CODE});
  const statusId=statusRegistration.account.id||statusRegistration.account._id,statusToken=statusRegistration.session_token;
  await post('profile/save',{responsible_teacher_username:'示例教师',guiding_teacher_username:'示例教师',graduation_year:2028},statusToken);
  const statusRow=db.prepare("SELECT * FROM accounts WHERE username='示例状态学生'").get();
  const statusLegacy=jwt.sign({account_id:statusRow.id,username:statusRow.username,account_type:statusRow.account_type,auth_version:db.prepare("SELECT value FROM platform_settings WHERE key='auth_version'").get().value},configuration.JWT_SECRET,{expiresIn:'7d'});
  await post('ops/adminSetAccountStatus',{id:statusId,status:'disabled'},teacher,false);assert.equal((await post('auth/me',{},statusToken)).ok,true);
  const statusStream=await fetch(base+'events',{headers:{Authorization:'Bearer '+statusToken},signal:AbortSignal.timeout(5000)});assert.equal(statusStream.status,200);
  await post('ops/adminSetAccountStatus',{id:statusId,status:'disabled'},admin);await revoked(statusToken);await revoked(statusLegacy);assert.match(await statusStream.text(),/event: session-expired/);
  assert.equal((await post('auth/login',{username:'示例状态学生',password:'wrong-'+password},undefined,false)).message,'账号或密码错误。');
  assert.match((await post('auth/login',{username:'示例状态学生',password},undefined,false)).message,/已停用/);
  await post('ops/adminSetAccountStatus',{id:statusId,status:'active'},admin);await revoked(statusToken);await revoked(statusLegacy);
  const enabled=(await post('auth/login',{username:'示例状态学生',password})).session_token;
  await post('ops/adminSetAccountStatus',{id:statusId,status:'pending'},admin);await revoked(enabled);
  await post('ops/adminSetAccountStatus',{id:statusId,status:'active'},admin);await revoked(enabled);
  const fresh=(await post('auth/login',{username:'示例状态学生',password})).session_token;
  await post('ops/adminSetAccountStatus',{id:statusId,status:'active'},admin);assert.equal((await post('auth/me',{},fresh)).ok,true);
  assert.equal((await post('auth/me',{},teacher)).ok,true);assert.equal((await post('auth/me',{},reset)).ok,true);
  const adminRow=db.prepare("SELECT id FROM accounts WHERE username='示例管理员'").get();
  await post('ops/adminResetPassword',{id:adminRow.id},admin);await revoked(admin);
  assert.equal((await post('auth/login',{username:'示例管理员',password:'123456'})).ok,true);
  assert.equal((await post('auth/me',{},teacher)).ok,true);assert.equal((await post('auth/me',{},reset)).ok,true);
  assert.equal((await fetch(base+'gate/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_password:'disabled'})})).status,404);
  console.log('PASS empty deployment, registration, profile, designated review, final completion, inbound expiry, shared data, password-change/reset/status revocation, reactivation, login privacy, legacy tokens and event-stream invalidation.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(db)db.close();if(child&&child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}
  // Fixed mkdtemp prefix and resolved parent checked before removing the synthetic fixture.
  const resolved=path.resolve(testRoot),parent=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('lab-platform-test-'))throw Error('Unsafe synthetic cleanup path');
  const link=path.join(resolved,'node_modules');if(fs.existsSync(link))fs.unlinkSync(link);
  fs.rmSync(resolved,{recursive:true,force:true});
});
