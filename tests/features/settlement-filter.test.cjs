const test=require('node:test'),assert=require('node:assert/strict');
const at='2026-10-20T04:00:00Z';
function fixture(){
 const workRequests=['测试','加工','维修'].flatMap((type,t)=>['pending','legacy','booked','invoiced'].map((key,i)=>({_id:`work-${t}-${i}`,public_id:`QA-WORK-${t}-${i}`,request_type:type,work_content:'示例'+type,applicant_username:'example-student',created_at:at,status:i?'已完成':'待教师审核',settlement_status:i===2?'已挂账':i===3?'已开票':undefined,cost_test:10*i+t,cost_processing:10*i+t,cost_repair:10*i+t,completion_modified:i===2,completion_original:{cost_test:999,cost_processing:999,cost_repair:999},reimbursed:i===3})));
 const purchases=['pending','legacy','booked','invoiced'].map((key,i)=>({_id:`purchase-${i}`,public_id:`QA-PUR-${i}`,material_name:'示例材料',applicant_username:'example-student',created_at:at,status:i?'已完成':'待教师审核',received_status:i?'已入库':'未入库',estimated_price:900,actual_total_price:i?100*i:undefined,inbound_batch_id:'batch-'+i,settlement_status:i===2?'已挂账':i===3?'已开票':undefined,inbound_modified:i===2,reimbursed:i===3}));
 return {workRequests,purchases,stockTransactions:[{_id:'stock',operator_username:'example-student',transaction_type:'出库',created_at:at,quantity:2}],stockOutRequests:[{_id:'out',applicant_username:'example-student',status:'待采购人审批',created_at:at}],batches:purchases.map((p,i)=>({_id:'batch-'+i,material_id:'material',material_name:'示例材料',current_qty:4,created_at:'2025-01-01T00:00:00Z',related_purchase_record_id:p._id})),materials:[{_id:'material',name_cn:'示例材料',created_at:at}],reviewLogs:[{_id:'review',target_id:'work-0-2',created_at:at}]};
}
test('settlement choices and matching use exact saved values and default includes unregistered orders',async()=>{
 const {matchesSettlementStatus,settlementStatusOptions}=await import('../../src/features/finance/settlement-filter.js');
 assert.deepEqual(settlementStatusOptions.map(o=>o.value),['','已挂账','已开票']);
 for(const row of [{},{status:'已开票'},{settlement_status:'已开票（已报销）'},{settlement_status:'已挂账'},{settlement_status:'已开票'}])assert(matchesSettlementStatus(row,''));
 assert(matchesSettlementStatus({settlement_status:'已挂账'},'已挂账'));assert(!matchesSettlementStatus({settlement_status:'已开票'},'已挂账'));assert(!matchesSettlementStatus({status:'已挂账'},'已挂账'));assert(!matchesSettlementStatus({settlement_status:'已开票（已报销）'},'已开票'));
});
test('report filters accounting state across all four order kinds without filtering non-order dimensions or inventory associations',async()=>{
 const {selectReportData}=await import('../../src/features/reports/report-data.js'),data=fixture(),filters={student:'example-student',startDate:'2026-10-20',endDate:'2026-10-20'};
 const all=selectReportData(data,filters),booked=selectReportData(data,{...filters,settlementStatus:'已挂账'}),invoiced=selectReportData(data,{...filters,settlementStatus:'已开票'});
 assert.equal(all.workRequests.length,12);assert.equal(all.purchases.length,4);assert.equal(booked.workRequests.length,3);assert.equal(booked.purchases.length,1);assert.equal(invoiced.workRequests.length,3);assert.equal(invoiced.purchases.length,1);
 for(const rows of [booked.workRequests,booked.purchases])assert(rows.every(r=>r.settlement_status==='已挂账'));
 for(const key of ['stockTransactions','stockOutRequests','batches','materials','reviewLogs'])assert.deepEqual(booked[key],all[key],key+' keeps its original non-order scope');assert.equal(booked.batches.length,4,'Out-of-date batches remain associated through every scoped purchase, not only booked ones');
 assert.equal(selectReportData(data,{...filters,settlementStatus:'已挂账',query:'无此记录'}).workRequests.length,0);assert.equal(selectReportData(data,{...filters,student:'another-student',settlementStatus:'已挂账'}).purchases.length,0);
});
test('accounting filter preserves final modified amounts and counts each order only once in business and reimbursement totals',async()=>{
 const {selectReportData}=await import('../../src/features/reports/report-data.js'),{businessMetrics,reportSummaryRows}=await import('../../src/features/dashboard/dashboard-metrics.js'),{reimbursementMetrics}=await import('../../src/features/finance/reimbursement.js');
 const selected=selectReportData(fixture(),{settlementStatus:'已挂账'}),metrics=businessMetrics(selected.workRequests,selected.purchases);
 assert.deepEqual(metrics.map(m=>[m.type,m.total,m.completed,m.completedAmount,m.modified]),[['测试',1,1,20,1],['加工',1,1,21,1],['维修',1,1,22,1],['采购',1,1,200,1]]);
 const reimbursement=reimbursementMetrics(selected.workRequests,selected.purchases);assert.equal(reimbursement.pending.count,4);assert.equal(reimbursement.pending.amount,263);assert.equal(reimbursement.reimbursed.count,0);
 const summary=reportSummaryRows(selected,'2026-10-20');assert.equal(summary.find(r=>r[0]==='待报销金额合计')[1],263);assert.equal(summary.find(r=>r[0]==='采购已入库金额')[1],200);
});
test('report Excel uses the same accounting scope in summaries and four order sheets while retaining non-order sheets',async()=>{
 const {buildReportExport,buildReportWorkbook}=await import('../../src/features/reports/report-export.js'),data=fixture(),result=buildReportExport(data,{settlementStatus:'已挂账'}),table=name=>result.tables.find(t=>t.title===name);
 assert.equal(table('筛选条件').rows[0][table('筛选条件').headers.indexOf('工单状态（测试/加工/维修/采购）')],'已挂账');
 for(const name of ['测试明细','加工明细','维修明细','采购明细']){const detail=table(name);assert.equal(detail.rowCount,1);assert.equal(detail.rows[0][detail.headers.indexOf('工单状态')],'已挂账');assert(!JSON.stringify(detail).includes('已开票'));}
 assert.equal(table('统计汇总').rows.find(r=>r[0]==='待报销金额合计')[1],263);assert.equal(table('出入退库明细').rowCount,1);assert.equal(table('库存批次').rowCount,4);assert(!table('库存批次').headers.includes('工单状态'));
 const bytes=buildReportWorkbook(data,{settlementStatus:'已挂账'}).bytes;assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK');
});
test('default report/export preserves all pending and unregistered orders and does not add finance-only filter columns to existing callers',async()=>{
 const {buildReportExport}=await import('../../src/features/reports/report-export.js'),data=fixture(),old=buildReportExport(data),finance=buildReportExport(data,{settlementStatus:''});
 assert.deepEqual(old.selected,finance.selected);assert.equal(old.selected.workRequests.length,12);assert.equal(old.selected.purchases.length,4);assert(!old.tables[0].headers.some(h=>h.startsWith('工单状态')));assert.equal(finance.tables[0].rows[0][finance.tables[0].headers.indexOf('工单状态（测试/加工/维修/采购）')],'全部');
});
