import { readWorkbookText } from './workbook.mjs';
import { checkExcelExports } from './excel-exports.mjs';
import { checkRegistration } from './registration.mjs';
import { checkFinance } from './finance.mjs';
import { checkDashboardCounts } from './dashboard-counts.mjs';
import { checkPurchaseFilters } from './purchase-filters.mjs';
import { checkAccountViewScope } from './account-view-scope.mjs';
import { checkPurchaseInbound } from './purchase-inbound.mjs';
import { checkPurchaseChannels } from './purchase-channels.mjs';
import { checkWorkReview } from './work-review.mjs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Isolated built-app browser test: every API call is fulfilled from synthetic fixtures.
// This file never connects to the production server, database, login, or write endpoints.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dist=path.join(root,'dist'),out=path.join(root,'test-results/ui');
const at='2026-10-16T04:00:00Z',previousDay='2026-10-15T15:59:59Z';
const teacher=(id,suffix,time=at)=>({id,_id:id,username:'qa-teacher-'+suffix,display_name:'示例教师'+suffix,account_type:'teacher',status:'active',created_at:time});
const teachers=[teacher(11,'甲'),teacher(12,'乙','2026-10-15T04:00:00Z'),teacher(13,'丙')];
const profile=(a,b)=>({responsible_teacher_username:teachers[a].username,guiding_teacher_username:teachers[b].username,responsible_teacher_name:teachers[a].display_name,guiding_teacher_name:teachers[b].display_name,graduation_year:2028});
const students=['甲','乙','丙','丁'].map((suffix,index)=>({id:index+1,_id:index+1,username:'qa-student-'+suffix,display_name:'示例学生'+suffix,account_type:'student',status:'active',created_at:[at,'2026-10-14T04:00:00Z',at,'2026-10-13T04:00:00Z'][index],student_profile:[profile(0,0),profile(1,1),profile(0,1),null][index]}));
const [studentA,studentB,studentC]=students;
const admin={id:90,_id:90,username:'qa-admin',display_name:'示例管理员',account_type:'admin',status:'active',created_at:at,session_token:'isolated-synthetic-admin-token'};
const accounts=[...students,...teachers,admin];
const nameLabels=students.map(row=>({username:row.username,display_name:row.display_name,responsible_teacher_name:row.student_profile?.responsible_teacher_name,guiding_teacher_name:row.student_profile?.guiding_teacher_name}));
const work={_id:71,public_id:'QA-WORK-71',request_type:'测试',work_content:'直接指定教师甲测试',applicant_username:studentA.username,applicant_name:studentA.display_name,review_teacher_username:teachers[0].username,review_teacher_name:teachers[0].display_name,status:'待教师审核',workload_quantity:1,workload_unit:'小时',cost_test:10,created_at:at};
const mentorOnlyWork={...work,_id:72,public_id:'QA-WORK-72',work_content:'仅导师关系对照测试',review_teacher_username:teachers[1].username,review_teacher_name:teachers[1].display_name,...profile(0,0)};
const teacherApplicantWork={...work,_id:73,public_id:'QA-WORK-73',work_content:'教师甲本人申请测试',applicant_username:teachers[0].username,applicant_name:teachers[0].display_name,review_teacher_username:teachers[1].username,review_teacher_name:teachers[1].display_name};
const purchase={_id:71,public_id:'QA-PURCHASE-71',material_name:'示例材料乙',purchase_category:'试剂原料',applicant_username:studentB.username,applicant_name:studentB.display_name,review_teacher_username:teachers[1].username,review_teacher_name:teachers[1].display_name,status:'待审核',quantity:1,unit:'g',estimated_price:10,created_at:at};
const batch={_id:81,public_id:'QA-SHARED-BATCH',batch_code:'QA-SHARED-BATCH',material_id:82,material_name:'示例共享材料',current_qty:10,min_qty:0,unit:'g',spec:'无',storage_room:'A102',storage_location:'A102',expiry_date:'长期',purchaser_username:studentA.username,purchaser_name:studentA.display_name,created_by_username:studentA.username,last_modified_username:studentB.username,created_at:at};
const tx=(id,student)=>({_id:id,public_id:'QA-STOCK-'+id,transaction_type:'出库',material_id:82,material_name:batch.material_name,batch_id:81,batch_code:batch.batch_code,operator_username:student.username,operator_name:student.display_name,quantity:1,unit:'g',created_at:at});
const transactions=[tx(91,studentA),tx(92,studentB),tx(93,studentA)];
const attachment={_id:101,target_collection:'lab_stock_transactions',target_id:91,target_public_id:'QA-STOCK-91',uploaded_by_username:studentA.username,original_name:'示例照片.jpg',created_at:at};
const material={_id:82,public_id:'QA-MATERIAL-82',name_cn:batch.material_name,created_by_username:studentA.username,last_modified_username:studentB.username,created_at:at};
const log=(id,values)=>({id,created_at:at,operator_username:admin.username,operator_role:'admin',target_type:'accounts',target_id:'90',before_json:'',after_json:'',ip_address:'127.0.0.1',...values});
const auditLogs=[
 log(1,{operator_username:studentA.username,operator_role:'student',action:'login',target_id:'1'}),
 log(2,{action:'adminResetPassword',target_id:'1'}),
 log(3,{operator_username:teachers[0].username,operator_role:'teacher',action:'reviewWorkRequest',target_type:'lab_work_requests',target_id:'71'}),
 log(4,{operator_username:teachers[1].username,operator_role:'teacher',action:'reviewPurchaseRequest',target_type:'lab_purchase_requests',target_id:'71'}),
 log(5,{action:'deleteAttachment',target_type:'lab_attachments',target_id:'101'}),
 log(6,{operator_username:studentC.username,operator_role:'student',action:'updateMyStudentProfile',target_type:'student_profiles',target_id:'3'}),
 log(7,{operator_username:studentB.username,operator_role:'student',action:'register',target_id:'2',created_at:'2026-10-15T16:00:00Z'}),
 log(8,{operator_username:studentA.username,operator_role:'student',action:'login',target_id:'1',created_at:previousDay}),
 log(9,{operator_username:teachers[0].username,operator_role:'teacher',action:'login',target_id:'11'}),
 log(10,{action:'qa_system_event'}),
 log(11,{operator_username:studentA.username,operator_role:'student',action:'qa_shared_by_A',target_type:'lab_stock_transactions',target_id:'91',after_json:JSON.stringify(transactions[0])}),
 log(12,{operator_username:studentB.username,operator_role:'student',action:'qa_shared_by_B',target_type:'lab_stock_transactions',target_id:'92',after_json:JSON.stringify(transactions[1])}),
 log(13,{operator_username:studentA.username,operator_role:'student',action:'qa_init_by_A',target_type:'lab_materials',target_id:'82',after_json:JSON.stringify({_id:82,name_cn:batch.material_name,created_by_username:studentA.username})}),
 log(14,{operator_username:studentB.username,operator_role:'student',action:'qa_modified_by_B',target_type:'lab_materials',target_id:'82',before_json:JSON.stringify({_id:82,name_cn:batch.material_name,created_by_username:studentA.username}),after_json:JSON.stringify(material)}),
 log(15,{operator_username:studentB.username,operator_role:'student',action:'qa_deleted_snapshot_B',target_type:'lab_stock_transactions',target_id:'9999',after_json:JSON.stringify({batch_code:batch.batch_code,operator_username:studentB.username})}),
 log(16,{action:'qa_current_reference_A',target_type:'lab_stock_transactions',target_id:'93'}),
 log(17,{action:'qa_quantity_only_A',target_type:'lab_stock_transactions',target_id:'93',before_json:JSON.stringify({quantity:1}),after_json:JSON.stringify({quantity:2})}),
 log(18,{action:'qa_admin_manages_teacher_A',target_type:'accounts',target_id:'11',after_json:JSON.stringify(teachers[0])}),
 log(19,{action:'qa_admin_edits_student_profile',target_type:'accounts',target_id:'1',after_json:JSON.stringify(studentA)}),
 log(20,{action:'qa_student_applies_assigned_teacher_A',operator_username:studentA.username,operator_role:'student',target_type:'lab_work_requests',target_id:'71',after_json:JSON.stringify(work)}),
 log(21,{action:'qa_other_teacher_operation',operator_username:teachers[1].username,operator_role:'teacher',target_type:'accounts',target_id:'12'}),
];
const snapshot={current_account:admin,accounts,audit_logs:auditLogs,lab_student_accounts:students,lab_teacher_accounts:teachers,lab_registered_teacher_accounts:teachers,lab_accounts:teachers,lab_student_name_labels:nameLabels,lab_work_requests:[work,mentorOnlyWork,teacherApplicantWork],lab_purchase_requests:[purchase],lab_material_batches:[batch],lab_materials:[material],lab_stock_transactions:transactions,lab_stock_out_requests:[],lab_review_logs:[],lab_attachments:[attachment],lab_user_hidden_records:[],lab_test_processing_units:[],lab_purchase_catalog:[],lab_material_catalog:[]};
const server=http.createServer(async(req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(dist,(pathname==='/'||pathname==='/help')?'index.html':`.${pathname}`);if(path.relative(dist,target).startsWith('..')){res.writeHead(403);return res.end();}try{const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('not found');}});
await fs.mkdir(out,{recursive:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,origin=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true}),results=[];

