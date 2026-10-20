import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { workbookParts } from './workbook.mjs';

export async function checkAuditClients(browser,origin,out,snapshot,admin){
 const results=[];
 const cases=[
  {name:'pc',width:1440,expected:'pc',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36'},
  {name:'phone',width:390,expected:'mobile',isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36'},
  {name:'tablet',width:820,expected:'mobile',hasTouch:true,platform:'MacIntel',userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'},
 ];
 for(const device of cases){
  const account={...admin,profile_required:false,session_token:'synthetic-audit-client'},received=[],errors=[];
  const page=await browser.newPage({viewport:{width:device.width,height:960},userAgent:device.userAgent,hasTouch:!!device.hasTouch,isMobile:!!device.isMobile,acceptDownloads:true});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({account,platform})=>{sessionStorage.setItem('surface_lab_account',JSON.stringify(account));if(platform){Object.defineProperty(navigator,'platform',{value:platform});Object.defineProperty(navigator,'maxTouchPoints',{value:5});}},{account,platform:device.platform});
  const logs=Array.from({length:25},(_,index)=>({id:index+1,created_at:'2026-10-20T00:00:00Z',operator_username:'示例操作人',operator_role:'admin',action:'login',target_type:'accounts',target_id:String(index+1),object_label:'示例对象'+index,client_type:['pc','mobile','system','unknown'][index]||'pc',client_label:['PC端','移动端','系统后台','未知'][index]||'PC端'}));
  await page.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   received.push({path:url.pathname,client:request.headers()['x-platform-client']});
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'audit-client',data:{...snapshot,current_account:account,lab_user_hidden_records:[]}}});
   if(url.pathname==='/api/ops/listAudit'){const payload=request.postDataJSON(),matching=logs.filter(row=>!payload.query||row.client_label.includes(payload.query));if(!payload.all)assert.equal(payload.limit,10);return route.fulfill({json:{ok:true,rows:payload.all?matching:matching.slice(payload.offset||0,(payload.offset||0)+10),total:matching.length}});}
   return route.fulfill({json:{ok:true,account,comments:[],student_name_labels:[],rows:[],total:0}});
  });
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status > span')?.textContent.includes('同步状态：同步完成'));
  await page.locator('.platform-nav button').getByText('账号管理',{exact:true}).click();
  const audit=page.getByRole('region',{name:'最近操作日志'});await page.waitForFunction(()=>document.querySelectorAll('[aria-label="最近操作日志"] tbody tr').length===10);assert.equal(await audit.locator('tbody tr').count(),10);
  const previous=audit.getByRole('button',{name:'上一页',exact:true}),next=audit.getByRole('button',{name:'下一页',exact:true});
  assert(await previous.isDisabled());assert((await audit.textContent()).includes('第 1 / 3 页'));
  for(const label of ['PC端','移动端','系统后台','未知'])assert(await audit.getByText(label,{exact:true}).filter({visible:true}).count()>0);
  await next.click();await audit.getByText('示例对象10',{exact:true}).filter({visible:true}).waitFor();assert.equal(await audit.locator('tbody tr').count(),10);
  await next.click();await audit.getByText('示例对象20',{exact:true}).filter({visible:true}).waitFor();assert.equal(await audit.locator('tbody tr').count(),5);assert(await next.isDisabled());
  await previous.click();await audit.getByText('示例对象10',{exact:true}).filter({visible:true}).waitFor();assert.equal(await audit.locator('tbody tr').count(),10);
  const fullDownload=page.waitForEvent('download');await audit.getByRole('button',{name:'导出日志Excel',exact:true}).click();const allFile=await fullDownload;
  const allXml=workbookParts(await fs.readFile(await allFile.path())).get('xl/worksheets/sheet1.xml');assert(allXml.includes('autoFilter ref="A1:G26"'));assert(allXml.includes('示例对象24'));
  const search=page.getByPlaceholder('搜索页面内任意内容');await search.fill('移动端');
  await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="最近操作日志"] tbody tr')].length===1);
  assert(await previous.isDisabled());assert(await next.isDisabled());assert((await audit.textContent()).includes('第 1 / 1 页'));
  assert.equal(await audit.getByText('移动端',{exact:true}).filter({visible:true}).count(),1);
  const download=page.waitForEvent('download');await audit.getByRole('button',{name:'导出日志Excel',exact:true}).click();const file=await download;
  const xml=workbookParts(await fs.readFile(await file.path())).get('xl/worksheets/sheet1.xml');assert(xml.includes('操作端'));assert(xml.includes('移动端'));assert(!xml.includes('>PC端<'));assert(xml.includes('autoFilter ref="A1:G2"'));
  await search.fill('不存在的终端');await audit.getByText('暂无数据',{exact:true}).filter({visible:true}).waitFor();assert.equal(await audit.getByRole('button',{name:'下一页',exact:true}).count(),0);
  await search.fill('');await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="最近操作日志"] tbody tr')].length===10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await audit.screenshot({path:path.join(out,`audit-client-${device.name}.png`)});
  await page.goto(origin+'/help');await page.locator('.help-page').waitFor();await page.waitForFunction(()=>document.querySelector('.help-comment-actions'));
  assert(received.some(row=>row.path==='/api/help-comments'));assert(received.every(row=>row.client===device.expected),JSON.stringify(received));assert.deepEqual(errors,[]);
  results.push({auditClient:true,auditPagination:true,device:device.name,width:device.width,metadata:device.expected,pageSize:10,total:25,overflow:false,errors});await page.close();
 }
 return results;
}
