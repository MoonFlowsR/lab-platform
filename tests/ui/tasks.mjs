import assert from 'node:assert/strict';
import path from 'node:path';
import { readWorkbookText } from './workbook.mjs';

export async function checkTasks(browser, origin, out, base, users) {
  const [admin, teacher, student] = users, finance = { username:'example-finance',display_name:'示例财务',account_type:'finance' };
  const results = [];
  for (const width of [1440,390,320]) for (const user of [student,teacher,finance,admin]) {
    const role=user.account_type,account={...user,default_view_scope:role==='teacher'?'all':undefined,profile_required:false,session_token:'task-fixture'};
    const records=['测试','加工','维修','采购'].flatMap((type,t)=>['待教师审核',type==='采购'?'待入库':'已通过','已驳回','已撤回','已完成','已完成','已完成','待教师审核'].map((status,i)=>({
      _id:100+t*10+i,public_id:`QA-TASK-${t}-${i}`,request_type:type==='采购'?undefined:type,work_content:'待办核对'+type+i,material_name:'待办核对材料'+i,
      applicant_username:i===7?'other-student':student.username,applicant_name:i===7?'其他示例学生':student.display_name,review_teacher_username:i===7?'other-teacher':teacher.username,
      status,created_at:'2026-10-21T00:00:00Z',updated_at:'task-version',external_unit:'待办机构',preferred_supplier:'待办供应商',workload_quantity:1,workload_unit:'次',
      cost_test:25,cost_processing:25,cost_repair:25,actual_total_price:25,estimated_price:100,quantity:1,unit:'件',completion_modified:i===4,inbound_modified:i===4,
      settlement_status:i===4?'已开票':i===5?'已挂账':'',reimbursed:i===5,completion_original:i===4?{cost_test:100,cost_processing:100,cost_repair:100}:undefined,
    })));
    records.push({...records[0],_id:901,public_id:'QA-HIDDEN-TODO',work_content:'隐藏的待审申请'});
    const pendingAccounts=[{...base.lab_student_accounts[0],id:8001,_id:8001,username:'new-account-a',display_name:'待启用甲',status:'pending'},{...teacher,id:8002,_id:8002,username:'new-account-b',display_name:'待启用乙',status:'pending'}];
    const stockRequests=[{_id:2001,public_id:'QA-STOCK-1',status:'待采购人审批',purchaser_username:student.username,applicant_username:'another',material_name:'待审批出库物品'},
      {_id:2002,public_id:'QA-STOCK-2',status:'已同意待出库',applicant_username:student.username,purchaser_username:'another',material_name:'待登记出库物品'},
      {_id:2003,public_id:'QA-STOCK-3',status:'待采购人审批',purchaser_username:teacher.username,applicant_username:student.username,material_name:'待教师批准出库物品'}];
    const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),errors=[];let revision=0,failNext=false;
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
      if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
      if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'tasks-'+(++revision),data:{...base,current_account:account,accounts:[...base.accounts,...pendingAccounts],lab_work_requests:records.filter(row=>row.request_type),lab_purchase_requests:records.filter(row=>!row.request_type),lab_stock_out_requests:stockRequests,lab_user_hidden_records:[{target_collection:'lab_work_requests',target_id:901}],lab_material_batches:[{...base.lab_material_batches[0],_id:701,expiry_date:'2020-01-01',current_qty:2},{...base.lab_material_batches[0],_id:702,current_qty:0,expiry_date:'长期'}]}}});
      const action=url.pathname.split('/').at(-1),payload=route.request().postDataJSON();
      if(['reviewWorkRequest','completeWorkRequest','setReimbursementStatus','adminSetAccountStatus'].includes(action)){
        if(failNext){failNext=false;return route.fulfill({status:400,json:{ok:false,message:'示例失败：请重试。'}});}
        if(action==='adminSetAccountStatus'){pendingAccounts.find(row=>row.id===payload.id).status=payload.status;return route.fulfill({json:{ok:true}});}
        const row=records.find(row=>row._id===payload.id);assert(row);
        if(action==='reviewWorkRequest'){assert.equal(role,'teacher');assert.equal(row.review_teacher_username,account.username);row.status=payload.next_status;}
        if(action==='completeWorkRequest'){assert.equal(role,'student');assert.equal(row.applicant_username,account.username);assert.equal(payload.settlement_status,'已挂账');Object.assign(row,payload.patch,{status:'已完成',settlement_status:payload.settlement_status});}
        if(action==='setReimbursementStatus'){assert.equal(role,'finance');assert.equal(payload.expected_updated_at,row.updated_at);row.reimbursed=payload.reimbursed;}
        return route.fulfill({json:{ok:true,record:row}});
      }
      return route.fulfill({json:{ok:true,rows:[],total:0,comments:[]}});
    });
    await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status')?.textContent.includes('同步状态：同步完成'));
    const expected={student:14,teacher:6,finance:4,admin:2}[role],header=page.locator('.platform-task-entry');
    assert.equal(await page.getByTestId('task-total').innerText(),String(expected));assert.equal(await header.locator('b').innerText(),String(expected));
    assert.equal(await page.locator('.platform-business-metrics').count(),0);
    assert.equal(await page.getByRole('button',{name:'同意',exact:true}).count(),0);
    await page.screenshot({path:path.join(out,`tasks-overview-${role}-${width}.png`),fullPage:true});
    await page.getByRole('textbox',{name:'搜索记录',exact:true}).fill('无匹配的待办');
    assert.equal(await page.locator('.platform-task-grid button').count(),0);assert.equal(await header.locator('b').innerText(),String(expected));await header.click();
    const modules = await page.locator('.platform-nav button:has(.platform-nav-task-count)').evaluateAll(buttons => buttons.map(button => ({ label:button.getAttribute('aria-label'), count:Number(button.querySelector('.platform-nav-task-count').textContent) })));
    for (const module of modules) {
      await page.getByRole('textbox',{name:'搜索记录',exact:true}).fill('上一个页面的搜索');
      await page.locator('.platform-nav').getByRole('button',{name:module.label,exact:true}).click();
      const queue=page.getByRole('region',{name:'当前待办筛选',exact:true});await queue.waitFor();
      assert.match(await queue.innerText(),new RegExp(`${module.count} 条`));
      assert.equal(await page.getByRole('heading',{name:/待办事项/}).count(),1,'Task title is shown once');
      assert.equal(await page.locator('.platform-task-caption').count(),0);
      assert.equal(await page.getByRole('textbox',{name:'搜索记录',exact:true}).inputValue(),'');
      assert.equal(await page.locator('.platform-filter-panel').count(),0);
      const queuedRows=module.label.includes('账号')?page.locator('#account-list-rows tbody tr'):module.label.includes('库')&&!module.label.includes('采购')?page.locator('.platform-stock-request'):page.locator('main .platform-request-record');
      assert.equal(await queuedRows.count(),module.count,'Module badge must open every actionable record, across stages');
      if(role==='student'&&module.label==='测试') {
        assert.equal(await page.getByRole('button',{name:'确认完成',exact:true}).count(),1);
        assert.equal(await page.getByRole('button',{name:'修改/重新提交',exact:true}).count(),2);
        assert.equal(await page.getByRole('button',{name:'关闭工单',exact:true}).count(),1);
      }
      assert.equal(await page.locator('main > .platform-section-create').count(),0);
      if(module===modules[0])await page.screenshot({path:path.join(out,`tasks-nav-${role}-${width}.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await queue.getByRole('button',{name:'查看本模块全部记录',exact:true}).click();
      assert.equal(await page.locator('.platform-task-filter').count(),0);
      await page.locator('.platform-nav').getByRole('button',{name:module.label,exact:true}).click();
      await page.getByRole('region',{name:'当前待办筛选',exact:true}).waitFor();
      await header.click();
    }
    const id={student:'test-complete',teacher:'test-review',finance:'test-reimburse',admin:'accounts-pending'}[role];
    const count={student:1,teacher:2,finance:1,admin:2}[role];
    const link=page.locator(`[data-task="${id}"]`);await link.focus();await page.keyboard.press('Enter');
    await page.getByRole('region',{name:'当前待办筛选',exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'搜索记录',exact:true}).inputValue(),'');
    assert.equal(await page.locator('.platform-filter-panel').count(),0);
    const rows=role==='admin'?page.locator('#account-list-rows tbody tr'):page.locator('main > section .platform-request-record');
    assert.equal(await rows.count(),count,'Task mode opens all corresponding records');
    assert.equal(await page.locator('main > .platform-section-create').count(),0);
    if(role==='teacher')assert.equal(await page.getByRole('button',{name:'同意',exact:true}).count(),2,'Hidden pending records stay reachable from tasks');
    const downloading=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*Excel/}).first().click();const xlsx=await readWorkbookText(await(await downloading).path());
    assert(xlsx.includes(role==='admin'?'待启用甲':role==='teacher'?'隐藏的待审申请':'待办核对测试'));assert(!xlsx.includes('待办核对测试7'));
    await page.screenshot({path:path.join(out,`tasks-detail-${role}-${width}.png`),fullPage:true});
    if(role==='teacher'){
      failNext=true;await page.getByRole('button',{name:'同意',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'确认同意',exact:true}).click();
      const error=page.getByRole('dialog');await error.getByText('示例失败：请重试。',{exact:true}).waitFor();await error.getByRole('button',{name:'知道了',exact:true}).click();assert.equal(await header.locator('b').innerText(),String(expected));
      await page.getByRole('button',{name:'同意',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'确认同意',exact:true}).click();
    }else if(role==='student'){
      await page.getByRole('button',{name:'确认完成',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('请选择',{exact:true}).fill('已挂账');await dialog.getByRole('option',{name:'已挂账',exact:true}).click();await dialog.getByRole('button',{name:'确认完成',exact:true}).click();
    }else if(role==='finance')await page.getByRole('checkbox').check();
    else{await page.getByRole('button',{name:'审核通过',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();}
    await page.waitForFunction(value=>document.querySelector('.platform-task-entry b')?.textContent===String(value),expected-1);
    if(count===1)await page.getByText('此项待办已处理完毕。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'查看本模块全部记录',exact:true}).click();assert.equal(await page.locator('.platform-task-filter').count(),0);
    if(role==='student'||role==='teacher'){assert.equal(await page.getByPlaceholder('搜索或选择查看范围').inputValue(),'全部');}
    await header.click();
    if(role==='student'||role==='teacher'){
      await page.locator('[data-task="stock-review"]').click();assert.equal(await page.locator('.platform-stock-request').count(),1);
      const download=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*Excel/}).first().click();
      const workbook=await readWorkbookText(await(await download).path());assert(workbook.includes(role==='student'?'待审批出库物品':'待教师批准出库物品'));assert(!workbook.includes('待登记出库物品'));
      await header.click();
    }
    if(role==='admin'){
      await page.locator('[data-task="test-team-review"]').click();assert.equal(await page.locator('main .platform-request-record').count(),3);assert.equal(await page.getByRole('button',{name:'同意',exact:true}).count(),0);await header.click();
    }
    await page.locator('[data-task="inventory-expired"]').click();
    assert.match(await page.getByRole('region',{name:'当前待办筛选'}).innerText(),/已过期 1 批/);
    assert.equal(await page.locator('.platform-stock-group').count(),1);
    await page.getByRole('button',{name:'返回待办',exact:true}).click();
    if(role==='finance'||role==='admin'){await page.getByRole('button',{name:'统计与导出',exact:true}).click();await page.getByRole('heading',{name:'数据报表',exact:true}).waitFor();assert.equal(await page.locator('.platform-business-metrics').count(),1);}
    assert.deepEqual(errors,[]);
    await page.goto(origin+'/help');await page.locator('.help-page').waitFor();
    assert.equal(await page.getByText('导出 Excel：首行自带筛选并冻结表头。',{exact:true}).count(),0);
    results.push({roleTasks:true,role,width,actionCount:expected,navQueues:modules.length,focusQueue:true,liveDecrement:true,reportSeparated:true,helpNoteRemoved:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors});await page.close();
  }
  return results;
}
