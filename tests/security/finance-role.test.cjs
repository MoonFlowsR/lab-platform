const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('HTTP finance reads teacher data, marks reimbursement, cannot approve or edit business data; role changes revoke sessions',async()=>{
 const root=path.resolve(__dirname,'../..'),temporary=fs.mkdtempSync(path.join(root,'.tmp-finance-'));
 let runtime,server;
 try{
  fs.cpSync(path.join(root,'server'),path.join(temporary,'server'),{recursive:true,filter:source=>!['data','uploads','logs','backups'].includes(path.relative(path.join(root,'server'),source).split(path.sep)[0])});
  fs.cpSync(path.join(root,'src'),path.join(temporary,'src'),{recursive:true});
  runtime=require(path.join(temporary,'server/runtime.cjs'))();
  for(const file of ['auth','ops','attachments'])require(path.join(temporary,'server/routes/'+file+'.cjs'))(runtime);
  server=await new Promise(resolve=>{const listener=runtime.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const create=(username,role)=>{runtime.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(username,username,role,'active','unused',runtime.nowISO(),runtime.nowISO());return runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(username);};
  const admin=create('example-admin','admin'),teacher=create('example-teacher','teacher'),finance=create('example-finance','finance'),student=create('example-student','student');
  runtime.studentProfiles.save({headers:{},ip:'test'},student,{responsible_teacher_username:teacher.username,guiding_teacher_username:teacher.username,graduation_year:2028});
  const tokens=new Map([admin,teacher,finance,student].map(a=>[a.username,runtime.signToken(a)]));
  const call=async(action,payload={},who=finance)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.get(who.username)},body:JSON.stringify(payload)});return {status:response.status,json:await response.json()};};
  const all=await call('ops/listAll');assert.equal(all.status,200);assert.equal(all.json.data.current_account.account_type,'finance');assert.equal(all.json.data.current_account.default_view_scope,'all');assert.equal(all.json.data.lab_student_accounts.length,1);assert(!all.json.data.accounts);assert(!all.json.data.lab_accounts.some(row=>row.username===finance.username));
  for(const action of ['reviewWorkRequest','reviewPurchaseRequest','reviewStockOutRequest','submitWorkRequest','submitPurchaseRequest','createStockTransaction','addMaterial','addMaterialBatch','updateMaterialBatch','updateMaterialBatchInformation','adminSetAccountStatus','adminSetAccountRole','adminResetPassword','adminDeleteRecord','hideRecordForMe']){const result=await call('ops/'+action);assert.equal(result.status,400,action);assert.match(result.json.message,/财务账号/);}
  for(const action of ['upload','uploadJson','uploadDraftJson','commitDraft','delete']){const result=await call('attachments/'+action);assert.equal(result.status,403,action);}
  const order=runtime.insertRecord('lab_work_requests',{request_type:'测试',status:'已完成',settlement_status:'已挂账',applicant_username:student.username,cost_test:80,completion_modified:true,completion_original:{cost_test:100}});
  const mark={collection:'lab_work_requests',id:order._id,expected_updated_at:order.updated_at,reimbursed:true};
  const marked=await call('ops/setReimbursementStatus',mark);assert.equal(marked.status,200);assert.equal(marked.json.record.reimbursed,true);assert.equal(marked.json.record.cost_test,80);assert.equal(marked.json.record.completion_original.cost_test,100);
  for(const who of [admin,teacher,student]){const result=await call('ops/setReimbursementStatus',{...mark,expected_updated_at:marked.json.record.updated_at,reimbursed:false},who);assert.equal(result.status,400);assert.match(result.json.message,/只有财务/);}
  const otherView=await call('ops/listAll',{},teacher);assert.equal(otherView.json.data.lab_work_requests[0].reimbursed,true);
  const teacherBefore=runtime.publicAccountForAdmin(teacher),rolePayload={id:teacher.id,account_type:'finance',expected_updated_at:teacherBefore.updated_at};
  assert.equal((await call('ops/adminSetAccountRole',rolePayload,admin)).status,400,'active mentor cannot become finance');
  const candidate=create('example-candidate','teacher');tokens.set(candidate.username,runtime.signToken(candidate));
  const pending=runtime.insertRecord('lab_purchase_requests',{status:'待教师审核',review_teacher_username:candidate.username});
  const payload={id:candidate.id,account_type:'finance',expected_updated_at:candidate.updated_at};
  assert.equal((await call('ops/adminSetAccountRole',payload,admin)).status,400,'pending reviewer cannot become finance');
  runtime.updateRecord('lab_purchase_requests',pending._id,{status:'已撤回'});
  assert.equal((await call('ops/adminSetAccountRole',payload,teacher)).status,400,'only admins manage role');
  assert.equal((await call('ops/adminSetAccountRole',payload,admin)).status,200);
  assert.equal((await call('ops/listAll',{},candidate)).status,401,'old teacher token is revoked');
  const after=runtime.db.prepare('SELECT * FROM accounts WHERE id=?').get(candidate.id);assert.equal(after.account_type,'finance');assert.equal(after.session_version,candidate.session_version+1);
  tokens.set(candidate.username,runtime.signToken(after));assert.equal((await call('ops/listAll',{},candidate)).status,200);
  const reversed=await call('ops/adminSetAccountRole',{id:after.id,account_type:'teacher',expected_updated_at:after.updated_at},admin);assert.equal(reversed.status,200);assert.equal((await call('ops/listAll',{},candidate)).status,401);
  assert.deepEqual(runtime.db.pragma('foreign_key_check'),[]);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));runtime?.db.close();
  fs.rmSync(temporary,{recursive:true,force:true});
 }
});
