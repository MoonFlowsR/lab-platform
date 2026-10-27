import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import { readWorkbookText } from './workbook.mjs';

const types=['测试','加工','维修','采购'];
async function openFilters(page){
 const filter=page.locator('.platform-filter-panel').first();await filter.waitFor();
 if(!await filter.getByRole('combobox',{name:'工单状态',exact:true}).isVisible())await filter.getByRole('button',{name:/展开筛选/}).click();
 return filter;
}
async function metric(page,type,total,amount){
 const region=page.getByRole('region',{name:type+'统计',exact:true});
 await region.locator('.platform-business-headline>strong').filter({hasText:new RegExp('^'+total+'$')}).waitFor();
 const actual=await region.evaluate(el=>({total:Number(el.querySelector('.platform-business-headline>strong').textContent),amounts:[...el.querySelectorAll('.platform-business-amount')].map(e=>({label:e.querySelector('dt').textContent,amount:e.querySelector('b').textContent}))}));
 assert.equal(actual.total,total);assert.equal(actual.amounts.find(a=>a.label===(type==='采购'?'实际入库金额':'最终费用')).amount,'¥'+amount);
}
async function exportText(page){const download=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*Excel/}).first().click();return readWorkbookText(await(await download).path());}

export async function checkSettlementFilters(browser,origin,out,snapshot,users){
 const [admin,teacher,student]=users,finance={username:'qa-settlement-finance',display_name:'示例财务',account_type:'finance',status:'active',profile_required:false};
 const rows=types.flatMap((type,t)=>['pending','legacy','booked','invoiced'].map((key,i)=>({
  _id:`settlement-${t}-${i}`,public_id:`QA-SETTLE-${t}-${i}`,...(type==='采购'?{}:{request_type:type}),work_content:'示例'+type,material_name:'示例材料',
  applicant_username:student.username,applicant_name:student.display_name,review_teacher_username:teacher.username,review_teacher_name:teacher.display_name,
  status:i?'已完成':'待教师审核',...(type==='采购'?{received_status:i?'已入库':'未入库',actual_total_price:i?i*100:undefined,estimated_price:i===2?999:i*100}:{}),
  cost_test:i*10+t,cost_processing:i*10+t,cost_repair:i*10+t,completion_modified:i===2,completion_original:{cost_test:999,cost_processing:999,cost_repair:999},inbound_modified:i===2,
  settlement_status:i===2?'已挂账':i===3?'已开票':undefined,reimbursed:i===3,workload_quantity:1,workload_unit:'次',quantity:1,unit:'件',created_at:`2026-10-${20+i}T04:00:00Z`,updated_at:'fixture-1',external_unit:'示例机构',preferred_supplier:'示例供应商',
 })));
 const results=[],scenarios=[...['light','dark','mixed'].flatMap(theme=>[1440,390,320].map(width=>({person:finance,theme,width}))),...[admin,teacher,student].map(person=>({person,theme:'light',width:390}))];
 for(const {person,theme,width}of scenarios){
  const account={...person,profile_required:false,session_token:'synthetic-settlement-token'},role=account.account_type;
  const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({account,theme})=>{sessionStorage.setItem('surface_lab_account',JSON.stringify(account));localStorage.setItem('platform:theme',theme);},{account,theme});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'settlement-1',data:{...snapshot,current_account:account,lab_work_requests:rows.filter(r=>r.request_type),lab_purchase_requests:rows.filter(r=>!r.request_type),lab_student_accounts:[student],lab_registered_teacher_accounts:[teacher],lab_accounts:[teacher],lab_user_hidden_records:[]}}});
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(url.pathname==='/api/help-comments/session')return route.fulfill({json:{ok:true,account,student_name_labels:[]}});
   if(route.request().method()!=='GET')writes.push(url.pathname);return route.fulfill({json:{ok:true,rows:[],total:0,comments:[]}});
  });
  try{
   await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status')?.textContent.includes('同步完成'));
   for(const [t,type]of types.entries()){
    const name=type==='采购'?(role==='student'?'采购/入库':role==='teacher'?'采购审核':'采购记录'):type+(role==='teacher'?'审核':['admin','finance'].includes(role)?'记录':'');
    await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name,exact:true}).click();await showModuleRecords(page);
    if(role!=='finance'){assert.equal(await page.getByRole('combobox',{name:'工单状态',exact:true}).count(),0);continue;}
    const panel=await openFilters(page),select=panel.getByRole('combobox',{name:'工单状态',exact:true});assert.equal(await select.evaluate(el=>el.tagName),'SELECT');assert.equal(await select.inputValue(),'');assert.deepEqual(await select.locator('option').evaluateAll(els=>els.map(e=>e.value)),['','已挂账','已开票']);
    await metric(page,type,4,type==='采购'?600:60+3*t);
    await select.selectOption('已挂账');await metric(page,type,1,type==='采购'?200:20+t);assert((await panel.locator('.platform-filter-summary').innerText()).includes('工单状态：已挂账'));
    assert.equal(await page.locator('main .platform-request-record').count(),1);assert((await page.locator('main .platform-request-record').innerText()).includes('QA-SETTLE-'+t+'-2'));
    const booked=await exportText(page);assert(booked.includes('QA-SETTLE-'+t+'-2'));for(const i of [0,1,3])assert(!booked.includes('QA-SETTLE-'+t+'-'+i));
    await select.selectOption('已开票');await metric(page,type,1,type==='采购'?300:30+t);assert((await page.locator('main .platform-request-record').innerText()).includes('QA-SETTLE-'+t+'-3'));
    const invoiced=await exportText(page);assert(invoiced.includes('QA-SETTLE-'+t+'-3'));assert(!invoiced.includes('QA-SETTLE-'+t+'-2'));
    await panel.getByRole('button',{name:'重置筛选',exact:true}).click();assert.equal(await select.inputValue(),'');await metric(page,type,4,type==='采购'?600:60+3*t);
   }
   if(role!=='student'){
    await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:'数据报表',exact:true}).click();await showModuleRecords(page);
    if(role==='finance'){
     const panel=await openFilters(page),select=panel.getByRole('combobox',{name:'工单状态',exact:true});await panel.getByText('工单状态筛选测试、加工、维修及采购。',{exact:true}).waitFor();
     const originalInventory=await page.getByRole('region',{name:'相关库存',exact:true}).innerText(),originalOperations=await page.getByRole('region',{name:'出入退库与审批统计',exact:true}).innerText();
     await select.selectOption('已挂账');for(const [t,type]of types.entries())await metric(page,type,1,type==='采购'?200:20+t);
     assert.equal(await page.getByRole('region',{name:'相关库存',exact:true}).innerText(),originalInventory);assert.equal(await page.getByRole('region',{name:'出入退库与审批统计',exact:true}).innerText(),originalOperations);
     const report=await exportText(page);assert(report.includes('工单状态（测试/加工/维修/采购）'));for(const t of [0,1,2,3]){assert(report.includes('QA-SETTLE-'+t+'-2'));for(const i of [0,1,3])assert(!report.includes('QA-SETTLE-'+t+'-'+i));}
     await panel.getByRole('button',{name:'重置筛选',exact:true}).click();assert.equal(await select.inputValue(),'');for(const [t,type]of types.entries())await metric(page,type,4,type==='采购'?600:60+3*t);
     await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`settlement-filter-${theme}-${width}.png`)});
    }else assert.equal(await page.getByRole('combobox',{name:'工单状态',exact:true}).count(),0);
   }
   assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);results.push({settlementFilter:true,role,theme,width,businessWrites:0,overflow,errors});
  }finally{await page.close();}
 }
 return results;
}
