import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readWorkbookText } from './workbook.mjs';
import { createStudentNameDisplay } from '../../src/features/accounts/student-name-display.js';
import { studentFilterOptions } from '../../src/shared/lib/student-filter.js';

async function taskFilters(page, role, { expand = false, checkEntry = false } = {}) {
  const panel = page.locator(role === 'student' ? '.platform-module-filters' : '.platform-filter-panel');
  assert.equal(await panel.count(), 1, 'Task mode retains the role’s existing record filters');
  await panel.waitFor({ state: 'visible' });
  if (checkEntry) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => ({
      toolsTop: document.getElementById('platform-record-tools').getBoundingClientRect().top,
      headerBottom: document.querySelector('.workspace-topbar').getBoundingClientRect().bottom,
      height: innerHeight,
      focusedTask: document.activeElement?.id === 'platform-task-results',
    }));
    assert(geometry.toolsTop >= geometry.headerBottom - 2 && geometry.toolsTop < geometry.height / 2,
      'Entering a task keeps the search/filter entry below the sticky header: ' + JSON.stringify(geometry));
    assert.equal(geometry.focusedTask, true, 'The selected task is still announced by keyboard focus');
  }
  if (expand && role !== 'student') {
    const toggle = panel.getByRole('button', { name: '展开筛选', exact: true });
    if (await toggle.count()) await toggle.click();
  }
  return panel;
}

async function selectDiagnostic(page, label) {
  return page.evaluate(placeholder => {
    const input = [...document.querySelectorAll('input[role="combobox"]')].find(node => node.placeholder === placeholder);
    const menu = input && document.getElementById(input.getAttribute('aria-controls'));
    const active = document.activeElement;
    return {
      input: input && { value: input.value, expanded: input.getAttribute('aria-expanded'), controls: input.getAttribute('aria-controls') },
      menu: menu && { id: menu.id, visible: Boolean(menu.getClientRects().length), options: [...menu.querySelectorAll('[role="option"]')].map(node => ({ label: node.textContent, selected: node.getAttribute('aria-selected') })) },
      focus: active && { tag: active.tagName, role: active.getAttribute('role'), placeholder: active.getAttribute('placeholder'), text: active.textContent?.slice(0, 160) },
    };
  }, '搜索或选择' + label);
}

function personFilterLabel(options, account) {
  const matches = options.filter(option => option.username === account.username);
  assert.equal(matches.length, 1, 'The requested filter identity must map to exactly one account: ' + account.username);
  assert.equal(options.filter(option => option.label === matches[0].label).length, 1, 'The displayed account option must be unambiguous');
  return matches[0].label;
}

async function waitForResetPeople(page, panel) {
  for (const label of ['学生姓名', '教师姓名']) {
    const input = panel.getByPlaceholder('搜索或选择' + label, { exact: true });
    if (!await input.count()) continue;
    const handle = await input.elementHandle();
    try {
      await page.waitForFunction(node => node.value === '全部' && node.getAttribute('aria-expanded') === 'false', handle);
      const menu = page.locator('[id="' + await input.getAttribute('aria-controls') + '"]');
      await menu.waitFor({ state: 'hidden' });
    } catch (error) {
      error.message += '\nReset select state: ' + JSON.stringify({ label, ...await selectDiagnostic(page, label) });
      throw error;
    } finally {
      await handle?.dispose();
    }
  }
}

async function chooseSearchable(page, panel, label, text) {
  const input = panel.getByPlaceholder('搜索或选择' + label, { exact: true });
  try {
    await input.fill(text);
    const menu = page.locator('[id="' + await input.getAttribute('aria-controls') + '"]');
    await menu.waitFor({ state: 'visible' });
    await menu.getByRole('option', { name: text, exact: true }).click();
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), text, 'The selected filter displays the exact account or institution label');
    assert.equal(await input.getAttribute('aria-expanded'), 'false', 'Selection closes the dropdown');
  } catch (error) {
    error.message += '\nSelect state: ' + JSON.stringify({ label, expected: text, ...await selectDiagnostic(page, label) });
    throw error;
  }
}

async function exportTask(page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出.*Excel/ }).first().click();
  return readWorkbookText(await (await download).path());
}

