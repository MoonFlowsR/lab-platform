import { workbookParts } from './workbook.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';


export async function checkExcelExports(browser,origin,out,snapshot,users) {
 const results=[],finance={username:'qa-finance',display_name:'示例财务',_id:55,account_type:'finance',status:'active'};
 for(const width of [1440,320])for(const person of [...users,finance]){
  const account={...person,profile_required:false,session_token:'synthetic-export'},role=account.account_type;
  const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));let auditExports=0,downloads=0;
  const auditRows=Array.from({length:5},(_,i)=>({id:i+1,created_at:'2026-10-20T00:00:00Z',operator_username:'示例管理员',operator_role:'admin',action:'login',target_type:'accounts',target_id:String(i+1),object_label:'示例对象'}));
  await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:snapshot.lab_registered_teacher_accounts}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'excel-exports',data:{...snapshot,current_account:account,lab_user_hidden_records:[]}}});
   if(url.pathname==='/api/ops/listAudit'){const payload=route.request().postDataJSON();if(payload.all)auditExports++;return route.fulfill({json:{ok:true,rows:payload.all?auditRows:auditRows.slice(0,3),total:auditRows.length}});}
   if(url.pathname==='/api/events'){return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});}
   return route.fulfill({json:{ok:true,rows:[],total:0,comments:[]}});
  });
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status > span')?.textContent.includes('同步状态：同步完成'));
  const tabs=await page.locator('.platform-nav button').allTextContents();
  for(const tab of tabs){
   await page.locator('.platform-nav button').getByText(tab,{exact:true}).click();
   if(tab==='数据报表')await page.getByRole('heading',{name:'数据报表',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:/CSV/i}).count(),0);
   const actions=page.locator('.platform-export-button');
   for(let index=0;index<await actions.count();index++){
    const button=actions.nth(index);await button.waitFor({state:'visible'});
    await page.waitForFunction(()=>![...document.querySelectorAll('.platform-export-button')].some(button=>button.disabled));
    const pending=page.waitForEvent('download');await button.click();const downloaded=await pending;
    assert(downloaded.suggestedFilename().endsWith('.xlsx'),role+' '+tab);
    const bytes=await fs.readFile(await downloaded.path()),parts=workbookParts(bytes);
    const sheets=[...parts].filter(([file])=>file.startsWith('xl/worksheets/'));
    assert.equal(sheets.length,tab==='数据报表'?12:1);
    for(const [,sheet] of sheets){assert.match(sheet,/<autoFilter ref="A1:[A-Z]+[0-9]+"\/>/);assert(sheet.includes('topLeftCell="A2"'));assert(!sheet.includes('<f'));}
    if(await button.textContent()==='导出日志Excel')assert.match(sheets[0][1],/<autoFilter ref="A1:G6"\/>/,'Audit export includes every row, not just the three visible rows');
    if(width===320&&role==='admin')await fs.writeFile(path.join(out,`xlsx-${downloads}.xlsx`),bytes);
    downloads++;
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,role+' '+tab+' '+width);
   if(['库存','数据报表'].includes(tab))await page.screenshot({path:path.join(out,`xlsx-${role}-${width}-${tab==='库存'?'inventory':'reports'}.png`),fullPage:true});
  }
  assert(downloads>=8,role+' exports all business and inventory categories');if(role==='admin')assert.equal(auditExports,1);
  assert.deepEqual(errors,[]);results.push({excelExports:true,role,width,downloads,overflow:false,errors});await page.close();
 }
 return results;
}
