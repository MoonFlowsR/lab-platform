const test = require('node:test');
const assert = require('node:assert/strict');
let recordSearchText, recordMatchesSearch, requestSearchIndex, groupMaterialBatches, summarizeMaterials, searchMaterialBatches, matchRanges, selectReportData;
test.before(async () => {
  ({recordSearchText,recordMatchesSearch,requestSearchIndex} = await import('../../src/shared/lib/teacher-filter.js'));
  ({groupMaterialBatches,summarizeMaterials,searchMaterialBatches} = await import('../../src/features/inventory/material-summary.js'));
  ({matchRanges} = await import('../../src/shared/hooks/page-search-highlight.js'));
  ({selectReportData} = await import('../../src/features/reports/report-data.js'));
});
test('search retains rendered Shanghai dates, labels and price variants', () => {
  const row={request_type:'测试',created_at:'2026-10-14T11:30:15.000Z',cost_test:1234.5,status:'已完成',applicant_name:'示例学生',review_teacher_name:'示例教师'};
  for(const query of ['2026/10/14 19:30:15','2026-10-14 19:30:15','申请人：示例学生','审核教师：示例教师','¥1,234.5','最终总测试费']) assert.ok(recordMatchesSearch(row,query),query);
  assert.equal(recordSearchText(row),recordSearchText(row));
});
test('new immutable snapshot objects refresh cached fields and translated account status', () => {
  const original={account_type:'student',status:'pending',display_name:'示例学生'};
  assert.ok(recordMatchesSearch(original,'待审核'));assert.ok(!recordMatchesSearch(original,'启用中'));
  const updated={...original,status:'active',display_name:'更新后的示例姓名'};
  assert.ok(recordMatchesSearch(updated,'启用中'));assert.ok(recordMatchesSearch(updated,'更新后的示例姓名'));assert.ok(!recordMatchesSearch(updated,'待审核'));
  assert.ok(recordMatchesSearch(original,'待审核'));
});
test('search excludes private bookkeeping and not-yet-received expiry fields', () => {
  const draft={received_status:'待入库',expiry_date:'2049-06-03',password_hash:'unsearchable-secret',storage_path:'private-location',_fingerprint:'private-marker'};
  for(const query of ['2049-06-03','unsearchable-secret','private-location','private-marker'])assert.ok(!recordMatchesSearch(draft,query));
  assert.ok(recordMatchesSearch({...draft,received_status:'已入库'},'2049/06/03'));
});
test('request index preserves reviews and live attachment search across query and snapshot changes', () => {
  const row={_id:1,public_id:'WORK-1',work_content:'示例测试'};
  const logs=[{target_collection:'lab_work_requests',target_id:1,review_note:'示例审核意见',created_at:'2026-10-14T11:30:15Z'}];
  const attachments=[{target_collection:'lab_work_requests',target_id:1,original_name:'示例证明.pdf'},{target_collection:'lab_work_requests',target_id:1,original_name:'已删除附件.pdf',deleted_at:'removed'}];
  const matches=requestSearchIndex(logs,attachments);
  for(const query of ['审核意见','示例证明.pdf','2026/10/14 19:30:15'])assert.ok(matches(row,'lab_work_requests',query));
  assert.ok(!matches(row,'lab_purchase_requests','示例证明.pdf'));assert.ok(!matches(row,'lab_work_requests','已删除附件.pdf'));assert.ok(matches(row,'lab_work_requests',''));
  const revised=requestSearchIndex([{...logs[0],review_note:'更新审核意见'}],[]);
  assert.ok(revised(row,'lab_work_requests','更新审核意见'));assert.ok(!revised(row,'lab_work_requests','示例证明.pdf'));
});
test('inventory caches preserve quantities, scope and new snapshot updates', () => {
  const materials=[{_id:1,name_cn:'示例材料'}];
  const rows=[{_id:2,material_id:1,material_name:'示例材料',spec:'Mn-200',storage_room:'A101',unit:'g',current_qty:2},
    {_id:3,material_id:1,material_name:'示例材料',spec:'Mn-200',storage_room:'A101',unit:'g',current_qty:3},
    {_id:4,material_id:1,material_name:'示例材料',spec:'Mn-400',storage_room:'A102',unit:'g',current_qty:4}];
  assert.equal(groupMaterialBatches(rows),groupMaterialBatches(rows));
  assert.equal(summarizeMaterials(materials,rows)[0].stock_by_spec.find(row=>row.spec==='Mn-200').quantity,5);
  assert.deepEqual(searchMaterialBatches(rows,'示例材料200',recordMatchesSearch).map(row=>row._id).sort(),[2,3]);
  assert.deepEqual(searchMaterialBatches(rows.filter(row=>row.storage_room==='A102'),'示例材料200',recordMatchesSearch),[]);
  const updated=rows.map(row=>row._id===2?{...row,current_qty:7}:row);
  assert.equal(groupMaterialBatches(updated).find(row=>row.spec==='Mn-200').current_qty,10);
});
test('highlight range matching keeps literal punctuation, Unicode and split occurrences', () => {
  assert.deepEqual(matchRanges('α-示例（A+B）与α-示例',['α-示例','A+B']),[[0,4],[5,8],[10,14]]);
  assert.deepEqual(matchRanges('a.b / A.B','a.b'),[[0,3],[6,9]]);
});
test('report caches refresh teacher display names and immutable inventory updates', () => {
  const batch={_id:2,material_name:'示例材料',material_id:1,spec:'Mn-200',current_qty:3,min_qty:1,review_teacher_username:'teacher-example',inbound_by_username:'teacher-example',created_by_username:'student-example',created_at:'2026-10-14T11:30:15Z'};
  const data={teachers:[{username:'teacher-example',display_name:'示例教师'}],materials:[{_id:1,name_cn:'示例材料'}],batches:[batch],stockTransactions:[]};
  const initial=selectReportData(data,{teacher:'teacher-example',query:'示例教师'});
  assert.equal(initial.batches.length,1);assert.equal(initial.batches[0].associated_teacher_names,'示例教师');
  assert.equal(selectReportData(data,{query:'低库存'}).batches.length,0);
  const updated={...data,teachers:[{username:'teacher-example',display_name:'更新教师姓名'}],batches:[{...batch,current_qty:0}]};
  assert.equal(selectReportData(updated,{query:'低库存'}).batches[0].current_qty,0);
  assert.equal(selectReportData(updated,{query:'更新教师姓名'}).batches.length,1);
  assert.equal(selectReportData(data,{student:'other-student'}).batches.length,0);
});
