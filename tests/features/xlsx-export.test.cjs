const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let buildWorkbook,buildExportTable,buildReportExport,buildReportWorkbook;
before(async()=>{
 ({buildWorkbook}=await import('../../src/shared/lib/xlsx-export.js'));
 ({buildExportTable}=await import('../../src/shared/lib/export-columns.js'));
 ({buildReportExport,buildReportWorkbook}=await import('../../src/features/reports/report-export.js'));
});
function parts(bytes){
 const files=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;
  assert.equal(view.getUint16(offset+8,true),0);files.set(decoder.decode(bytes.slice(offset+30,offset+30+nameLength)),decoder.decode(bytes.slice(start,start+size)));offset=start+size;
 }
 assert.equal(view.getUint32(offset,true),0x02014b50);return files;
}
test('Excel headers filter every record, freeze row 1 and preserve text and numeric cell types',()=>{
 const rows=[['00123','=HYPERLINK("https://example.com")',12.5,'中文 & <位置>\n第二行'],['BATCH-261020-000001','+SUM(1,2)',0,'长期']];
 const zip=parts(buildWorkbook([{title:'示例数据',headers:['单号','备注','数量','位置'],rows}]));
 const sheet=zip.get('xl/worksheets/sheet1.xml');
 assert(sheet.includes('<autoFilter ref="A1:D3"/>'));assert(sheet.includes('ySplit="1" topLeftCell="A2"'));assert(sheet.includes('state="frozen"'));
 assert(sheet.includes('<c r="A2" t="inlineStr"><is><t xml:space="preserve">00123</t>'));
 assert(sheet.includes('<c r="C2"><v>12.5</v></c>'));assert(sheet.includes('<c r="C3"><v>0</v></c>'));
 assert(sheet.includes('=HYPERLINK(&quot;https://example.com&quot;)'));assert(sheet.includes('中文 &amp; &lt;位置&gt;\n第二行'));assert(!sheet.includes('<f'));
 assert(zip.has('[Content_Types].xml'));assert(zip.get('xl/workbook.xml').includes('name="示例数据"'));
});
test('empty worksheets retain filterable Chinese headers and columns beyond Z work',()=>{
 const headers=Array.from({length:28},(_,i)=>`字段${i+1}`);
 const zip=parts(buildWorkbook([{title:'空数据',headers,rows:[]}]));
 const sheet=zip.get('xl/worksheets/sheet1.xml');assert(sheet.includes('<autoFilter ref="A1:AB1"/>'));assert(sheet.includes('r="AB1"'));assert(!sheet.includes('r="2"'));
});
test('workbook escapes invalid XML and creates unique Excel-compatible worksheet names',()=>{
 const table={title:'重复/表名',headers:['名称'],rows:[['中\u0000文\u000b\ud800\r\n行']]};
 const zip=parts(buildWorkbook([table,table,{...table,title:'a'.repeat(40)}]));
 assert(zip.get('xl/workbook.xml').includes('name="重复 表名 (2)"'));assert(zip.get('xl/workbook.xml').includes('name="'+'a'.repeat(31)+'"'));
 const sheet=zip.get('xl/worksheets/sheet1.xml');assert(!sheet.includes('\u0000'));assert(sheet.includes('中文�&#13;\n行'));
});
test('all module formats share the same Chinese column selection without changing inputs',()=>{
 const sample={public_id:'WORK-261020-000001',request_type:'测试',work_content:'示例测试',status:'已完成',cost_test:35,quantity:2,unit:'次',workload_quantity:2,workload_unit:'次',current_qty:3,material_name:'示例材料',name_cn:'示例材料',batch_codes:['BATCH-261020-000001'],storage_locations:['示例房间'],stock_by_spec:[{spec:'示例规格',quantity:3,unit:'瓶'}],batches:[],created_at:'2026-10-20T00:00:00Z'};
 const original=JSON.stringify(sample);
 for(const kind of ['test','processing','repair','purchases','stock','stockRequests','materials','inventorySummary','batches','reviews','accounts','audit']){
  const table=buildExportTable(kind,[sample]);assert(table.headers.every(header=>/[\u4e00-\u9fff]/.test(header)));assert.equal(table.rows.length,1);
  const sheet=parts(buildWorkbook([table])).get('xl/worksheets/sheet1.xml');assert(sheet.includes('<autoFilter ref="A1:'));assert(sheet.includes('2"/>'));
 }
 assert.equal(JSON.stringify(sample),original);
});
test('Excel report exports every filtered record across all sheets and uses final fees',()=>{
 const at='2026-10-20T00:00:00Z';
 const row={request_type:'测试',work_content:'示例项目',applicant_username:'example-a',status:'已完成',workload_quantity:1,workload_unit:'次',cost_test:25,completion_original:{cost_test:10},completion_modified:true,created_at:at,completed_at:at};
 const data={workRequests:[{...row,_id:1},{...row,_id:2},{...row,_id:3,applicant_username:'example-b'},{...row,_id:4,created_at:'2026-09-01T00:00:00Z'}]};
 const filters={student:'example-a',startDate:'2026-10-20',endDate:'2026-10-20'};
 const result=buildReportWorkbook(data,filters,new Date(at)),definition=buildReportExport(data,filters,new Date(at));
 assert.equal(result.tables.length,definition.tables.length);assert.equal(result.tables.length,12);assert(result.filename.endsWith('.xlsx'));
 const table=result.tables.find(table=>table.title==='测试明细');assert.equal(table.rows.length,2);assert.deepEqual(table.headers,definition.tables.find(table=>table.title==='测试明细').headers);
 assert(table.rows.every(row=>row[table.headers.indexOf('最终总测试费（元）')]===25));
 const files=parts(result.bytes);assert.equal([...files.keys()].filter(name=>name.startsWith('xl/worksheets/')).length,12);
 assert(files.get('xl/worksheets/sheet4.xml').includes(`autoFilter ref="A1:${String.fromCharCode(65+table.headers.length-1)}3"`));
});
test('Excel limits produce an explicit error instead of a corrupt download',()=>{
 assert.throws(()=>buildWorkbook([]),/没有可导出/);
 assert.throws(()=>buildWorkbook([{headers:['名称'],rows:[['x'.repeat(32768)]]}]),/长度限制/);
 assert.throws(()=>buildWorkbook([{headers:['名称'],rows:[[]]}]),/列数/);
 assert.throws(()=>buildWorkbook([{headers:['名称'],rows:{length:1048576}}]),/范围/);
});

