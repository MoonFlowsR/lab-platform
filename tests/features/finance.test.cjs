const {test}=require('node:test'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const migrate=require('../../server/migrations/accounts-finance.cjs');
const createFinance=require('../../server/services/operations/finance.cjs');

test('finance migration preserves old account data, extra columns, IDs, sequence, indexes, triggers and profile FKs',()=>{
 const db=new Database(':memory:');try{
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,account_type TEXT CHECK(account_type IN ('student','teacher','admin')),session_version INTEGER DEFAULT 0,private_extra TEXT);
   CREATE TABLE profiles(id INTEGER REFERENCES accounts(id),teacher TEXT REFERENCES accounts(username));
   CREATE INDEX account_extra ON accounts(private_extra); CREATE TABLE notes(value TEXT);
   CREATE TRIGGER account_note AFTER UPDATE ON accounts BEGIN INSERT INTO notes VALUES(new.username); END;
   INSERT INTO accounts VALUES(10,'example','teacher',4,'retain');INSERT INTO profiles VALUES(10,'example');
   INSERT INTO accounts VALUES(99,'removed','student',0,'');DELETE FROM accounts WHERE id=99;`);
  const before=db.prepare('SELECT * FROM accounts').all();
  assert.equal(migrate({db}),true);assert.deepEqual(db.prepare('SELECT * FROM accounts').all(),before);
  assert.equal(db.pragma('foreign_keys',{simple:true}),1);assert.deepEqual(db.pragma('foreign_key_check'),[]);
  db.prepare("UPDATE accounts SET account_type='finance' WHERE id=10").run();
  assert.equal(db.prepare('SELECT value FROM notes').get().value,'example');
  assert(db.prepare("SELECT name FROM sqlite_master WHERE name='account_extra'").get());
  assert.equal(db.prepare("INSERT INTO accounts(username,account_type) VALUES('next','finance')").run().lastInsertRowid,100);
  assert.equal(migrate({db}),false);
 }finally{db.close();}
});

test('a failed finance migration restores the old table, FKs and data atomically',()=>{
 const db=new Database(':memory:');try{
  db.pragma('foreign_keys=ON');db.exec("CREATE TABLE accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,account_type TEXT CHECK(account_type IN ('student','teacher','admin')));INSERT INTO accounts VALUES(1,'teacher');");
  const exec=db.exec.bind(db);db.exec=sql=>{const result=exec(sql);if(sql.startsWith('DROP TABLE accounts;'))throw Error('simulated failure');return result;};
  assert.throws(()=>migrate({db}),/simulated failure/);db.exec=exec;
  assert.equal(db.prepare('SELECT account_type FROM accounts').get().account_type,'teacher');
  assert.equal(db.pragma('foreign_keys',{simple:true}),1);
  assert(!db.prepare("SELECT name FROM sqlite_master WHERE name='accounts_finance_next'").get());
 }finally{db.close();}
});

function fixture(){
 const db=new Database(':memory:');require('../../server/db/schema.cjs')(db);
 let time=0,notifications=0;
 const nowISO=()=>new Date(Date.UTC(2026,9,20,0,0,time++)).toISOString();
 const records=require('../../server/db/records.cjs')({db,nowISO});
 const handlers=createFinance({db,...records,nowISO,recordChanges:{notify:()=>notifications++}});
 const finance={account_type:'finance',username:'example-finance',display_name:'示例财务'};
 const req={headers:{},ip:'synthetic'};
 function mark(row,extra={},account=finance){let response;handlers.setReimbursementStatus(req,{json:value=>{assert.equal(db.inTransaction,false);response=value;}},'setReimbursementStatus',{collection:row.request_type?'lab_work_requests':'lab_purchase_requests',id:row._id,expected_updated_at:row.updated_at,reimbursed:true,...extra},account);return response.record;}
 return {db,records,finance,mark,notifications:()=>notifications};
}

test('only finance can mark/unmark completed settled work and purchases; monetary values and final modification evidence are immutable',async()=>{
 const f=fixture();try{
  const {businessMetrics}=await import('../../src/features/dashboard/dashboard-metrics.js');
  for(const type of ['测试','加工','维修','采购'])for(const settlement of ['已开票','已挂账']){
   const purchase=type==='采购',collection=purchase?'lab_purchase_requests':'lab_work_requests';
   const row=f.records.insertRecord(collection,{status:'已完成',...(purchase?{}:{request_type:type}),settlement_status:settlement,cost_test:10,cost_processing:20,cost_repair:30,estimated_price:200,actual_total_price:0,completion_modified:true,completion_original:{cost_test:300},inbound_modified:true});
   const counts=()=>businessMetrics(purchase?[]:[f.records.getRecord(collection,row._id)],purchase?[f.records.getRecord(collection,row._id)]:[]);
   const beforeCounts=counts();const marked=f.mark(row);assert.equal(marked.reimbursed,true);assert.equal(marked.reimbursed_username,f.finance.username);assert(marked.reimbursed_at);
   assert.deepEqual(counts(),beforeCounts);
   for(const role of ['student','teacher','admin'])assert.throws(()=>f.mark(marked,{reimbursed:false},{account_type:role}),/只有财务/);
   assert.throws(()=>f.mark(row,{reimbursed:false}),/已更新/);
   const unmarked=f.mark(marked,{reimbursed:false});assert.equal(unmarked.reimbursed,false);assert.equal(unmarked.reimbursed_by,'');assert.deepEqual(counts(),beforeCounts);
   const omit=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('reimbursed')&&key!=='updated_at'));
   assert.deepEqual(omit(row),omit(unmarked));
   const audit=f.db.prepare('SELECT * FROM audit_logs WHERE target_id=? ORDER BY id').all(row._id);assert.equal(audit.length,2);assert.equal(JSON.parse(audit[0].before_json).reimbursed,undefined);assert.equal(JSON.parse(audit[1].after_json).reimbursed,false);
  }
 }finally{f.db.close();}
});

test('finance marking rejects open/closed/unsettled/deleted records, invalid payloads; audit failure rolls the update back',()=>{
 const f=fixture();try{
  for(const status of ['待教师审核','已通过','已实施','已驳回','需修改','已关闭','已撤回']){const row=f.records.insertRecord('lab_work_requests',{request_type:'测试',status,settlement_status:'已开票'});assert.throws(()=>f.mark(row),/仅可登记/);}
  for(const settlement_status of ['',null,'未登记']){const row=f.records.insertRecord('lab_purchase_requests',{status:'已完成',settlement_status});assert.throws(()=>f.mark(row),/仅可登记/);}
  const row=f.records.insertRecord('lab_work_requests',{request_type:'测试',status:'已完成',settlement_status:'已开票'});
  assert.throws(()=>f.mark(row,{reimbursed:'true'}),/请选择/);assert.throws(()=>f.mark(row,{expected_updated_at:''}),/已更新/);assert.throws(()=>f.mark(row,{collection:'lab_material_batches'}),/不支持/);
  f.db.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
  assert.throws(()=>f.mark(row),/audit failed/);assert.deepEqual(f.records.getRecord('lab_work_requests',row._id),row);assert.equal(f.notifications(),0);
 }finally{f.db.close();}
});

test('finance defaults to all records without gaining reviewer authorization; reimbursement is searchable and exported for every completed type',async()=>{
 const {defaultViewScope,usesTeamOverview,canReviewAssignedRequest}=await import('../../src/shared/lib/review-scope.js');
 const {buildCsv}=await import('../../src/shared/lib/csv-export.js');const {recordMatchesSearch}=await import('../../src/shared/lib/teacher-filter.js');
 const account={account_type:'finance',username:'example-finance'};assert.equal(defaultViewScope(account),'all');assert.equal(usesTeamOverview(account),true);assert.equal(canReviewAssignedRequest({review_teacher_username:account.username},account),false);
 for(const [kind,type] of [['test','测试'],['processing','加工'],['repair','维修'],['purchases',null]]){
  const row={status:'已完成',...(type?{request_type:type}:{}),settlement_status:'已挂账',estimated_price:100,cost_test:20,cost_processing:30,cost_repair:40};
  assert(buildCsv(kind,[row]).csv.includes('未报销'));assert(recordMatchesSearch(row,'未报销'));
  const marked={...row,reimbursed:true,reimbursed_by:'示例财务',reimbursed_at:'2026-10-20T00:00:00Z'};
  assert(buildCsv(kind,[marked]).csv.includes('已报销'));assert(recordMatchesSearch(marked,'已报销'));assert(!recordMatchesSearch(marked,'未报销'));
 }
});
