import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkPurchaseInbound(browser,origin,out,snapshot,users){
 const results=[],student=users.find(u=>u.account_type==='student'),teacher=users.find(u=>u.account_type==='teacher');
 for(const width of [1440,390,320])for(const user of users){
  const account={...user,profile_required:false,session_token:'synthetic-inbound'},calls=[],uploads=[],errors=[];
  const records=['待教师审核','待入库','已完成','已完成','已驳回','已完成'].map((status,index)=>({...snapshot.lab_purchase_requests[0],_id:901+index,public_id:'QA-PUR-'+index,material_name:'示例采购'+index,
   applicant_username:student.username,applicant_name:student.display_name,review_teacher_username:teacher.username,review_teacher_name:teacher.display_name,
   status,quantity:2,unit:'瓶',estimated_price:100,updated_at:'fixture-version',created_at:new Date(Date.now()-index*60000).toISOString(),
   received_status:status==='已完成'?'已入库':'未入库',...(index===3?{actual_total_price:60,actual_received_qty:4,actual_received_unit:'盒',inbound_modified:true,settlement_status:'已开票',inbound_changes:[{label:'总采购费（元）',before:100,after:60}]}:{}),
  }));
  const page=await browser.newPage({viewport:{width,height:960}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(a=>sessionStorage.setItem('surface_lab_account',JSON.stringify(a)),account);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data:{...snapshot,current_account:account,lab_purchase_requests:records},revision:'inbound-'+calls.length}});
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(url.pathname==='/api/attachments/uploadJson'){uploads.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,attachment:{_id:'photo-1'}}});}
   if(url.pathname==='/api/ops/completePurchaseInbound'){
    const payload=route.request().postDataJSON();calls.push(payload);const row=records.find(r=>r._id===payload.id);
    Object.assign(row,{status:'已完成',received_status:'已入库',actual_total_price:payload.actual_total_price,actual_received_qty:payload.actual_qty,actual_received_unit:payload.unit,settlement_status:payload.settlement_status,inbound_modified:true,inbound_changes:[{label:'总采购费（元）',before:100,after:payload.actual_total_price}]});
    return route.fulfill({json:{ok:true,record:row}});
   }
   return route.fulfill({json:{ok:true,rows:[],total:0}});
  });
  await page.goto(origin);await openNavigation(page);await page.locator('.platform-nav').waitFor({state:'attached'});await openNavigation(page);await page.locator('.platform-nav button').filter({hasText:'采购'}).click();await showModuleRecords(page);
  for(const title of ['待审批采购工单','已审批采购工单','已完成采购工单','完成时修改的采购工单'])await page.getByRole('heading',{name:new RegExp('^'+title)}).waitFor();
  const approved=page.locator('main > .platform-section-approved'),completed=page.locator('main > .platform-section-reviewed'),modified=page.locator('main > .platform-section-modified');
  assert.equal(await approved.locator('h3').count(),1);assert.equal(await completed.locator('h3').count(),1);
  await approved.getByRole('button',{name:/^展开其余 \d+ 条$/}).click();assert.equal(await approved.locator('h3').count(),2);
  await approved.getByRole('button',{name:'收起，仅看最新1条',exact:true}).click();
  await modified.getByText('完成时修改记录',{exact:true}).click();assert((await modified.innerText()).includes('100 → 60'));
  if(user.account_type!=='student')assert.equal(await page.getByRole('button',{name:'确认到货并入库',exact:true}).count(),0);
  else{
   await approved.getByRole('button',{name:'确认到货并入库',exact:true}).click();
   const form=page.locator('.platform-purchase-inbound');
   await form.getByLabel('实际到货数量',{exact:false}).fill('4');await form.getByLabel('单位',{exact:false}).fill('盒');
   await form.getByLabel('最终总采购费 / 元',{exact:false}).fill('60');
   const status=form.locator('label').filter({hasText:/工单状态/}).getByRole('combobox');assert.equal(await status.inputValue(),'');assert.equal(await status.getAttribute('placeholder'),'请选择');
   const room=form.getByRole('combobox',{name:/存放房间/});await room.fill('其它');await page.getByRole('option',{name:'其它',exact:true}).click();
   await form.getByLabel('其它存放房间',{exact:false}).fill('示例房间');await form.getByLabel('具体位置简述',{exact:false}).fill('示例柜上层');await form.getByRole('checkbox',{name:'长期有效'}).check();
   await form.locator('input[type=file]').setInputFiles({name:'example.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
   await form.getByRole('button',{name:'确认入库并完成采购',exact:true}).click();assert.equal(calls.length,0);assert.equal(uploads.length,0);
   await status.fill('已挂账');await page.getByRole('option',{name:'已挂账',exact:true}).click();
   await form.getByRole('button',{name:'确认入库并完成采购',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   for(const value of ['4 盒','¥60','已挂账','示例房间'])assert((await dialog.innerText()).includes(value),value);
   await page.screenshot({path:path.join(out,`inbound-confirm-student-${width}.png`)});
   await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(uploads.length,0,'No upload before confirmation');assert.equal(calls.length,0);
   await form.getByRole('button',{name:'确认入库并完成采购',exact:true}).click();await dialog.getByRole('button',{name:'确认到货并完成入库',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('.platform-purchase-inbound'));
   assert.equal(calls.length,1);assert.equal(uploads.length,1);const payload=calls[0];assert.equal(payload.confirmed,true);assert.equal(payload.expected_updated_at,'fixture-version');assert.equal(payload.actual_total_price,60);assert.equal(payload.actual_qty,4);assert.equal(payload.unit,'盒');assert.equal(payload.settlement_status,'已挂账');
   assert((await modified.innerText()).includes('示例采购1'));
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
  results.push({purchaseInbound:user.account_type,width,fourSections:true,overflow,errors});await page.close();
 }
 return results;
}
