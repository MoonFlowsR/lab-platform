import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkPurchaseChannels(browser, origin, out, snapshot, users) {
 const results=[],student=users.find(u=>u.account_type==='student'),teacher=users.find(u=>u.account_type==='teacher');
 const history=[{id:'change-1',created_at:'2026-10-18T01:00:00Z',before:'示例最初渠道',after:'示例旧渠道',operator_name:student.display_name,reason:'首次核对'},
 {id:'change-2',created_at:'2026-10-19T01:00:00Z',before:'示例旧渠道',after:'示例新渠道',operator_name:student.display_name,reason:'核对采购凭证',synced_at:'2026-10-19T02:00:00Z'}];
 const purchase={...snapshot.lab_purchase_requests[0],applicant_username:student.username,applicant_name:student.display_name,review_teacher_username:teacher.username,review_teacher_name:teacher.display_name,status:'已完成',received_status:'已入库',preferred_supplier:'示例新渠道',supplier_change_history:history};
 const batch={...snapshot.lab_material_batches[0],supplier:'示例新渠道',supplier_change_history:history};
 for(const width of [1440,390,320])for(const user of users){
  const account={...user,profile_required:false,session_token:'synthetic-channels'},errors=[];
  const page=await browser.newPage({viewport:{width,height:960}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(a=>sessionStorage.setItem('surface_lab_account',JSON.stringify(a)),account);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data:{...snapshot,current_account:account,lab_purchase_requests:[purchase],lab_material_batches:[batch]},revision:'channels-fixture'}});
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   return route.fulfill({json:{ok:true,rows:[],total:0}});
  });
  await page.goto(origin);await page.locator('.platform-nav').waitFor({state:'attached'});
  for(const tab of ['采购','库存']){
   await openNavigation(page);await page.locator('.platform-nav button').filter({hasText:tab}).click();await showModuleRecords(page);
   if(tab==='库存'){
    await page.locator('.platform-stock-group > summary').click();
    await page.locator('summary:visible').filter({hasText:/^查看明细$/}).first().click();
   }
   const details=page.locator('.platform-supplier-history:visible').first();await details.waitFor();
   assert.equal(await details.getAttribute('open'),null,'History starts collapsed');
   await details.locator(':scope > summary').click();
   assert.equal(await details.locator('.platform-supplier-change').count(),1);
   const latest=await details.innerText();for(const text of ['修改前：示例旧渠道','修改后：示例新渠道',student.display_name,'核对采购凭证','补同步于'])assert(latest.includes(text));
   await details.getByRole('button',{name:/^展开其余 \d+ 条$/}).click();assert.equal(await details.locator('.platform-supplier-change').count(),2);
   assert((await details.innerText()).includes('示例最初渠道'));
   await details.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`channels-${user.account_type}-${width}-${tab}.png`)});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false);assert.deepEqual(errors,[]);results.push({role:user.account_type,width,supplierHistory:tab,overflow,errors});
  }
  await page.close();
 }
 return results;
}
