const {test,before}=require('node:test'),assert=require('node:assert/strict');
let reimbursementMetrics,reportSummaryRows,buildReportExport;
before(async()=>{
 ({reimbursementMetrics}=await import('../../src/features/finance/reimbursement.js'));
 ({reportSummaryRows}=await import('../../src/features/dashboard/dashboard-metrics.js'));
 ({buildReportExport}=await import('../../src/features/reports/report-export.js'));
});
test('reimbursement totals partition actual completed orders, use final amounts once, and retain legacy pending records',()=>{
 const workRequests=[
  {request_type:'测试',status:'已完成',cost_test:1.23,reimbursed:true,completion_modified:true,completion_original:{cost_test:100},settlement_status:'已开票'},
  {request_type:'测试',status:'已归档',cost_test:2.34},
  {request_type:'测试',status:'已通过',cost_test:999,reimbursed:true},
  {request_type:'测试',status:'已关闭',cost_test:999,reimbursed:true},
  {request_type:'加工',status:'已完成',cost_processing:10,reimbursed:true,settlement_status:'已挂账'},
  {request_type:'加工',status:'已完成',cost_processing:0,settlement_status:'已开票'},
  {request_type:'维修',status:'已完成',cost_repair:0.1,settlement_status:'已挂账'},
  {request_type:'维修',status:'已完成',cost_repair:0.2,settlement_status:'已开票'},
 ];
 const purchases=[
  {status:'已完成',actual_total_price:25,estimated_price:100,inbound_modified:true,reimbursed:true,settlement_status:'已开票'},
  {status:'待入库',received_status:'已入库',estimated_price:5.1},
  {status:'已关闭',received_status:'已入库',estimated_price:999,reimbursed:true},
  {status:'待入库',estimated_price:999,reimbursed:true},
 ];
 const source=JSON.stringify({workRequests,purchases}),metrics=reimbursementMetrics(workRequests,purchases);
 assert.deepEqual(metrics.reimbursed,{count:3,amount:36.23});assert.deepEqual(metrics.pending,{count:5,amount:7.74});assert.equal(metrics.unregisteredCount,2);assert.equal(metrics.legacyEstimatedCount,1);
 assert.deepEqual(metrics.byType[2].pending,{count:2,amount:0.3});
 assert.equal(metrics.byType.reduce((sum,row)=>sum+row.reimbursed.count+row.pending.count,0),8);
 assert.equal(JSON.stringify({workRequests,purchases}),source,'Computing totals never changes orders or their completion evidence');
 const summary=new Map(reportSummaryRows({workRequests,purchases}).map(([key,value])=>[key,value]));
 assert.equal(summary.get('已报销金额合计'),36.23);assert.equal(summary.get('待报销金额合计'),7.74);assert.equal(summary.get('维修待报销金额'),0.3);assert.equal(summary.get('采购已报销工单数'),1);
});
test('mark/unmark moves exactly one final amount; zero, unregistered, empty and filtered results remain accurate',()=>{
 const row={request_type:'测试',status:'已完成',cost_test:20,completion_original:{cost_test:100},settlement_status:'已开票'};
 assert.deepEqual(reimbursementMetrics([row]).pending,{count:1,amount:20});assert.deepEqual(reimbursementMetrics([{...row,reimbursed:true}]).reimbursed,{count:1,amount:20});assert.deepEqual(reimbursementMetrics([{...row,reimbursed:false}]).pending,{count:1,amount:20});
 assert.deepEqual(reimbursementMetrics().pending,{count:0,amount:0});assert.deepEqual(reimbursementMetrics([], [{status:'已完成',actual_total_price:0,estimated_price:100}]).pending,{count:1,amount:0});
 const workRequests=[{...row,applicant_username:'example-a',created_at:'2026-10-20T00:00:00Z'},{...row,applicant_username:'example-b',created_at:'2026-10-19T00:00:00Z',reimbursed:true}];
 const result=buildReportExport({workRequests},{student:'example-a',startDate:'2026-10-20',endDate:'2026-10-20'});
 const summary=new Map(reportSummaryRows(result.selected).map(([key,value])=>[key,value]));assert.equal(summary.get('待报销金额合计'),20);assert.equal(summary.get('已报销金额合计'),0);
 const rows=result.tables.find(table=>table.title==='统计汇总').rows;assert(rows.some(row=>row[0]==='待报销金额合计'&&row[1]===20&&row[2]==='元'));assert(rows.some(row=>row[0]==='已报销金额合计'&&row[1]===0&&row[2]==='元'));
});
