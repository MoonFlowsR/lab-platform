const {test,before}=require('node:test'),assert=require('node:assert/strict');
let splitRequestSections,splitReviewedWorkSections;
before(async()=>({splitRequestSections,splitReviewedWorkSections}=await import('../../src/shared/lib/request-sections.js')));
const row=(id,status,extra={})=>({_id:id,status,request_type:'测试',...extra});
const ids=rows=>rows.map(item=>item._id);
test('all roles use four exclusive stages, preserving rejection, withdrawal and closure',()=>{
 const rows=[row(1,'待教师审核'),row(2,'已通过'),row(3,'已驳回'),row(4,'需修改'),row(5,'已撤回'),row(6,'已关闭'),row(7,'已完成'),row(8,'已归档'),row(9,'已完成',{completion_modified:true}),row(10,'已实施')];
 for(const manager of [true,false]){
  const sections=splitReviewedWorkSections(rows,{manager});
  assert.deepEqual(Object.fromEntries(Object.entries(sections).map(([key,list])=>[key,ids(list)])),{pending:[1,5],reviewed:[2,3,4,10],completed:[6,7,8],modified:[9]});
 }
});
test('modification section requires an actually completed order and a boolean marker',()=>{
 const rows=[row(1,'已通过',{completion_modified:true}),row(2,'待教师审核',{completion_modified:true}),row(3,'已关闭',{completion_modified:true}),row(4,'已完成',{completion_modified:'true'}),row(5,'已完成',{completion_modified:1}),row(6,'已完成',{completion_modified:true})];
 const sections=splitReviewedWorkSections(rows);
 assert.deepEqual(ids(sections.modified),[6]);assert.deepEqual(ids(sections.reviewed),[1]);assert.deepEqual(ids(sections.completed),[3,4,5]);assert.deepEqual(ids(sections.pending),[2]);
});
test('partition preserves scope, object identity, order and unknown legacy statuses without duplicates',()=>{
 const rows=Object.freeze([row(1,'未知历史状态'),row(2,'已完成',{request_type:'加工',completion_modified:true}),row(3,'已通过',{request_type:'加工'}),row(4,'已完成'),row(5,'已关闭')].map(Object.freeze));
 const original=JSON.stringify(rows),sections=splitReviewedWorkSections(rows),all=Object.values(sections).flat();
 assert.equal(all.length,rows.length);assert.equal(new Set(all).size,rows.length);
 for(const item of rows)assert(all.includes(item));
 for(const list of Object.values(sections))assert.deepEqual(list,rows.filter(item=>list.includes(item)));
 assert.equal(JSON.stringify(rows),original);assert.deepEqual(ids(sections.pending),[1]);
});
test('purchase categories retain their existing rules',()=>{
 const rows=[row(1,'待教师审核'),row(2,'待入库'),row(3,'已驳回'),row(4,'已完成'),row(5,'已关闭'),row(6,'待入库',{received_status:'已入库'})];
 assert.deepEqual(ids(splitRequestSections(rows,{purchase:true}).ongoing),[1,2,3]);
 assert.deepEqual(ids(splitRequestSections(rows,{purchase:true,manager:true}).ongoing),[1]);
});
test('empty input has four empty categories',()=>assert.deepEqual(splitReviewedWorkSections(),{pending:[],reviewed:[],completed:[],modified:[]}));
