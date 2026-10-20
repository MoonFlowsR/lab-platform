const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const modify = require('../../server/features/inventory/batch-information.cjs');

function fixture() {
  const db = new Database(':memory:');
  require('../../server/db/schema.cjs')(db);
  const nowISO = () => '2026-10-19T01:00:00.000Z';
  db.prepare('INSERT INTO id_counters VALUES(1,0,?)').run(nowISO());
  const c = { db, nowISO, ...require('../../server/db/records.cjs')({ db, nowISO, dateStampCN: () => '20261019', padSerial: n => String(n).padStart(6,'0') }),
    req: {headers:{},ip:'test'}, account: {username:'示例学生',display_name:'示例学生',account_type:'student'},
    requiredPurchaseExpiryDate: value => value,
    storageDetails: p => ({storage_room:p.storage_room,storage_detail:p.storage_detail,storage_location:p.storage_room+' · '+p.storage_detail}),
  };
  const material = c.insertRecord('lab_materials',{name_cn:'示例材料',name:'示例材料'});
  const purchase = c.insertRecord('lab_purchase_requests',{public_id:'PUR-20261018-000001',preferred_supplier:'原渠道',material_name:'示例材料',status:'已完成',received_status:'已入库',quantity:4,estimated_price:100,reviewed_by:'示例教师',reviewed_at:'2026-10-18T01:00:00Z'});
  const other = c.insertRecord('lab_purchase_requests',{...purchase,_id:undefined,id:undefined,public_id:'PUR-261018-000002'});
  const batch = c.insertRecord('lab_material_batches',{material_id:material._id,material_name:'示例材料',supplier:'原渠道',batch_code:'BATCH-261019-000003',purchase_category:'耗材',spec:'无',unit:'盒',current_qty:4,min_qty:0,purchase_purpose:'公用',storage_room:'A101',storage_detail:'示例柜',expiry_date:'长期',related_purchase_record_id:purchase._id,related_purchase_id:'PUR-261018-000001'});
  c.updateRecord('lab_purchase_requests',purchase._id,{inbound_batch_id:batch._id});
  const snapshot=()=>JSON.stringify({records:db.prepare('SELECT * FROM records ORDER BY id').all(),audit:db.prepare('SELECT * FROM audit_logs').all(),counters:db.prepare('SELECT * FROM id_counters').all()});
  const change=(supplier='新渠道',override={})=>{const row=c.getRecord('lab_material_batches',batch._id);return modify({...c,payload:{...row,id:row._id,expected_updated_at:row.updated_at,supplier,reason:'核对采购凭证',...override}});};
  return {c,db,purchase,batch,other,change,snapshot};
}

test('inventory channel edit synchronizes only the explicitly linked purchase with before/after history and audit',()=>{
 const f=fixture();try{
  const before=f.c.getRecord('lab_purchase_requests',f.purchase._id),result=f.change();
  const after=f.c.getRecord('lab_purchase_requests',f.purchase._id);
  assert.equal(after.preferred_supplier,'新渠道');assert.equal(result.record.supplier,'新渠道');
  for(const key of ['quantity','estimated_price','reviewed_by','reviewed_at','status','received_status','created_at'])assert.equal(after[key],before[key]);
  assert.deepEqual(f.c.getRecord('lab_purchase_requests',f.other._id),f.other);
  assert.equal(result.record.current_qty,4);assert.equal(result.transaction.quantity,0);
  assert.equal(result.transaction.supplier_before,'原渠道');assert.equal(result.transaction.supplier_after,'新渠道');
  assert.deepEqual(after.supplier_change_history,result.record.supplier_change_history);
  const [event]=after.supplier_change_history;assert.equal(event.before,'原渠道');assert.equal(event.after,'新渠道');assert.equal(event.operator_name,'示例学生');assert.equal(event.reason,'核对采购凭证');
  const audit=f.db.prepare("SELECT * FROM audit_logs WHERE action='syncPurchaseSupplier'").get();assert.equal(JSON.parse(audit.before_json).preferred_supplier,'原渠道');assert.equal(JSON.parse(audit.after_json).preferred_supplier,'新渠道');
  const second=f.change('');assert.equal(f.c.getRecord('lab_purchase_requests',after._id).preferred_supplier,'');assert.equal(second.record.supplier_change_history.length,2);
 }finally{f.db.close();}
});

