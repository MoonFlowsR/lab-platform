const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Database=require('better-sqlite3');

function fixture(clock='2026-10-18T00:00:00.000Z') {
  const root=path.resolve(__dirname,'../..'),temporary=fs.mkdtempSync(path.join(root,'.tmp-refinement-'));
  fs.cpSync(path.join(root,'server'),path.join(temporary,'server'),{recursive:true,filter:source=>!['data','uploads','logs','backups'].includes(path.relative(path.join(root,'server'),source).split(path.sep)[0])});
  fs.cpSync(path.join(root,'src'),path.join(temporary,'src'),{recursive:true});
  const context=require(path.join(temporary,'server/runtime.cjs'))({clock:()=>clock});
  const accounts={};
  for(const [name,role]of [['示例管理员','admin'],['示例教师','teacher'],['示例学生甲','student'],['示例学生乙','student']]){
    context.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(name,name,role,'active','unused',clock,clock);
    accounts[name]=context.db.prepare('SELECT * FROM accounts WHERE username=?').get(name);
  }
  for(const name of ['示例学生甲','示例学生乙'])context.studentProfiles.save({headers:{}},accounts[name],{responsible_teacher_username:'示例教师',guiding_teacher_username:'示例教师',graduation_year:2035});
  return {context,accounts,close(){context.db.close();fs.rmSync(temporary,{recursive:true,force:true});}};
}
const response=db=>({json(value){assert.equal(db.inTransaction,false);return value;}});
const request={headers:{},ip:'test'};

test('batch identity corrections update inbound rows atomically while preserving historical quantities, times and evidence',()=>{
 const f=fixture();try{
  const c=f.context,material=c.insertRecord('lab_materials',{name_cn:'示例旧名称'});
  const batch=c.insertRecord('lab_material_batches',{material_id:material._id,material_name:'示例旧名称',batch_code:'BATCH-example',spec:'旧规格',unit:'g',current_qty:5,min_qty:0});
  const row=c.insertRecord('lab_stock_transactions',{transaction_type:'入库',batch_id:batch._id,material_id:material._id,material_name:'示例旧名称',quantity:8,unit:'g',stock_before:0,stock_after:8,photo_attachment_id:'original-photo',created_at:'2026-01-01T00:00:00Z'});
  const out=c.insertRecord('lab_stock_transactions',{transaction_type:'出库',batch_id:batch._id,material_name:'示例旧名称',quantity:3});
  const payload={id:batch._id,expected_updated_at:batch.updated_at,material_name:'示例新名称',purchase_category:'耗材',spec:'新规格',unit:'g',current_qty:5,min_qty:0,purchase_purpose:'公用',storage_room:'A101',storage_detail:'示例柜',expiry_date:'长期',reason:'名称修正'};
  const modify=require('../../server/features/inventory/batch-information.cjs');
  assert.throws(()=>modify({...c,req:request,account:f.accounts['示例管理员'],payload,addAudit(){throw Error('injected')}}),/injected/);
  assert.deepEqual(c.getRecord('lab_stock_transactions',row._id),row);
  assert.deepEqual(c.getRecord('lab_material_batches',batch._id),batch);
  const result=modify({...c,req:request,account:f.accounts['示例管理员'],payload});
  const corrected=c.getRecord('lab_stock_transactions',row._id);
  assert.equal(corrected.material_name,result.record.material_name);assert.equal(corrected.spec,'新规格');assert.equal(corrected.material_id,result.record.material_id);
  for(const key of ['quantity','unit','stock_before','stock_after','photo_attachment_id','created_at'])assert.equal(corrected[key],row[key]);
  assert.deepEqual(c.getRecord('lab_stock_transactions',out._id),out);
 }finally{f.close();}
});

