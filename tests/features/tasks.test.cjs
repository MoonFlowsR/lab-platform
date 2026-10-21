const test = require('node:test');
const assert = require('node:assert/strict');
const model = import('../../src/features/tasks/task-model.js');
const student = { username: 'example-student', account_type: 'student' };
const teacher = { username: 'example-teacher', account_type: 'teacher', default_view_scope: 'all' };
const row = (id, status, extra = {}) => ({ _id: id, request_type: '测试', applicant_username: student.username, review_teacher_username: teacher.username, status, ...extra });
const group = (center,id) => center.groups.find(item => item.id === id);

test('teacher tasks are limited to assigned, actionable requests even when default visibility is all', async () => {
  const { buildTaskCenter } = await model;
  const workRequests = [row(1,'待教师审核'),row(2,'已撤回'),row(3,'待教师审核',{review_teacher_username:'other',guiding_teacher_username:teacher.username}),row(4,'已通过'),row(5,'待教师审核',{review_teacher_username:'',reviewed_username:teacher.username})];
  const center=buildTaskCenter({account:teacher,workRequests});
  assert.equal(center.total,1); assert.equal(center.byModule.test,1); assert.deepEqual(group(center,'test-review').rows.map(r=>r._id),[1]);
  assert(!center.groups.some(g=>g.kind==='action' && g.id.includes('complete')));
});
test('student tasks separate decisions and completion from waiting, closed and other applicants',async()=>{
  const {buildTaskCenter}=await model;
  const workRequests=['待教师审核','已通过','已驳回','需修改','已撤回','已完成','已关闭','已实施'].map((status,i)=>row(i,status));
  workRequests.push(row(99,'已通过',{applicant_username:'other'}));
  const purchases=[row(40,'待入库',{request_type:undefined}),row(41,'已通过',{request_type:undefined}),row(42,'已完成',{request_type:undefined})];
  const center=buildTaskCenter({account:student,workRequests,purchases});
  assert.equal(center.total,5); assert.equal(center.byModule.test,4); assert.equal(group(center,'test-waiting').count,1);
  assert.deepEqual(group(center,'purchases-complete').rows.map(r=>r._id),[40]);
});
test('finance actionable tasks require completed invoice status and use final amounts once',async()=>{
  const {buildTaskCenter}=await model;
  const center=buildTaskCenter({account:{username:'finance',account_type:'finance'},workRequests:[
    row(1,'已完成',{cost_test:37.22,settlement_status:'已挂账',completion_modified:true,completion_original:{cost_test:999}}),
    row(2,'已完成',{cost_test:5.13,settlement_status:'已开票'}),row(3,'已完成',{cost_test:8,settlement_status:'已开票',reimbursed:true}),
    row(4,'已完成',{cost_test:100}),row(5,'已通过',{cost_test:100,settlement_status:'已开票'}),row(6,'已关闭',{settlement_status:'已挂账'}),
  ],purchases:[row(11,'已完成',{request_type:undefined,estimated_price:999,actual_total_price:12.34,settlement_status:'已开票',inbound_modified:true})]});
  assert.equal(center.total,3); assert.equal(group(center,'test-reimburse').amount,42.35); assert.equal(group(center,'purchases-reimburse').amount,12.34);
  assert.equal(group(center,'test-settlement').count,1); assert.equal(group(center,'test-settlement').kind,'tracking');
  assert(!center.groups.some(g=>g.id==='stock-review'));
});
test('administrator team progress and warnings do not inflate personal tasks',async()=>{
  const {buildTaskCenter}=await model;
  const center=buildTaskCenter({account:{username:'admin',account_type:'admin'},accounts:[{id:1,status:'pending'},{id:2,status:'active'},{id:3,status:'disabled'}],workRequests:[row(1,'待教师审核'),row(2,'已通过')],batches:[{_id:4,current_qty:0,min_qty:1}]});
  assert.equal(center.total,1); assert.equal(center.byModule.admin,1); assert.equal(center.byModule.test,undefined);
  assert.equal(group(center,'test-team-review').count,1); assert.equal(group(center,'test-team-complete').count,1); assert.equal(group(center,'inventory-low').count,1);
});
test('stock tasks follow purchaser identity, approval handover and self-purchase exemption',async()=>{
  const {buildTaskCenter}=await model;
  const stockOutRequests=[
    {_id:1,status:'待采购人审批',applicant_username:'other',purchaser_username:student.username},
    {_id:2,status:'待采购人审批',applicant_username:student.username,purchaser_username:'other'},
    {_id:3,status:'已同意待出库',applicant_username:student.username,purchaser_username:'other'},
    {_id:4,status:'待采购人审批',applicant_username:student.username,purchaser_username:student.username,batch_id:8},
  ];
  const center=buildTaskCenter({account:student,stockOutRequests,batches:[{_id:8,current_qty:4,purchaser_username:'former',approval_delegate_username:student.username}]});
  assert.equal(center.total,3); assert.equal(group(center,'stock-review').count,1); assert.equal(group(center,'stock-complete').count,2); assert.equal(group(center,'stock-waiting').count,1);
});
test('inventory warnings match expiry boundaries, positive stock and long-term validity',async()=>{
  const {buildTaskCenter}=await model;
  const batches=[['2026-10-20',2],['2026-10-21',2],['2026-11-20',2],['2026-11-21',2],['长期',2],['2026-10-20',0]].map(([expiry_date,current_qty],i)=>({_id:i,expiry_date,current_qty,min_qty:0}));
  const center=buildTaskCenter({account:student,batches,today:'2026-10-21'});
  assert.equal(center.total,0); assert.equal(group(center,'inventory-expired').count,1); assert.equal(group(center,'inventory-expiring').count,2); assert.equal(group(center,'inventory-low').count,1);
});
test('tasks recompute after completion and reimbursement, without changing input or retaining stale IDs',async()=>{
  const {buildTaskCenter,taskContains}=await model;
  const original=Object.freeze(row(7,'已通过')); const before=buildTaskCenter({account:student,workRequests:[original]});
  assert(taskContains(group(before,'test-complete'),{_id:'7'}));
  const after=buildTaskCenter({account:student,workRequests:[{...original,status:'已完成'}]}); assert.equal(after.total,0);assert(!taskContains(group(after,'test-complete'),original));assert.equal(original.status,'已通过');
  const finance={username:'finance',account_type:'finance'},done={...original,status:'已完成',settlement_status:'已开票'};
  assert.equal(buildTaskCenter({account:finance,workRequests:[done]}).total,1);
  assert.equal(buildTaskCenter({account:finance,workRequests:[{...done,reimbursed:true}]}).total,0);
  assert.equal(buildTaskCenter({account:null,workRequests:[done]}).total,0);
});
