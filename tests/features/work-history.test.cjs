const {test,before}=require('node:test'),assert=require('node:assert/strict');
let indexWorkHistory,recentSameWork,workHistoryStart,workInstitutionOptions,matchesWorkInstitution;
before(async()=>({indexWorkHistory,recentSameWork,workHistoryStart,workInstitutionOptions,matchesWorkInstitution}=await import('../../src/features/work/work-history.js')));
const current={_id:20,public_id:'TEST-CURRENT',applicant_username:'student-a',request_type:'测试',work_content:'SEM',external_unit:'示例机构甲',created_at:'2026-10-19T04:00:00Z'};
const now=new Date('2026-10-19T08:00:00Z');
test('history requires the same account, work type, exact name and institution',()=>{
 const base={...current,_id:1,public_id:'TEST-OLD',created_at:'2026-10-18T00:00:00Z'};
 const other=[base,{...base,_id:2,applicant_username:'student-b'},{...base,_id:3,request_type:'加工'},
  {...base,_id:4,work_content:'SEM-EDS'},{...base,_id:5,external_unit:'示例机构乙'},{...base,_id:6,deleted_at:now.toISOString()},
  {...base,_id:7,public_id:'TEST-FORMAT',work_content:' sem ',external_unit:' 示例机构甲 '}];
 assert.deepEqual(recentSameWork(current,indexWorkHistory([...other,current]),now).map(row=>row._id),[7,1]);
 assert.deepEqual(recentSameWork({...current,applicant_username:''},indexWorkHistory(other),now),[]);
});
test('half-year history includes the China-date boundary and excludes current, later and invalid records',()=>{
 const row=(id,time)=>({...current,_id:id,public_id:'TEST-'+id,created_at:time});
 const history=[row(1,'2026-04-18T16:00:00Z'),row(2,'2026-04-18T15:59:59Z'),row(3,'2026-10-19T05:00:00Z'),row(4,'invalid'),row(19,current.created_at),row(21,current.created_at),current];
 assert.deepEqual(recentSameWork(current,indexWorkHistory(history),now).map(row=>row._id),[19,1]);
 assert.equal(new Date(workHistoryStart(new Date('2026-08-31T12:00:00+08:00'))).toISOString(),'2026-02-27T16:00:00.000Z');
 assert.equal(new Date(workHistoryStart(new Date('2024-08-31T12:00:00+08:00'))).toISOString(),'2024-02-28T16:00:00.000Z');
});
test('institution choices and filtering are exact, deduplicated and separate for testing and processing',()=>{
 const rows=[current,{...current,external_unit:' 示例机构甲 '},{...current,request_type:'加工',external_unit:'加工机构'},{...current,external_unit:'已移除机构',deleted_at:now.toISOString()}];
 assert.deepEqual(workInstitutionOptions(rows,'测试'),['示例机构甲']);
 assert.equal(matchesWorkInstitution(current,'示例机构'),false);
 assert.equal(matchesWorkInstitution(current,' 示例机构甲 '),true);
 assert.equal(matchesWorkInstitution(current,''),true);
});
