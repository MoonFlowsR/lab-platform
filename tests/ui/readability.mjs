import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

export async function assertSingleLine(node, message) {
  const geometry = await node.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
    // Font fallback can produce several glyph runs on one visual line.
    const lines = [];
    for (const rect of rects) {
      const line = lines.find(value => Math.min(value.bottom, rect.bottom) > Math.max(value.top, rect.top));
      if (line) { line.top = Math.max(line.top, rect.top); line.bottom = Math.min(line.bottom, rect.bottom); }
      else lines.push({ top: rect.top, bottom: rect.bottom });
    }
    const box = element.getBoundingClientRect();
    return { lines: lines.length, fits: rects.every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1), text: element.textContent, width: box.width };
  });
  assert.equal(geometry.lines, 1, `${message}: ${JSON.stringify(geometry)}`);
  assert(geometry.fits, `${message} must fit its field: ${JSON.stringify(geometry)}`);
}

export async function checkReadability(browser, origin, out, snapshot, users) {
  const results=[];
  const student={...users[2],display_name:'示例同学',student_profile:{...users[2].student_profile,responsible_teacher_name:'示例责任导师',guiding_teacher_name:'示例指导导师'}};
  for(const width of [320,768,1440])for(const user of [student,users[0]]){
    const account={...user,profile_required:false,session_token:'isolated-readability'};
    const data={...snapshot,current_account:account,accounts:[student],lab_student_name_labels:[{username:student.username,display_name:student.display_name,...student.student_profile}],lab_work_requests:snapshot.lab_work_requests.map(row=>({...row,applicant_name:row.applicant_username===student.username?student.display_name:row.applicant_name,cost_test:1250000.88}))};
    const page=await browser.newPage({viewport:{width,height:740},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(a=>sessionStorage.setItem('surface_lab_account',JSON.stringify(a)),account);
    await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();if(u.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:snapshot.lab_teacher_accounts}});if(u.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,data,revision:'readability'}});if(u.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});return route.fulfill({json:{ok:true,rows:[],total:0,comments:[]}});});
    await page.goto(origin);await page.getByTestId('task-total').waitFor();await openNavigation(page);
    if(account.account_type==='student'){
      const footer=page.locator('.workspace-sidebar-footer');
      assert.equal(await footer.locator('.workspace-avatar').textContent(),'同学');
      assert.equal(await footer.locator('.platform-person-primary').textContent(),'示例同学');
      assert.equal(await footer.locator('.platform-person-mentors').textContent(),'导师：示例责任导师、示例指导导师');
      const name=await footer.locator('.platform-person-primary').boundingBox(),mentors=await footer.locator('.platform-person-mentors').boundingBox();
      assert(mentors.y>=name.y+name.height,'Mentors start on a separate line');
      for(const node of await footer.locator('.platform-person-mentors > span').all())await assertSingleLine(node,'Do not split a mentor name');
      await page.screenshot({path:path.join(out,`readability-navigation-${width}.png`)});
      await page.locator('.platform-nav').getByRole('button',{name:'测试',exact:true}).click();await showModuleRecords(page);
      const amounts=page.locator('.platform-info.is-amount > div:last-child').filter({hasText:'¥1,250,000.88'});await amounts.first().waitFor();
      for(const node of await amounts.all())await assertSingleLine(node,'Full monetary value stays together');
    }else{
      await page.locator('.platform-nav').getByRole('button',{name:'账号管理',exact:true}).click();await showModuleRecords(page);
      const section=page.locator('main > section').filter({has:page.getByRole('heading',{name:'账号列表',exact:true})});
      const table=section.locator('.platform-table-responsive');await table.waitFor();
      assert.equal(await table.locator('.platform-mobile-records').isVisible(),width<1000);
      assert.equal(await table.locator('.platform-person-name').filter({visible:true}).first().textContent(),'示例同学（示例责任导师，示例指导导师）');
    }
    await page.screenshot({path:path.join(out,`readability-${account.account_type}-${width}.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
    results.push({readability:true,role:account.account_type,width,overflow,errors});await page.close();
  }
  return results;
}
