const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createBatchEditPolicy,PURCHASE_EDIT_WINDOW_MS}=require('../../src/features/inventory/batch-edit-policy.js');
const student={username:'example-student',account_type:'student'};
const completedAt=Date.parse('2026-10-25T08:00:00Z');
const purchase={_id:'1',public_id:'PUR-261025-000001',inbound_batch_id:'2',applicant_username:student.username,status:'已完成',received_status:'已入库',completed_at:new Date(completedAt).toISOString()};
const batch={_id:'2',related_purchase_record_id:'1',related_purchase_id:purchase.public_id};

test('purchaser editing window starts at completion, excludes exactly 48 hours, and ignores subsequent updates',()=>{
 const policy=createBatchEditPolicy([{...purchase,updated_at:'2099-01-01T00:00:00Z'}]);
 for(const [offset,allowed] of [[-1,false],[0,true],[PURCHASE_EDIT_WINDOW_MS-1,true],[PURCHASE_EDIT_WINDOW_MS,false],[PURCHASE_EDIT_WINDOW_MS+1,false]])assert.equal(policy.canEdit(student,{...batch,updated_at:'2099-01-01T00:00:00Z'},completedAt+offset),allowed);
 assert.equal(policy.canEdit({...student,username:'other'},batch,completedAt),false);
 assert.equal(policy.canEdit(student,{...batch,purchaser_username:'other',approval_delegate_username:'other'},completedAt),true,'original applicant owns correction window');
 for(const account_type of ['teacher','finance'])assert.equal(policy.canEdit({...student,account_type},batch,completedAt),false);
 assert.equal(policy.canEdit({account_type:'admin'},{_id:'manual'},completedAt+PURCHASE_EDIT_WINDOW_MS),true);
});

for(const [name,changes] of Object.entries({missingTime:{completed_at:undefined},invalidTime:{completed_at:'invalid'},dateOnly:{completed_at:'2026-10-25'},missingZone:{completed_at:'2026-10-25T08:00:00'},pending:{status:'待入库'},notReceived:{received_status:'待入库'},unlinked:{inbound_batch_id:''},otherBatch:{inbound_batch_id:'3'},missingOwner:{applicant_username:''}}))test('student correction denies '+name,()=>assert.equal(createBatchEditPolicy([{...purchase,...changes}]).canEdit(student,batch,completedAt),false));
test('missing, conflicting and ambiguous purchase links fail closed; explicit reverse links and old public numbers work',()=>{
 assert.equal(createBatchEditPolicy([]).canEdit(student,batch,completedAt),false);
 const policy=createBatchEditPolicy([purchase]);
 assert.equal(policy.canEdit(student,{_id:'manual',created_by_username:student.username,purchaser_username:student.username,created_at:purchase.completed_at},completedAt),false);
 for(const wrong of [{related_purchase_record_id:'other'},{related_purchase_id:'PUR-other'}])assert.equal(policy.canEdit(student,{...batch,...wrong},completedAt),false);
 assert.equal(policy.canEdit(student,{_id:'2'},completedAt),true);
 assert.equal(policy.canEdit(student,{...batch,related_purchase_id:'PUR-20261025-000001'},completedAt),true);
 assert.equal(createBatchEditPolicy([purchase,{...purchase,_id:'3'}]).canEdit(student,batch,completedAt),false);
 assert.equal(createBatchEditPolicy([{...purchase,completed_at:'2026-10-25T16:00:00+08:00'}]).deadline(student,batch),completedAt+PURCHASE_EDIT_WINDOW_MS);
});

