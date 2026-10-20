import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkFinance(browser,origin,out,snapshot,users){
 const results=[],finance={username:'qa-finance',display_name:'示例财务',_id:55,account_type:'finance',status:'active',profile_required:false,session_token:'synthetic-finance'};
 const [admin,teacher,student]=users;
 for(const width of [1440,390,320])for(const person of [finance,teacher,student,admin]){
  const account={...person,profile_required:false,session_token:'synthetic-fixture'},role=account.account_type;
  const types=['测试','加工','维修','采购'];
  let revision=0,changes=0,failNext=false;
  const records=types.flatMap((type,t)=>[
   {_id:String(8000+t*10),public_id:`QA-FIN-${t}-0`,status:'待教师审核'},
   {_id:String(8001+t*10),public_id:`QA-FIN-${t}-1`,status:'已关闭',settlement_status:'已开票'},
   {_id:String(8002+t*10),public_id:`QA-FIN-${t}-2`,status:'已完成'},
   {_id:String(8003+t*10),public_id:`QA-FIN-${t}-3`,status:'已完成',settlement_status:'已挂账'},
   {_id:String(8004+t*10),public_id:`QA-FIN-${t}-4`,status:'已完成',settlement_status:'已开票',completion_modified:true,inbound_modified:true},
  ].map((row,i)=>({...row,...(type==='采购'?{}:{request_type:type}),material_name:'报销核对材料',work_content:'报销核对'+type,external_unit:'报销核对机构',preferred_supplier:'报销核对单位',applicant_name:student.display_name,applicant_username:student.username,review_teacher_username:teacher.username,created_at:`2026-10-${10+i}T00:00:00Z`,updated_at:'version-0',estimated_price:100,actual_total_price:type==='采购'?25:undefined,cost_test:25,cost_processing:25,cost_repair:25,quantity:1,unit:'件'})));
  const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'finance-'+(++revision),data:{...snapshot,current_account:account,lab_work_requests:records.filter(row=>row.request_type),lab_purchase_requests:records.filter(row=>!row.request_type),lab_student_accounts:[student],lab_registered_teacher_accounts:[teacher],lab_accounts:[teacher],accounts:[...snapshot.accounts,finance],lab_user_hidden_records:[]}}});
   if(url.pathname==='/api/ops/setReimbursementStatus'){
    const payload=route.request().postDataJSON(),row=records.find(row=>row._id===payload.id);assert.equal(role,'finance');assert(row);assert.equal(payload.expected_updated_at,row.updated_at);assert.equal(payload.collection,row.request_type?'lab_work_requests':'lab_purchase_requests');
    assert.deepEqual(Object.keys(payload).sort(),['collection','expected_updated_at','id','reimbursed']);
    if(failNext){failNext=false;return route.fulfill({status:400,json:{ok:false,message:'工单已更新，请同步后重试。'}});}
    changes++;Object.assign(row,{reimbursed:payload.reimbursed,reimbursed_by:payload.reimbursed?finance.display_name:'',updated_at:'version-'+changes});
    return route.fulfill({json:{ok:true,record:row}});
   }
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(url.pathname==='/api/help-comments/session')return route.fulfill({json:{ok:true,account,student_name_labels:[]}});
   return route.fulfill({json:{ok:true,rows:[],total:0,comments:[]}});
  });
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status > span')?.textContent.includes('同步状态：同步完成'));
  const tabName=type=>type==='采购'?(role==='teacher'?'采购审核':role==='student'?'采购/入库':'采购记录'):type+(role==='teacher'?'审核':role==='student'?'':'记录');
  if(role==='finance'){
   assert.match(await page.locator('.platform-sync-status').innerText(),/财务账号/);
   assert.match(await page.locator('.platform-metric-scope').innerText(),/团队全部申请/);
   assert.equal(await page.locator('.platform-nav').getByRole('button',{name:'账号管理',exact:true}).count(),0);
   assert.equal(await page.getByRole('checkbox').count(),4);
   await page.getByRole('checkbox').first().check();await page.waitForFunction(()=>document.querySelector('input[type="checkbox"]')?.checked);await page.getByRole('button',{name:'手动同步',exact:true}).waitFor({state:'visible'});
  }else assert.equal(await page.getByRole('checkbox').count(),0);
  for(const [t,type]of types.entries()){
   await page.locator('.platform-nav').getByRole('button',{name:tabName(type),exact:true}).click();
   const modified=page.locator('main > .platform-section-modified');await modified.locator('h3').first().waitFor();
   if(role==='finance'){
    assert.equal(await page.getByRole('button',{name:/^新建/}).count(),0);assert.equal(await page.getByRole('button',{name:/^(同意|驳回|确认完成|确认到货并入库|从我的列表隐藏)$/}).count(),0);
    assert.equal(await page.getByPlaceholder('搜索或选择查看范围').count(),0);assert.equal(await modified.getByRole('checkbox').count(),1);const check=modified.getByRole('checkbox');
    if(await check.isChecked())await check.uncheck();
    await check.check();await page.waitForFunction(id=>document.querySelector(`input[aria-label="已报销 ${id}"]`)?.checked,'QA-FIN-'+t+'-4');
    await page.waitForFunction(()=>!document.querySelector('.platform-reimbursement-check input:disabled'));
    assert.equal(records.find(row=>row._id===String(8004+t*10)).reimbursed,true);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*CSV/}).first().click();const csv=await fs.readFile(await(await download).path(),'utf8');assert(csv.includes('报销状态'));assert(csv.includes('已报销'));assert(csv.includes('未报销'));assert(csv.includes('示例财务'));
    await check.uncheck();await page.waitForFunction(()=>!document.querySelector('.platform-reimbursement-check input:disabled'));assert.equal(await check.isChecked(),false);
    if(t===0){failNext=true;await check.check();const dialog=page.getByRole('dialog');await dialog.getByText('工单已更新，请同步后重试。',{exact:true}).waitFor();await dialog.getByRole('button',{name:'知道了',exact:true}).click();assert.equal(await check.isChecked(),false);}
    if(width<641 && await page.getByRole('button',{name:/展开筛选/}).count())await page.getByRole('button',{name:/展开筛选/}).click();
    assert.equal(await page.getByPlaceholder('搜索或选择学生姓名').count(),1);assert.equal(await page.getByPlaceholder('搜索或选择教师姓名').count(),0);
    assert.equal(await page.getByPlaceholder('搜索或选择'+(type==='采购'?'采购单位':type==='维修'?'维修人员单位':type+'机构')).count(),1);
    await modified.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`finance-${type}-${width}.png`)});
   }else{assert.equal(await page.getByRole('checkbox').count(),0);assert((await modified.innerText()).includes('未报销'));}
  }
  if(role==='finance'){
   await page.locator('.platform-nav').getByRole('button',{name:'库存',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^(修改库存|修改物品信息|开始录入现有材料|永久删除)/}).count(),0);await page.getByRole('region',{name:'当前筛选库存'}).waitFor();
   await page.locator('.platform-nav').getByRole('button',{name:'出入退库',exact:true}).click();for(const type of ['入库','出库','退库'])assert.equal(await page.getByRole('heading',{name:new RegExp('^'+type+'历史')}).count(),1);assert.equal(await page.getByRole('button',{name:/^(同意出库|驳回出库|新增记录)$/}).count(),0);
   await page.locator('.platform-nav').getByRole('button',{name:'数据报表',exact:true}).click();await page.getByRole('region',{name:'测试统计',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').count(),1);
   const finalAmount=page.getByRole('region',{name:'测试统计',exact:true}).locator('.platform-business-footer').innerText();await page.getByRole('checkbox').check();await page.waitForFunction(()=>!document.querySelector('.platform-reimbursement-check input:disabled'));assert.equal(await page.getByRole('checkbox').isChecked(),true);assert.equal(await finalAmount,await page.getByRole('region',{name:'测试统计',exact:true}).locator('.platform-business-footer').innerText());
   await page.goto(origin+'/help');await page.getByRole('heading',{name:'01 财务总览与查看',exact:true}).waitFor();assert.equal(await page.getByText('平台代码已在Github开源 ↗',{exact:true}).count(),1);
  }
  results.push({financeRole:true,role,width,reimbursementChanges:changes,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors});assert.deepEqual(errors,[]);await page.close();
 }
 return results;
}