test('incremental synchronization preserves additions, edits, deletion, order and unrelated row identity',async()=>{
 const {difference}=require('../../server/services/sync-response.cjs'),{applyDelta}=await import('../../src/shared/api/sync-controller.js');
 const before={items:[{_id:'1',v:1},{_id:'2',v:2}],other:[{id:'x',v:3}],meta:'old',removedField:true};
 const after={items:[{_id:'3',v:4},{_id:'2',v:5}],other:before.other,meta:'new'};
 const patch=difference(before,after),actual=applyDelta(before,patch);assert.deepEqual(actual,after);assert.equal(actual.other,before.other);assert.deepEqual(before.items,[{_id:'1',v:1},{_id:'2',v:2}]);
});
test('snapshot protocol scopes revisions to accounts and falls back safely after a lost baseline',async()=>{
 const f=fixture();try{
  let data;const res={set(){},end(body){data=JSON.parse(String(body));}};const req={get:()=>''};
  const admin=f.accounts['示例管理员'];await f.context.syncResponse(req,res,admin,{delta:true});assert(!data.data.audit_logs);const revision=data.revision;
  const row=f.context.insertRecord('lab_materials',{name_cn:'示例材料'});await f.context.syncResponse(req,res,admin,{delta:true,known_revision:revision});assert(data.delta);assert(data.delta.collections.lab_materials.upsert.some(item=>item._id===row._id));
  await f.context.syncResponse(req,res,f.accounts['示例学生甲'],{delta:true,known_revision:data.revision});assert(data.data);assert(!data.data.accounts);assert(!data.data.audit_logs);
  await f.context.syncResponse(req,res,admin,{delta:true,known_revision:'expired'});assert(data.data);
 }finally{f.close();}
});
test('online backup includes committed WAL changes while an older reader is active',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-backup-test-')),filename=path.join(dir,'live.db');const writer=new Database(filename);writer.pragma('journal_mode=WAL');writer.exec('CREATE TABLE items(value); INSERT INTO items VALUES(1)');const reader=new Database(filename,{readonly:true});reader.exec('BEGIN');reader.prepare('SELECT * FROM items').all();writer.exec('INSERT INTO items VALUES(2)');
 try{const backup=require('../../server/services/database-backup.cjs')({db:writer,backupDir:path.join(dir,'copies')});const p=backup();assert.equal(backup(),p);const saved=await p,copy=new Database(saved,{readonly:true});try{assert.equal(copy.prepare('SELECT COUNT(*) n FROM items').get().n,2);assert.equal(copy.pragma('integrity_check',{simple:true}),'ok');}finally{copy.close();}}finally{reader.exec('ROLLBACK');reader.close();writer.close();fs.rmSync(dir,{recursive:true,force:true});}
});
for(const [kind,action,collection]of [['work','reviewWorkRequest','lab_work_requests'],['purchase','reviewPurchaseRequest','lab_purchase_requests']])test(kind+' approval failure rolls back status and review evidence',()=>{
 const f=fixture();try{const c=f.context,row=c.insertRecord(collection,{status:'待教师审核',review_teacher_username:'示例教师',applicant_username:'示例学生甲'}),before=c.getRecord(collection,row._id);const service=require('../../server/services/operations/'+kind+'.cjs')({...c,addAudit(){throw Error('injected audit failure')}});assert.throws(()=>service[action](request,response(c.db),action,{id:row._id,next_status:'已通过'},f.accounts['示例教师']),/injected/);assert.deepEqual(c.getRecord(collection,row._id),before);assert.equal(c.listRecords('lab_review_logs').length,0);}finally{f.close();}
});
test('admin can correct a disabled student and explicitly reactivate; old sessions remain revoked',()=>{
 const f=fixture('2030-01-01T00:00:00.000Z');try{const c=f.context,target=f.accounts['示例学生甲'],admin=f.accounts['示例管理员'];c.db.prepare('UPDATE student_profiles SET graduation_year=2028 WHERE account_id=?').run(target.id);c.graduationExpiry.sweep();const version=c.accountSessions.version(c.db.prepare('SELECT * FROM accounts WHERE id=?').get(target.id));const ops=require('../../server/services/operations/admin.cjs')(c);ops.adminUpdateStudentProfile(request,response(c.db),'adminUpdateStudentProfile',{id:target.id,responsible_teacher_username:'示例教师',guiding_teacher_username:'示例教师',graduation_year:2035},admin);assert.equal(c.db.prepare('SELECT status FROM accounts WHERE id=?').get(target.id).status,'disabled');ops.adminSetAccountStatus(request,response(c.db),'adminSetAccountStatus',{id:target.id,status:'active'},admin);assert(c.accountSessions.version(c.db.prepare('SELECT * FROM accounts WHERE id=?').get(target.id))>version);assert.throws(()=>ops.adminUpdateStudentProfile(request,response(c.db),'adminUpdateStudentProfile',{id:target.id},target));}finally{f.close();}
});
test('approval handover preserves purchaser history and resets pending approvals atomically',()=>{
 const f=fixture();try{const c=f.context,owner=f.accounts['示例学生甲'],next=f.accounts['示例学生乙'],admin=f.accounts['示例管理员'];const batch=c.insertRecord('lab_material_batches',{material_id:'m',material_name:'示例材料',spec:'无',unit:'g',purchase_purpose:'私用/项目用（出库需采购人审批）',purchaser_username:owner.username,purchaser_name:owner.display_name,current_qty:5});const pending=c.insertRecord('lab_stock_out_requests',{batch_id:batch._id,status:'已同意待出库',purchaser_username:owner.username,approved_username:owner.username});const handler=require('../../server/features/stock/approval-handover.cjs')(c);const preview=handler(request,response(c.db),{id:owner.id,preview:true},admin);const result=handler(request,response(c.db),{id:owner.id,username:next.username,revision:preview.revision},admin);assert.equal(result.batches,1);const after=c.getRecord('lab_material_batches',batch._id);assert.equal(after.purchaser_username,owner.username);assert.equal(after.approval_delegate_username,next.username);assert.equal(after.current_qty,5);const updated=c.getRecord('lab_stock_out_requests',pending._id);assert.equal(updated.status,'待采购人审批');assert.equal(updated.approved_username,'');assert.equal(updated.purchaser_username,next.username);assert.throws(()=>handler(request,response(c.db),{id:owner.id,preview:true},next));}finally{f.close();}
});
test('audit search uses exact teacher identity, returns compact pages, and exports the full filtered set',async()=>{
 const f=fixture();try{const c=f.context;for(let i=0;i<7;i++)c.addAudit(request,f.accounts['示例教师'],'reviewWorkRequest','lab_work_requests',String(i),null,{applicant_username:'示例学生甲',work_content:'可搜索正文'});c.addAudit(request,f.accounts['示例学生乙'],'changePassword','accounts','other',null,{responsible_teacher_name:'示例教师'});let output;const handler=require('../../server/queries/audit.cjs')(c),res={set(){},end(b){output=JSON.parse(String(b))}};await handler({get:()=>''},res,{teacher:'示例教师',limit:3,query:'可搜索正文'},f.accounts['示例管理员']);assert.equal(output.total,7);assert.equal(output.rows.length,3);assert(!('after_json'in output.rows[0]));await handler({get:()=>''},res,{teacher:'示例教师',all:true},f.accounts['示例管理员']);assert.equal(output.rows.length,7);await assert.rejects(handler({get:()=>''},res,{},f.accounts['示例学生甲']));}finally{f.close();}
});


