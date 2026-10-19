import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkWorkReview(browser, origin, out, snapshot, users) {
  const results=[], now=Date.now(), student=users.find(user=>user.account_type==='student'), teacher=users.find(user=>user.account_type==='teacher');
  for (const width of [1440,390,320]) for (const user of users) {
    const account={...user,profile_required:false,session_token:'synthetic-work-review'},role=user.account_type;
    const records=['测试','加工'].flatMap((type,index)=>[
      ['待教师审核',0],['已通过',1],['已完成',2],['已完成',3],['已驳回',4],['已完成',5],['已完成',6],
    ].map(([status,offset])=>({
      _id:801+index*10+offset,public_id:`QA-${index}-${offset}`,request_type:type,work_content:'同项目核对',external_unit:offset===6?'示例机构乙':'示例机构甲',
      applicant_username:student.username,applicant_name:student.display_name,review_teacher_username:teacher.username,review_teacher_name:teacher.display_name,
      status,workload_quantity:2,workload_unit:'小时',cost_test:type==='测试'?100:0,cost_processing:type==='加工'?100:0,
      completion_modified:offset===3,settlement_status:offset===3?'已挂账':undefined,
      created_at:new Date(now-(offset===5?220:offset)*86400000-60000).toISOString(),updated_at:'fixture-version',
    })));
    const page=await browser.newPage({viewport:{width,height:960},acceptDownloads:true}),submitted=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
      if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data:{...snapshot,current_account:account,lab_work_requests:records},revision:'work-fixture'}});
      if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
      if(url.pathname==='/api/ops/completeWorkRequest'){
        const payload=route.request().postDataJSON();submitted.push(payload);const row=records.find(item=>item._id===payload.id);
        Object.assign(row,payload.patch,{settlement_status:payload.settlement_status,status:'已完成'});
        return route.fulfill({json:{ok:true,record:row}});
      }
      return route.fulfill({json:{ok:true,rows:[],total:0}});
    });
    await page.goto(origin);await page.locator('.platform-nav').waitFor();
    for(const type of ['测试','加工']){
      await page.locator('.platform-nav').getByRole('button',{name:type+(role==='teacher'?'审核':role==='admin'?'记录':''),exact:true}).click();
      for(const prefix of ['待审批','已审批','已完成','完成后修改的'])await page.getByRole('heading',{name:new RegExp('^'+prefix+type+'工单')}).waitFor();
      const pending=page.locator('main > .platform-section-pending'),reviewed=page.locator('main > .platform-section-approved');
      assert.equal(await pending.locator('h3').count(),1);assert.equal(await reviewed.locator('h3').count(),1);
      if(role==='teacher'){
        const history=pending.locator('.platform-same-work-history');assert.equal(await history.getAttribute('open'),null);
        await history.locator(':scope > summary').click();assert.match(await history.locator(':scope > summary').innerText(),/（4）/);
        assert.equal(await history.locator('tbody tr').count(),4);
        if(width<640)await page.getByRole('button',{name:/展开筛选/}).click();
        const field=page.getByPlaceholder('搜索或选择'+type+'机构');await field.fill('示例机构乙');
        assert.equal(await page.getByRole('option').count(),1);await page.getByRole('option').click();assert.equal(await page.getByRole('listbox').count(),0);
        await page.getByRole('heading',{name:'已完成'+type+'工单（1）',exact:true}).waitFor();
        assert.equal(await pending.locator('h3').count(),0);
        const download=page.waitForEvent('download');await page.getByRole('button',{name:/导出.*CSV/}).first().click();
        const csv=await fs.readFile(await(await download).path(),'utf8');assert(csv.includes('示例机构乙'));assert(!csv.includes('示例机构甲'));
        await page.getByRole('button',{name:'重置筛选',exact:true}).click();
        await page.getByRole('heading',{name:'已完成'+type+'工单（3）',exact:true}).waitFor();
        if(width<640)await page.getByRole('button',{name:/收起筛选/}).click();
      }else assert.equal(await page.locator('.platform-same-work-history').count(),0);
      if(role==='student'){
        await reviewed.getByRole('button',{name:'确认完成',exact:true}).click();const dialog=page.getByRole('dialog');
        await dialog.getByRole('button',{name:'确认完成',exact:true}).click();assert.equal(submitted.length,type==='测试'?0:1);
        await dialog.getByRole('alert').waitFor();
        const field=dialog.getByPlaceholder('请选择已开票或已挂账');await field.fill('已挂账');await dialog.getByRole('option',{name:'已挂账',exact:true}).click();
        await page.screenshot({path:path.join(out,`completion-${type}-${width}.png`)});
        assert.equal(await dialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0),true);
        await dialog.getByRole('button',{name:'确认完成',exact:true}).click();await dialog.waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.querySelector('main > .platform-section-reviewed')?.textContent.includes('已挂账'));
        assert.equal(submitted.at(-1).settlement_status,'已挂账');assert.equal(submitted.at(-1).expected_updated_at,'fixture-version');
      }
      await page.screenshot({path:path.join(out,`work-review-${role}-${type}-${width}.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    assert.deepEqual(errors,[]);results.push({workReview:true,role,width,history:role==='teacher',completion:role==='student'});await page.close();
  }
  return results;
}
