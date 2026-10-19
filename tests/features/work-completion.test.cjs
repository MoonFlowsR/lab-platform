const {test}=require('node:test'),assert=require('node:assert/strict');
const complete=require('../../server/features/work/work-completion.cjs');
const account={account_type:'student',username:'example-student',display_name:'示例学生'};
function fixture(type='测试'){
 const key=({测试:'cost_test',加工:'cost_processing',维修:'cost_repair'})[type];
 const before={request_type:type,status:'已通过',applicant_username:account.username,workload_quantity:2,workload_unit:'小时',[key]:100,updated_at:'version-1'};
 const payload={confirmed:true,expected_updated_at:before.updated_at,settlement_status:'已开票',patch:{workload_quantity:2,workload_unit:'小时',[key]:100}};
 return {before,payload,key};
}
test('testing and processing require an explicit valid settlement choice without changing modification semantics',()=>{
 for(const type of ['测试','加工','维修'])for(const status of ['已开票','已挂账']){
  const {before,payload}=fixture(type);payload.settlement_status=status;
  const result=complete(before,payload,account,[],'2026-10-19T00:00:00Z');
  assert.equal(result.settlement_status,status);assert.equal(result.status,'已完成');assert.equal(result.completion_modified,false);assert.deepEqual(result.completion_changes,[]);
  for(const invalid of [undefined,'','未开票','已完成',{},['已开票']])assert.throws(()=>complete(before,{...payload,settlement_status:invalid},account,[],''),/订单状态/);
 }
});
test('final amount edits retain approval values and exact changed fields',()=>{
 for(const type of ['测试','加工','维修']){
  const {before,payload,key}=fixture(type),original=JSON.stringify(before);payload.patch[key]=125;payload.patch.workload_quantity=2.5;
  const result=complete(before,payload,account,[],'now');assert.equal(result[key],125);assert.equal(result.completion_original[key],100);assert.equal(result.completion_modified,true);
  assert.deepEqual(result.completion_changes.map(change=>change.field),['workload_quantity',key]);assert.equal(JSON.stringify(before),original);
 }
});
test('completion retains owner, role, workflow and concurrency protections',()=>{
 const {before,payload}=fixture();
 assert.throws(()=>complete(before,payload,{...account,username:'another'},[],''),/申请人/);
 assert.throws(()=>complete(before,payload,{...account,account_type:'teacher'},[],''),/学生/);
 assert.throws(()=>complete({...before,status:'已完成'},payload,account,[],''),/尚未完成/);
 assert.throws(()=>complete(before,{...payload,expected_updated_at:'old'},account,[],''),/已更新/);
 assert.throws(()=>complete(before,{...payload,confirmed:false},account,[],''),/确认完成/);
});
test('CSV includes settlement state and distinguishes old missing data from open orders',async()=>{
 const {buildCsv}=await import('../../src/shared/lib/csv-export.js');
 const rows=[{...fixture().before,status:'已完成',settlement_status:'已挂账'},{...fixture().before,status:'已完成'},{...fixture().before}];
 const result=buildCsv('test',rows);assert(result.headers.includes('订单状态'));assert(result.csv.includes('已挂账'));assert(result.csv.includes('未登记'));
 assert(!buildCsv('test',[rows[2]]).headers.includes('订单状态'));
});