async function detailFilters(page, role, rows, count, studentLabel, otherStudentLabel, teacherLabel) {
  const panel = await taskFilters(page, role, { expand: true });
  const queue = page.getByRole('region', { name: '当前待办筛选', exact: true });
  const title = await queue.innerText();
  const reset = async () => {
    await panel.getByRole('button', { name: role === 'student' ? '重置时间' : '重置筛选', exact: true }).click();
    await rows.first().waitFor({ state: 'attached' });
    assert.equal(await rows.count(), count, 'Reset restores only the current task set');
    assert.equal(await queue.innerText(), title, 'Reset does not exit or broaden the task category');
    await waitForResetPeople(page, panel);
  };
  await panel.getByRole('combobox', { name: /^(申请日期|登记日期|建库日期|创建 \/ 操作日期)$/ }).selectOption('custom');
  await panel.locator('label').filter({ hasText: /^开始日期/ }).locator('input[type="date"]').fill('2050-01-01');
  await panel.locator('label').filter({ hasText: /^结束日期/ }).locator('input[type="date"]').fill('2050-01-02');
  assert.equal(await rows.count(), 0, 'Date filters intersect the task records');
  await reset();
  if (role !== 'student') {
    await chooseSearchable(page, panel, '学生姓名', otherStudentLabel);
    assert.equal(await rows.count(), 0, 'Student filters do not expose records outside this task');
    await reset();
    await chooseSearchable(page, panel, '学生姓名', studentLabel);
    assert.equal(await rows.count(), role === 'admin' ? 0 : count, 'Student filtering matches the record owner');
    await reset();
  }
  if (role === 'admin') {
    await chooseSearchable(page, panel, '教师姓名', teacherLabel);
    assert.equal(await rows.count(), 0, 'Teacher filtering cannot reveal an active account outside the pending task');
    await reset();
  }
  if (role === 'teacher') {
    await chooseSearchable(page, panel, '测试机构', '待办机构');
    assert.equal(await rows.count(), 1, 'Institution filtering narrows the two assigned review tasks');
    const workbook = await exportTask(page);
    assert(workbook.includes('QA-TASK-0-0') && !workbook.includes('QA-HIDDEN-TODO') && !workbook.includes('QA-TASK-0-7'),
      'Task export includes exactly the filtered institution and assigned reviewer');
    await reset();
  }
  if (role === 'finance') {
    await chooseSearchable(page, panel, '测试机构', '已报销机构');
    assert.equal(await rows.count(), 0, 'An institution cannot bring a reimbursed record into a reimbursement task');
    await reset();
    const status = panel.getByRole('combobox', { name: '工单状态', exact: true });
    await status.selectOption('已挂账');
    assert.equal(await rows.count(), 0, 'Financial status is an intersection, not a replacement for reimbursement eligibility');
    await status.selectOption('已开票');
    assert.equal(await rows.count(), count);
    const workbook = await exportTask(page);
    assert(workbook.includes('QA-TASK-0-4') && !workbook.includes('QA-TASK-0-5'), 'Financial task export excludes reimbursed records');
    await reset();
  }
}