test('HTTP correction enforces owner and expiry, retains admin/teacher permissions, and protects receipt evidence',async()=>{
 const root=path.resolve(__dirname,'../..'),temporary=fs.mkdtempSync(path.join(root,'.tmp-inventory-edit-'));
 let runtime,server,now=completedAt;
 try{
  fs.cpSync(path.join(root,'server'),path.join(temporary,'server'),{recursive:true,filter:source=>!['data','uploads','logs','backups'].includes(path.relative(path.join(root,'server'),source).split(path.sep)[0])});
  fs.cpSync(path.join(root,'src'),path.join(temporary,'src'),{recursive:true});
  runtime=require(path.join(temporary,'server/runtime.cjs'))();runtime.nowISO=()=>new Date(now).toISOString();
  for(const file of ['ops','attachments'])require(path.join(temporary,'server/routes/'+file+'.cjs'))(runtime);
  server=await new Promise(resolve=>{const listener=runtime.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const create=(username,role)=>{runtime.db.prepare('INSERT INTO accounts(username,display_name,account_type,status,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(username,username,role,'active','unused',runtime.nowISO(),runtime.nowISO());return runtime.db.prepare('SELECT * FROM accounts WHERE username=?').get(username);};
  const admin=create('example-admin','admin'),teacher=create('example-teacher','teacher'),finance=create('example-finance','finance'),owner=create(student.username,'student'),other=create('example-other','student');
  for(const account of [owner,other])runtime.studentProfiles.save({headers:{},ip:'test'},account,{responsible_teacher_username:teacher.username,guiding_teacher_username:teacher.username,graduation_year:2028});
  const tokens=new Map([admin,teacher,finance,owner,other].map(a=>[a.username,runtime.signToken(a)]));
  const call=async(action,payload,who=owner)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.get(who.username)},body:JSON.stringify(payload)});return {status:response.status,json:await response.json()};};
  const material=runtime.insertRecord('lab_materials',{name:'示例材料',name_cn:'示例材料'});
  const order=runtime.insertRecord('lab_purchase_requests',{...purchase,_id:undefined,inbound_batch_id:undefined,preferred_supplier:'示例渠道'});
  const photo=runtime.insertRecord('lab_attachments',{target_collection:'lab_purchase_requests',target_id:order._id,uploaded_by_username:owner.username,attachment_state:'bound'});
  const record=runtime.insertRecord('lab_material_batches',{material_id:material._id,material_name:'示例材料',purchase_category:'耗材',spec:'无',unit:'瓶',current_qty:3,min_qty:0,purchase_purpose:'公用',storage_room:'A101',storage_detail:'示例柜',expiry_date:'长期',supplier:'示例渠道',related_purchase_record_id:order._id,related_purchase_id:order.public_id,inbound_photo_attachment_id:photo._id,purchaser_username:owner.username});
  runtime.updateRecord('lab_purchase_requests',order._id,{inbound_batch_id:record._id});
  const manual=runtime.insertRecord('lab_material_batches',{...record,_id:undefined,related_purchase_record_id:'',related_purchase_id:'',created_by_username:owner.username});
  const snapshot=()=>JSON.stringify({records:runtime.db.prepare('SELECT * FROM records ORDER BY id').all(),audit:runtime.db.prepare('SELECT * FROM audit_logs').all()});
  const payload=(id=record._id,extra={})=>{const row=runtime.getRecord('lab_material_batches',id);return {...row,id,expected_updated_at:row.updated_at,reason:'核对实物',remark:'已核对',...extra};};
  for(const [who,id] of [[other,record._id],[owner,manual._id],[teacher,record._id],[finance,record._id]]){const before=snapshot();assert.equal((await call('ops/updateMaterialBatchInformation',payload(id),who)).status,400);assert.equal(snapshot(),before);}
  const spoof={completed_at:'2099-01-01T00:00:00Z',purchaser_username:other.username,related_purchase_record_id:'fake'};
  assert.equal((await call('ops/updateMaterialBatchInformation',payload(record._id,spoof))).status,200);
  const edited=runtime.getRecord('lab_material_batches',record._id);assert.equal(edited.purchaser_username,owner.username);assert.equal(edited.related_purchase_record_id,order._id);
  assert.equal(runtime.getRecord('lab_purchase_requests',order._id).completed_at,purchase.completed_at);
  const beforeDelete=snapshot();assert.equal((await call('attachments/delete',{id:photo._id})).status,400);assert.equal(snapshot(),beforeDelete);
  now=completedAt+PURCHASE_EDIT_WINDOW_MS;
  const expired=snapshot();assert.equal((await call('ops/updateMaterialBatchInformation',payload(record._id,spoof))).status,400);assert.equal(snapshot(),expired);
  assert.equal((await call('ops/updateMaterialBatch',payload())).status,400,'student cannot bypass via quantity-only endpoint');
  assert.equal((await call('ops/updateMaterialBatch',payload(),teacher)).status,200,'teacher quantity correction stays available');
  assert.equal((await call('ops/updateMaterialBatchInformation',payload(manual._id),admin)).status,200,'admin edits manually initialized stock');
  assert.equal((await call('ops/updateMaterialBatchInformation',payload(),admin)).status,200,'admin edits after 48 hours');
  assert.deepEqual(runtime.db.pragma('foreign_key_check'),[]);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));runtime?.db.close();
  assert(temporary.startsWith(root+path.sep+'.tmp-inventory-edit-'));fs.rmSync(temporary,{recursive:true,force:true});
 }
});