Object.assign(batch,{purchase_category:'试剂原料',supplier:'示例供应商',purchase_purpose:'私用/项目用（出库需采购人审批）',inbound_by_name:studentA.display_name,inbound_by_username:studentA.username,safety_notes:'保持密封，使用时佩戴防护用品。',remark:'示例备注：使用后归还原位。',storage_detail:'示例柜上层左侧',storage_location:'A102 · 示例柜上层左侧',inbound_photo_attachment_id:101,spec:'50-100nm，纯度99.9%'});
Object.assign(purchase,{reviewed_at:at,reviewed_by:teachers[1].display_name,review_note:'示例唯一审批意见',status:'待入库',specification:'50-100nm',preferred_supplier:'示例供应商',purchase_purpose:'公用'});
snapshot.lab_work_requests.push({...work,_id:74,request_type:'加工',work_content:'示例加工',cost_processing:20,cost_test:0});
snapshot.lab_work_requests.push({...work,_id:75,status:'已完成',work_content:'示例已完成测试',completed_at:at});
snapshot.lab_work_requests.push({...work,_id:76,status:'已完成',work_content:'示例审批后修改测试',completion_modified:true,completed_at:at});
snapshot.lab_material_batches.push({...batch,_id:83,public_id:'BATCH-261016-000001',batch_code:'BATCH-261016-000001',storage_room:'A101',storage_location:'A101 · 示例柜',expiry_date:'2026-10-01'});
try {
 for (const width of [1440,390,320]) for(const user of [admin,teachers[0],studentA]) {
  const account={...user,profile_required:false,session_token:'synthetic-only'},role=account.account_type;
  const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(a=>sessionStorage.setItem('surface_lab_account',JSON.stringify(a)),account);
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   if(u.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers}});
   if(u.pathname==='/api/ops/listAudit')return route.fulfill({json:{ok:true,rows:auditLogs.slice(0,route.request().postDataJSON()?.limit || auditLogs.length).map(row=>({...row,object_label:'示例对象'})),total:auditLogs.length}});
   if(u.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data:{...snapshot,current_account:account},revision:'synthetic-review'}});
   if(u.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(u.pathname==='/api/help-comments/session')return route.fulfill({json:{ok:true,account,student_name_labels:nameLabels}});
   if(u.pathname==='/api/help-comments')return route.fulfill({json:{ok:true,comments:[]}});
   return route.fulfill({json:{ok:true,comments:[]}});
  });
  await page.goto(origin);await page.locator('.platform-nav').waitFor();
  const tabs=await page.locator('.platform-nav button').allTextContents();
  for(let i=0;i<tabs.length;i++){
   await page.locator('.platform-nav button').nth(i).click();await page.locator('main').waitFor();await page.waitForTimeout(250);
   await page.screenshot({path:path.join(out,role+'-'+width+'-'+i+'.png'),fullPage:true});
   const geometry=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyHeight:document.body.scrollHeight,mainTop:document.querySelector('main')?.getBoundingClientRect().top,heading:document.querySelector('main h2')?.textContent}));
   results.push({role,width,tab:tabs[i],...geometry,errors:[...errors]});
   if(role==='admin' && width===1440){
    if(tabs[i]==='测试记录'){
     const pending=page.locator('main > section').filter({has:page.getByRole('heading',{name:/^待审批测试/})});
     assert.equal(await pending.locator('h3').count(),1);
     await pending.getByRole('button',{name:'查看全部',exact:true}).click();assert.equal(await pending.locator('h3').count(),3);
     await pending.getByRole('button',{name:'仅显示最近1条',exact:true}).click();assert.equal(await pending.locator('h3').count(),1);
     const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*Excel/}).first().click();
     const worksheetText=await readWorkbookText(await (await downloaded).path());
     for(const name of ['直接指定教师甲测试','仅导师关系对照测试','教师甲本人申请测试'])assert(worksheetText.includes(name),'Excel must include hidden matching records');
     results.push({latestOneAndExpand:true,exportNotTruncated:true});
    }
    if(tabs[i]==='采购记录'){
     assert.equal(await page.getByText('示例唯一审批意见',{exact:true}).filter({visible:true}).count(),1);
     assert.equal(await page.locator('main').getByText('系统责任教师',{exact:true}).count(),0);
     results.push({approvalOpinionShownOnce:true});
    }
    if(tabs[i]==='库存'){
     const groups=page.locator('main > section').filter({has:page.getByRole('heading',{name:'材料批次库存',exact:true})});
     assert.equal(await groups.locator('.platform-stock-group').count(),1);
     await groups.getByRole('button',{name:'查看全部',exact:true}).click();assert.equal(await groups.locator('.platform-stock-group').count(),2);
     await groups.getByRole('button',{name:'仅显示最近1条',exact:true}).click();
     results.push({inventoryLatestOne:true});
    }
    if(tabs[i]==='数据报表'){
     const panel=page.locator('#report-detail-panel');assert.equal(await panel.locator('tbody tr').count(),1);
     await panel.getByRole('button',{name:'查看全部',exact:true}).click();assert.equal(await panel.locator('tbody tr').count(),5);
     await panel.getByRole('button',{name:'仅显示最近1条',exact:true}).click();
     await page.getByRole('tab',{name:/^采购/}).click();assert.equal(await panel.getByText('系统责任教师',{exact:true}).count(),0);
     results.push({reportsLatestOne:true,reportTeacherDuplicationRemoved:true});
    }
    if(tabs[i]==='账号管理'){
     const accountsSection=page.locator('main > section').filter({has:page.getByRole('heading',{name:'账号列表',exact:true})});
     assert.equal(await accountsSection.locator('tbody tr').count(),1);
     const audit=page.getByRole('region',{name:'最近操作日志'});await audit.locator('tbody tr').first().waitFor();
     assert.equal(await audit.locator('tbody tr').count(),3);
     results.push({accountsLatestOneAuditLatestThree:true});
    }
   }
   if(tabs[i]==='账号管理'&&width===390){
    await page.getByRole('button',{name:'导出账号Excel',exact:true}).click();
    assert.match(await page.locator('.platform-sync-status').innerText(),/同步完成/);
    await page.getByRole('button',{name:/查看全部账号/}).click();
    await page.getByRole('button',{name:'修改学生资料',exact:true}).first().click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByText('修改密码',{exact:true}).count(),0);
    const teacher=dialog.getByRole('combobox').first();await teacher.fill('不存在的示例教师');
    await dialog.getByText('无相关内容',{exact:true}).waitFor();assert.equal(await dialog.getByRole('option').count(),0);
    await teacher.fill('示例教师甲');await dialog.getByRole('option').first().click();assert.equal(await dialog.getByRole('listbox').count(),0);
    await page.screenshot({path:path.join(out,'admin-profile-mobile.png')});
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('button',{name:/展开筛选/}).click();
    assert.equal(await page.locator('.platform-filter-panel-body').isVisible(),true);
    await page.getByRole('button',{name:/收起筛选/}).click();
    assert.equal(await page.locator('.platform-filter-panel-body').isVisible(),false);
    results.push({profileDialog:true,searchAndCollapse:true,syncAfterExport:await page.locator('.platform-sync-status').innerText()});
   }
   if(role==='student'&&tabs[i]==='测试'&&width===320){
    await page.getByRole('button',{name:'新建测试',exact:true}).click();
    const quantity=page.locator('input[type="number"][step="any"]').first();
    await quantity.fill('0.001');assert.equal(await quantity.evaluate(input=>input.validity.valid),true);results.push({fractionalQuantity:true});
   }
  }
  await page.goto(origin+'/help');await page.locator('.help-page').waitFor();await page.screenshot({path:path.join(out,role+'-'+width+'-help.png'),fullPage:true});
  results.push({role,width,help:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors});await page.close();
 }
 results.push(...await checkExcelExports(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 results.push(...await checkRegistration(browser,origin,out));
 results.push(...await checkFinance(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 results.push(...await checkDashboardCounts(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 results.push(...await checkPurchaseFilters(browser,origin,out,snapshot,[teachers[0],admin]));
 results.push(...await checkAccountViewScope(browser,origin,out,snapshot,teachers[0]));
 results.push(...await checkWorkReview(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 results.push(...await checkPurchaseChannels(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 results.push(...await checkPurchaseInbound(browser,origin,out,snapshot,[admin,teachers[0],studentA]));
 const anonymous=await browser.newPage({viewport:{width:390,height:850}});let deniedReads=0;
 await anonymous.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();if(u.pathname==='/api/help-comments'){deniedReads++;return route.fulfill({status:401,json:{ok:false,message:'请先登录。'}});}return route.fulfill({json:{ok:true,comments:[]}});});
 await anonymous.goto(origin+'/help');await anonymous.getByText('后查看留言和评论。',{exact:false}).waitFor();
 assert.equal(await anonymous.locator('.help-composer-error').count(),0);await anonymous.waitForTimeout(10500);assert.equal(deniedReads,1,'Anonymous authorization failure must not keep polling');
 results.push({anonymousHelpNoError:true,anonymousRequests:deniedReads});await anonymous.close();
 assert.equal(results.filter(r=>r.scrollWidth>r.viewport||r.overflow).length,0,'page must fit the viewport');assert.deepEqual(results.flatMap(r=>r.errors||[]),[],'no browser errors');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,overflow:results.filter(r=>r.scrollWidth>r.viewport||r.overflow),errors:results.flatMap(r=>r.errors||[]),out},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