test('unchanged channel does not touch purchase or create channel history; stale edits cannot overwrite it',()=>{
 const f=fixture();try{
  const before=f.c.getRecord('lab_purchase_requests',f.purchase._id);const result=f.change('原渠道');
  assert.deepEqual(f.c.getRecord('lab_purchase_requests',f.purchase._id),before);assert.equal(result.record.supplier_change_history,undefined);
  const snapshot=f.snapshot();assert.throws(()=>f.change('新渠道',{expected_updated_at:f.batch.updated_at}),/已被更新/);assert.equal(f.snapshot(),snapshot);
 }finally{f.db.close();}
});

for(const mode of ['public-only','reverse-only','deleted','standalone','inconsistent'])test('supplier relationship: '+mode,()=>{
 const f=fixture();try{
  if(mode==='public-only')f.c.updateRecord('lab_material_batches',f.batch._id,{related_purchase_record_id:''});
  if(mode==='reverse-only'){f.c.updateRecord('lab_material_batches',f.batch._id,{related_purchase_record_id:'',related_purchase_id:''});}
  if(mode==='deleted')f.db.prepare('DELETE FROM records WHERE id=?').run(f.purchase._id);
  if(mode==='standalone'){f.c.updateRecord('lab_material_batches',f.batch._id,{related_purchase_record_id:'',related_purchase_id:''});f.c.updateRecord('lab_purchase_requests',f.purchase._id,{inbound_batch_id:''});}
  if(mode==='inconsistent')f.c.updateRecord('lab_material_batches',f.batch._id,{related_purchase_record_id:f.other._id});
  const before=f.snapshot();
  if(mode==='inconsistent'){assert.throws(()=>f.change(),/关联的采购申请不一致/);assert.equal(f.snapshot(),before);return;}
  const result=f.change();assert.equal(result.record.supplier_change_history.length,1);
  assert.equal(f.c.getRecord('lab_purchase_requests',f.purchase._id)?.preferred_supplier,mode==='deleted'?undefined:mode==='standalone'?'原渠道':'新渠道');
  assert.deepEqual(f.c.getRecord('lab_purchase_requests',f.other._id),f.other);
 }finally{f.db.close();}
});

for(const boundary of ['purchase-audit','batch-write','stock-write','final-audit'])test('channel synchronization rolls everything back on '+boundary,()=>{
 const f=fixture();try{
  const before=f.snapshot();
  const fail=()=>{throw Error('injected failure');};
  if(boundary==='purchase-audit'||boundary==='final-audit'){const original=f.c.addAudit;f.c.addAudit=(...args)=>{if(args[2]===(boundary==='purchase-audit'?'syncPurchaseSupplier':'updateMaterialBatchInformation'))fail();return original(...args);};}
  if(boundary==='batch-write'){const original=f.c.updateRecord;f.c.updateRecord=(...args)=>{if(args[0]==='lab_material_batches')fail();return original(...args);};}
  if(boundary==='stock-write'){const original=f.c.insertRecord;f.c.insertRecord=(...args)=>{if(args[0]==='lab_stock_transactions')fail();return original(...args);};}
  assert.throws(()=>f.change(),/injected failure/);assert.equal(f.snapshot(),before);
 }finally{f.db.close();}
});

test('purchase and batch Excel export every channel change, including blank values and backfilled evidence',async()=>{
 const {buildExportTable}=await import('../../src/shared/lib/export-columns.js');
 const row={supplier_change_history:[{before:'原渠道',after:'新渠道',created_at:'2026-10-19T01:00:00Z',operator_name:'示例学生',reason:'第一次核对'},{before:'新渠道',after:'',created_at:'2026-10-19T02:00:00Z',operator_name:'示例管理员',reason:'第二次核对',synced_at:'2026-10-19T03:00:00Z'}]};
 for(const kind of ['purchases','batches']){const table=JSON.stringify(buildExportTable(kind,[row]));for(const value of ['采购渠道修改记录','原渠道','新渠道','未填写','示例学生','示例管理员','第一次核对','第二次核对','补同步于'])assert(table.includes(value),kind+': '+value);}
});