export async function checkTasks(browser, origin, out, base, users) {
  const [admin, teacher, student] = users, finance = { username:'example-finance',display_name:'示例财务',account_type:'finance' };
  const displayed = createStudentNameDisplay()(base);
  const studentOptions = studentFilterOptions(displayed.lab_student_accounts || []);
  const teacherOptions = studentFilterOptions(displayed.lab_teacher_accounts || []);
  const studentLabel = personFilterLabel(studentOptions, student);
  const otherStudentLabel = personFilterLabel(studentOptions, base.lab_student_accounts.find(row => row.username !== student.username));
  const teacherLabel = personFilterLabel(teacherOptions, teacher);
  const results = [];
  for (const width of [1440,390,320]) for (const user of [student,teacher,finance,admin]) {
    const role=user.account_type,account={...user,default_view_scope:role==='teacher'?'all':undefined,profile_required:false,session_token:'task-fixture'};
    const records=['测试','加工','维修','采购'].flatMap((type,t)=>['待教师审核',type==='采购'?'待入库':'已通过','已驳回','已撤回','已完成','已完成','已完成','待教师审核'].map((status,i)=>({
      _id:100+t*10+i,public_id:`QA-TASK-${t}-${i}`,request_type:type==='采购'?undefined:type,work_content:'待办核对'+type+i,material_name:'待办核对材料'+i,
      applicant_username:i===7?'other-student':student.username,applicant_name:i===7?'其他示例学生':student.display_name,review_teacher_username:i===7?'other-teacher':teacher.username,
      status,created_at:'2026-10-21T00:00:00Z',updated_at:'task-version',external_unit:i===5?'已报销机构':'待办机构',preferred_supplier:i===5?'已报销供应商':'待办供应商',workload_quantity:1,workload_unit:'次',
      cost_test:25,cost_processing:25,cost_repair:25,actual_total_price:25,estimated_price:100,quantity:1,unit:'件',completion_modified:i===4,inbound_modified:i===4,
      settlement_status:i===4?'已开票':i===5?'已挂账':'',reimbursed:i===5,completion_original:i===4?{cost_test:100,cost_processing:100,cost_repair:100}:undefined,
    })));
    records.push({...records[0],_id:901,public_id:'QA-HIDDEN-TODO',work_content:'隐藏的待审申请',external_unit:'另一待办机构'});
    const pendingAccounts=[{...base.lab_student_accounts[0],id:8001,_id:8001,username:'new-account-a',display_name:'待启用甲',status:'pending'},{...teacher,id:8002,_id:8002,username:'new-account-b',display_name:'待启用乙',status:'pending'}];
    const stockRequests=[{_id:2001,public_id:'QA-STOCK-1',status:'待采购人审批',purchaser_username:student.username,applicant_username:'another',material_name:'待审批出库物品'},
      {_id:2002,public_id:'QA-STOCK-2',status:'已同意待出库',applicant_username:student.username,purchaser_username:'another',material_name:'待登记出库物品'},
      {_id:2003,public_id:'QA-STOCK-3',status:'待采购人审批',purchaser_username:teacher.username,applicant_username:student.username,material_name:'待教师批准出库物品'}];
    if (role !== 'student') stockRequests.push(
      {_id:2004,public_id:'QA-STOCK-4',status:'待采购人审批',purchaser_username:account.username,applicant_username:'another',material_name:'历史采购人关联物品'},
      {_id:2005,public_id:'QA-STOCK-5',status:'已同意待出库',purchaser_username:'another',applicant_username:account.username,material_name:'历史申请人关联物品'},
      {_id:2006,public_id:'QA-STOCK-6',status:'已驳回',purchaser_username:'another',applicant_username:account.username,material_name:'历史驳回关联物品'},
    );
    stockRequests.forEach(row => { row.created_at = '2026-10-21T00:00:00Z'; });
    const photoBody = Buffer.from('isolated-stock-photo');
    const stockPhotos = stockRequests.map(row => {
      row.photo_attachment_id = 5000 + row._id;
      return {_id:row.photo_attachment_id,target_collection:'lab_stock_out_requests',target_id:row._id,original_name:'示例物品特写.jpg',size_bytes:photoBody.length};
    });
    const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),errors=[];let revision=0,failNext=false;
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
      if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
      if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'tasks-'+(++revision),data:{...base,current_account:account,accounts:[...base.accounts,...pendingAccounts],lab_work_requests:records.filter(row=>row.request_type),lab_purchase_requests:records.filter(row=>!row.request_type),lab_stock_out_requests:stockRequests,lab_attachments:[...(base.lab_attachments || []),...stockPhotos],lab_user_hidden_records:[{target_collection:'lab_work_requests',target_id:901}],lab_material_batches:[{...base.lab_material_batches[0],_id:701,expiry_date:'2020-01-01',current_qty:2},{...base.lab_material_batches[0],_id:702,current_qty:0,expiry_date:'长期'},{...base.lab_material_batches[0],_id:703,purchase_category:'耗材',material_name:'无预警对照耗材',current_qty:5,expiry_date:'长期'}]}}});
      if(url.pathname.startsWith('/api/attachments/download/')) {
        assert(stockPhotos.some(photo => String(photo._id) === url.pathname.split('/').at(-1)));
        return route.fulfill({contentType:'image/jpeg',body:photoBody});
      }
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
    const expected={student:10,teacher:5,finance:4,admin:2}[role],header=page.locator('.platform-task-entry');
    assert.equal(await page.getByTestId('task-total').innerText(),String(expected));assert.equal(await header.locator('b').innerText(),String(expected));
    assert.equal(await page.locator('.platform-business-metrics').count(),0);
    assert.equal(await page.getByRole('button',{name:'同意',exact:true}).count(),0);
    await page.screenshot({path:path.join(out,`tasks-overview-${role}-${width}.png`),fullPage:true});
    await page.getByRole('searchbox',{name:'搜索记录',exact:true}).fill('无匹配的待办');
    assert.equal(await page.locator('.platform-task-grid button').count(),0);assert.equal(await header.locator('b').innerText(),String(expected));await header.click();
    const modules = await page.locator('.platform-nav button:has(.platform-nav-task-count)').evaluateAll(buttons => buttons.map(button => ({ label:button.getAttribute('aria-label'), count:Number(button.querySelector('.platform-nav-task-count').textContent) })));
    for (const module of modules) {
      await page.getByRole('searchbox',{name:'搜索记录',exact:true}).fill('上一个页面的搜索');
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:module.label,exact:true}).click();
      const queue=page.getByRole('region',{name:'当前待办筛选',exact:true});await queue.waitFor();
      assert.match(await queue.innerText(),new RegExp(`${module.count} 条`));
      assert.equal(await page.getByRole('heading',{name:/待办事项/}).count(),1,'Task title is shown once');
      assert.equal(await page.locator('.platform-task-caption').count(),0);
      assert.equal(await page.getByRole('searchbox',{name:'搜索记录',exact:true}).inputValue(),'');
      await taskFilters(page, role, { checkEntry: true });
      const queuedRows=module.label.includes('账号')?page.locator('#account-list-rows tbody tr'):module.label.includes('库')&&!module.label.includes('采购')?page.locator('.platform-stock-request'):page.locator('main .platform-request-record');
      assert.equal(await queuedRows.count(),module.count,'Module badge must open every actionable record, across stages');
      if(role==='student'&&module.label==='测试') {
        assert.equal(await page.getByRole('button',{name:'确认完成',exact:true}).count(),1);
        assert.equal(await page.getByRole('button',{name:'修改/重新提交',exact:true}).count(),1);
        assert.equal(await page.getByRole('button',{name:'关闭工单',exact:true}).count(),1);
      }
      if(role==='student'&&module.label==='出/退库') {
        for (const name of ['同意出库','驳回出库','完成出库登记','撤回出库申请']) {
          assert.equal(await page.getByRole('button',{name,exact:true}).count(),1,'Students retain their purchaser and applicant operations');
        }
      }
      assert.equal(await page.locator('main > .platform-section-create').count(),0);
      if(module===modules[0])await page.screenshot({path:path.join(out,`tasks-nav-${role}-${width}.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await queue.getByRole('button',{name:'查看本模块全部记录',exact:true}).click();
      assert.equal(await page.locator('.platform-task-filter').count(),0);
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:module.label,exact:true}).click();
      await page.getByRole('region',{name:'当前待办筛选',exact:true}).waitFor();
      await header.click();
    }
    const id={student:'test-complete',teacher:'test-review',finance:'test-reimburse',admin:'accounts-pending'}[role];
    const count={student:1,teacher:2,finance:1,admin:2}[role];
    const link=page.locator(`[data-task="${id}"]`);await link.focus();await page.keyboard.press('Enter');
    await page.getByRole('region',{name:'当前待办筛选',exact:true}).waitFor();
    assert.equal(await page.getByRole('searchbox',{name:'搜索记录',exact:true}).inputValue(),'');
    await taskFilters(page, role, { checkEntry: true });
    const rows=role==='admin'?page.locator('#account-list-rows tbody tr'):page.locator('main > section .platform-request-record');
    assert.equal(await rows.count(),count,'Task mode opens all corresponding records');
    await detailFilters(page, role, rows, count, studentLabel, otherStudentLabel, teacherLabel);
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
      await page.getByRole('button',{name:'确认完成',exact:true}).click();const dialog=page.getByRole('dialog'),status=dialog.getByRole('combobox',{name:/工单状态/});assert.equal(await status.inputValue(),'');await status.selectOption('已挂账');await dialog.getByRole('button',{name:'确认完成',exact:true}).click();
    }else if(role==='finance')await page.getByRole('checkbox').check();
    else{await page.getByRole('button',{name:'审核通过',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();}
    await page.waitForFunction(value=>document.querySelector('.platform-task-entry b')?.textContent===String(value),expected-1);
    if(count===1)await page.getByText('此项待办已处理完毕。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'查看本模块全部记录',exact:true}).click();assert.equal(await page.locator('.platform-task-filter').count(),0);
    if(role==='student'||role==='teacher'){assert.equal(await page.getByRole('combobox',{name:'查看范围',exact:true}).inputValue(),'all');}
    await header.click();
    if(role==='student'){
      await page.locator('[data-task="stock-review"]').click();assert.equal(await page.locator('.platform-stock-request').count(),1);
      assert.equal(await page.getByRole('button',{name:'同意出库',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'驳回出库',exact:true}).count(),1);
      const download=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*Excel/}).first().click();
      const workbook=await readWorkbookText(await(await download).path());assert(workbook.includes('待审批出库物品'));assert(!workbook.includes('待登记出库物品'));
      await header.click();
    } else {
      assert.equal(await page.locator('[data-task="stock-review"]').count(),0,'Non-students never receive a private-stock approval task');
      await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name:'出入退库',exact:true}).click();await showModuleRecords(page);
      const pending = page.locator('main > .platform-section-pending');
      await pending.getByRole('button',{name:'展开其余 4 条',exact:true}).click();
      assert.equal(await page.locator('.platform-stock-request').count(),stockRequests.length,'All team requests remain readable, including unrelated and historical own records');
      for (const row of stockRequests) assert.equal(await page.getByRole('heading',{name:row.material_name,exact:true}).count(),1);
      assert.equal(await page.locator('.platform-stock-request').getByRole('button',{name:/^(同意出库|驳回出库|完成出库登记|撤回出库申请|永久删除申请)$/}).count(),0);
      assert.equal(await page.getByRole('button',{name:'新增记录',exact:true}).count(),0);
      const photoDownload=page.waitForEvent('download');await page.locator('.platform-stock-request').getByRole('button',{name:'物品特写',exact:true}).first().click();
      assert.deepEqual(await fs.readFile(await(await photoDownload).path()),photoBody,'Read-only roles can still download request evidence');
      const exportDownload=page.waitForEvent('download');await pending.getByRole('button',{name:/导出.*Excel/}).click();
      const workbook=await readWorkbookText(await(await exportDownload).path());
      for (const row of stockRequests) assert(workbook.includes(row.material_name),'Export retains every team request');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,`stock-readonly-${role}-${width}.png`),fullPage:true});
      await header.click();
    }
    if(role==='admin'){
      await page.locator('[data-task="test-team-review"]').click();await page.locator('main .platform-request-record').first().waitFor();assert.equal(await page.locator('main .platform-request-record').count(),3);assert.equal(await page.getByRole('button',{name:'同意',exact:true}).count(),0);await header.click();
      await page.locator('[data-task="stock-team-review"]').click();
      const panel = await taskFilters(page, role, { expand: true, checkEntry: true });
      assert.equal(await page.locator('.platform-stock-request').count(),3);
      await chooseSearchable(page, panel, '学生姓名', studentLabel);
      assert.equal(await page.locator('.platform-stock-request').count(),1,'Stock-request student filter uses the applicant, not the movement operator');
      const matching = await exportTask(page);
      assert(matching.includes('QA-STOCK-3') && !matching.includes('QA-STOCK-1') && !matching.includes('QA-STOCK-4'));
      await panel.getByRole('combobox',{name:'出入退库类型',exact:true}).selectOption('退库');
      assert.equal(await page.locator('.platform-stock-request').count(),0);
      const empty = await exportTask(page);
      assert(!/QA-STOCK-[1-6]/.test(empty),'A non-outbound filter exports no outbound tasks');
      assert.equal(await page.getByRole('region',{name:'当前待办筛选',exact:true}).count(),1);
      await panel.getByRole('button',{name:'重置筛选',exact:true}).click();
      assert.equal(await page.locator('.platform-stock-request').count(),3);
      await header.click();
    }
    await page.locator('[data-task="inventory-expired"]').click();
    assert.match(await page.getByRole('region',{name:'当前待办筛选'}).innerText(),/已过期 1 批/);
    assert.equal(await page.locator('.platform-stock-group').count(),1);
    const inventoryPanel = await taskFilters(page, role, { expand: true, checkEntry: true });
    await inventoryPanel.getByRole('combobox',{name:'材料类别',exact:true}).selectOption('耗材');
    assert.equal(await page.locator('.platform-stock-group').count(),0,'Category cannot include healthy inventory outside the expired task');
    assert.match(await page.getByRole('region',{name:'当前待办筛选'}).innerText(),/已过期 1 批/);
    if(role==='student') await inventoryPanel.getByRole('combobox',{name:'材料类别',exact:true}).selectOption('');
    else await inventoryPanel.getByRole('button',{name:'重置筛选',exact:true}).click();
    assert.equal(await page.locator('.platform-stock-group').count(),1);
    await page.getByRole('button',{name:'返回待办',exact:true}).click();
    if(role==='finance'||role==='admin'){await page.getByRole('button',{name:'统计与导出',exact:true}).click();await page.getByRole('heading',{name:'数据报表',exact:true}).waitFor();assert.equal(await page.locator('.platform-business-metrics').count(),1);}
    assert.deepEqual(errors,[]);
    await page.goto(origin+'/help');await page.locator('.help-page').waitFor();
    assert.equal(await page.getByText('导出 Excel：首行自带筛选并冻结表头。',{exact:true}).count(),0);
    results.push({roleTasks:true,taskFilters:true,role,width,actionCount:expected,navQueues:modules.length,filterEntryVisible:true,dateIntersection:true,roleFiltersIntersect:true,resetKeepsTask:true,filteredExport:true,inventoryCategoryIntersection:true,focusQueue:true,liveDecrement:true,reportSeparated:true,helpNoteRemoved:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors});await page.close();
  }
  return results;
}