test('reports and Excel exclude every withdrawn request while preserving its audit trail and stock movements',()=>{
 const at='2026-10-20T00:00:00Z';
 const common={applicant_username:'student-a',review_teacher_username:'teacher-a',created_at:at};
 const workRequests=['测试','加工','维修'].flatMap((request_type,index)=>[
  {...common,_id:10+index,public_id:'VISIBLE-WORK-'+index,request_type,work_content:'保留'+request_type,status:'已完成',cost_test:11,cost_processing:12,cost_repair:13},
  {...common,_id:100+index,public_id:'WITHDRAWN-WORK-'+index,request_type,work_content:'撤回'+request_type,status:'已撤回',cost_test:999,cost_processing:999,cost_repair:999},
 ]);
 const data={workRequests,purchases:[
  {...common,_id:20,public_id:'VISIBLE-PURCHASE',material_name:'保留采购',status:'已完成',received_status:'已入库',actual_total_price:17},
  {...common,_id:120,public_id:'WITHDRAWN-PURCHASE',material_name:'撤回采购',status:'已撤回',estimated_price:999},
 ],stockOutRequests:[
  {...common,_id:30,public_id:'VISIBLE-STOCK-REQUEST',material_name:'保留出库申请',status:'待采购人审批'},
  {...common,_id:130,public_id:'WITHDRAWN-STOCK-REQUEST',material_name:'撤回出库申请',status:'已撤回'},
 ],stockTransactions:[{_id:40,public_id:'STOCK-MOVEMENT',operator_username:'student-a',material_name:'历史库存流水',quantity:1,unit:'瓶',transaction_type:'出库',created_at:at}],
 reviewLogs:[100,101,102,120,130].map((target_id,index)=>({_id:index+1,target_id,action:'撤回',reviewer_name:'审计保留人员',created_at:at}))};
 const original=JSON.stringify(data);
 for(const filters of [{},{student:'student-a'}]){
  const result=buildReportExport(data,filters,new Date(at));
  assert.deepEqual(result.selected.workRequests.map(row=>row._id),[10,11,12]);
  assert.deepEqual(result.selected.purchases.map(row=>row._id),[20]);
  assert.deepEqual(result.selected.stockOutRequests.map(row=>row._id),[30]);
  assert.deepEqual(result.selected.stockTransactions.map(row=>row._id),[40]);
  assert.equal(result.selected.reviewLogs.length,5);
  for(const title of ['测试明细','加工明细','维修明细','采购明细','出库申请']){
   const table=result.tables.find(table=>table.title===title);assert.equal(table.rows.length,1);assert(!JSON.stringify(table.rows).includes('撤回'));
  }
  assert.equal(result.tables.find(table=>table.title==='审批明细').rows.length,5);
  const summary=new Map(result.tables.find(table=>table.title==='统计汇总').rows.map(row=>[row[0],row[1]]));
  assert.equal(summary.get('测试已完成最终费用'),11);assert.equal(summary.get('加工已完成最终费用'),12);assert.equal(summary.get('维修已完成最终费用'),13);assert.equal(summary.get('采购已入库金额'),17);
  assert.equal(summary.get('出入退库记录数'),1);assert.equal(summary.get('审批记录数'),5);
 }
 assert.equal(JSON.stringify(data),original);
});