test('repair lifecycle uses designated review, required order status, final fees and durable history',async()=>{
 const f=fixture();try{
  const c=f.context,ops=require('../../server/services/operations/work.cjs')(c),student=f.accounts['示例学生甲'],teacher=f.accounts['示例教师'],admin=f.accounts['示例管理员'];
  const call=(action,payload,account=student)=>ops[action](request,response(c.db),action,payload,account);
  const input={request_type:'维修',work_content:'示例仪器维修',external_unit:'示例维修机构',workload_quantity:1,workload_unit:'次',cost_repair:80,review_teacher_username:teacher.username};
  assert.throws(()=>call('submitWorkRequest',{...input,cost_repair:''}),/预计总维修费/);
  const submitted=call('submitWorkRequest',input).record;assert.match(submitted.public_id,/^REPAIR-/);assert.equal(submitted.cost_repair,80);assert.equal(submitted.cost_test,0);assert.equal(submitted.cost_processing,0);
  assert.throws(()=>call('reviewWorkRequest',{id:submitted._id,next_status:'已通过'},admin),/管理员|指定/);
  assert.throws(()=>call('reviewWorkRequest',{id:submitted._id,next_status:'已驳回'},teacher),/意见/);
  call('reviewWorkRequest',{id:submitted._id,next_status:'已驳回',review_note:'请核实内容'},teacher);
  call('resubmitWorkRequest',{id:submitted._id,patch:{...input,cost_repair:90}});
  const approved=call('reviewWorkRequest',{id:submitted._id,next_status:'已通过'},teacher).record;
  const final={id:approved._id,confirmed:true,expected_updated_at:approved.updated_at,patch:{workload_quantity:2,workload_unit:'次',cost_repair:120}};
  assert.throws(()=>call('completeWorkRequest',final),/订单状态/);assert.equal(c.getRecord('lab_work_requests',approved._id).status,'已通过');
  const complete=call('completeWorkRequest',{...final,settlement_status:'已挂账'}).record;
  assert.equal(complete.cost_repair,120);assert.equal(complete.completion_original.cost_repair,90);assert.equal(complete.completion_modified,true);assert.equal(complete.settlement_status,'已挂账');
  const {businessMetrics}=await import('../../src/features/dashboard/dashboard-metrics.js');assert.equal(businessMetrics([complete]).find(item=>item.type==='维修').completedAmount,120);
  const {buildReportExport}=await import('../../src/features/reports/report-export.js');const exported=buildReportExport({workRequests:[complete]});const csv=exported.files.find(file=>file.filename==='维修明细.csv');assert(csv.csv.includes('已挂账'));assert(csv.csv.includes('120'));
  const {workOptions}=await import('../../src/features/work/work-options.js');assert(workOptions('维修',[complete]).names.includes(input.work_content));assert(workOptions('维修',[complete]).channels.includes(input.external_unit));assert(!workOptions('测试',[complete]).names.includes(input.work_content));
  assert.equal(c.db.pragma('integrity_check',{simple:true}),'ok');
 }finally{f.close();}
});
