import assert from 'node:assert/strict';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

export async function checkInventoryPermissions(browser,origin,snapshot,users) {
 const results=[],now=Date.parse('2026-10-25T08:00:00Z');
 const student=users.find(user=>user.account_type==='student');
 const finance={id:99,username:'qa-finance-permissions',display_name:'示例财务',account_type:'finance'};
 for(const width of [390,1366])for(const user of [...users,finance]){
  const account={...user,profile_required:false,session_token:'isolated-permission'},role=account.account_type;
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:now});
  const original=snapshot.lab_material_batches[0];
  const batches=['own','other','expired','manual'].map((name,i)=>({...original,_id:800+i,batch_code:'QA-'+name,material_id:900,material_name:'权限验证材料',spec:'示例规格',storage_room:'205',updated_at:new Date(now).toISOString(),related_purchase_record_id:i<3?700+i:'',related_purchase_id:i<3?'QA-PUR-'+i:'',created_by_username:student.username}));
  const purchases=batches.slice(0,3).map((batch,i)=>({...snapshot.lab_purchase_requests[0],_id:700+i,public_id:'QA-PUR-'+i,inbound_batch_id:batch._id,applicant_username:i===1?'qa-other':student.username,status:'已完成',received_status:'已入库',completed_at:new Date(now-(48*3600000)+(i===2?-1:60000)).toISOString()}));
  const work=['测试','加工','维修'].map((type,i)=>({...snapshot.lab_work_requests[0],_id:500+i,request_type:type,work_content:'示例'+type,status:'已完成',applicant_username:student.username,completed_at:new Date(now).toISOString(),completion_modified:true,completion_original:{workload_quantity:1,cost_test:1},cost_test:2,cost_processing:2,cost_repair:2}));
  const data={...snapshot,current_account:account,lab_material_batches:batches,lab_materials:[{_id:900,name_cn:'权限验证材料'}],lab_purchase_requests:purchases,lab_work_requests:work,lab_review_logs:work.map(row=>({_id:'review-'+row._id,target_id:row._id,target_collection:'lab_work_requests',action:'已通过',reviewer_name:'示例教师',created_at:new Date(now).toISOString()}))};
  await page.addInitScript(a=>sessionStorage.setItem('surface_lab_account',JSON.stringify(a)),account);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:snapshot.lab_accounts}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data,revision:'permissions-fixture'}});
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   return route.fulfill({json:{ok:true,rows:[],comments:[]}});
  });
  try{
   await page.goto(origin);await page.locator('.platform-sync-status').filter({hasText:'同步状态：同步完成'}).waitFor();
   await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:'库存',exact:true}).click();await showModuleRecords(page);
   const group=page.locator('.platform-stock-group');await group.waitFor();assert.equal(await group.getAttribute('open'),null);
   await group.locator(':scope > summary').click();
   const edits=page.getByRole('button',{name:role==='teacher'?'修改库存':'修改物品信息',exact:true}).filter({visible:true});
   assert.equal(await edits.count(),role==='student'?1:role==='finance'?0:4,role);
   if(role==='student'){
    await edits.click();await page.getByRole('dialog',{name:'修改物品信息',exact:true}).waitFor();
    await page.clock.fastForward(61000);
    assert.equal(await page.getByRole('dialog',{name:'修改物品信息',exact:true}).count(),0);
    assert.equal(await edits.count(),0,'expiry removes the edit entry without a refresh');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   for(const type of ['测试','加工','维修']){
    await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:new RegExp('^'+type)}).click();await showModuleRecords(page);
    const history=page.locator('details').filter({has:page.locator('summary').filter({hasText:'完成时修改记录'})});await history.first().waitFor({state:'attached'});
    assert.equal(await page.locator('main details[open]').count(),0,type+' details must start collapsed');
    const visible=history.filter({visible:true}).first();await visible.locator('summary').click();assert.equal(await visible.getAttribute('open'),'');await visible.locator('summary').click();assert.equal(await visible.getAttribute('open'),null);
   }
   assert.deepEqual(errors,[]);results.push({role,width,inventoryPermissions:true,expiry:role==='student',detailsCollapsed:true});
  }finally{await page.close();}
 }
 return results;
}
