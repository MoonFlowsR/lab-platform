import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkRegistration(browser,origin,out){
 const results=[];
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[];let submitted=0,protectedReads=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/register'){
    const body=route.request().postDataJSON();submitted++;assert.equal(body.account_type,'finance');assert.equal(body.username,'示例财务');assert.equal(body.teacher_code,'');assert.equal(body.admin_code,'');assert.equal(body.student_code,'');
    if(body.finance_code!=='synthetic-finance-code')return route.fulfill({status:400,json:{ok:false,message:'财务注册码错误，不能注册财务账号。'}});
    return route.fulfill({json:{ok:true,pending:true,account:{username:body.username,account_type:'finance',status:'pending'},message:'账号已提交注册，待管理员审核通过后才能登录。'}});
   }
   if(url.pathname==='/api/ops/listAll')protectedReads++;
   return route.fulfill({json:{ok:true}});
  });
  await page.goto(origin+'/?register=1');const role=page.getByPlaceholder('搜索或选择账号类型');await role.waitFor();
  await role.fill('');assert.equal(await page.getByRole('option').count(),4);
  for(const label of ['学生','教师','管理员','财务']){
   await role.fill(label);assert.equal(await page.getByRole('option').count(),1);await page.getByRole('option',{name:label+'账号',exact:true}).click();assert.equal(await page.getByRole('option').count(),0);
   assert.equal(await page.locator('label').filter({hasText:label+'注册码'}).count(),1);
   for(const other of ['学生','教师','财务','管理员'].filter(item=>item!==label))assert.equal(await page.locator('label').filter({hasText:other+'注册码'}).count(),0);
  }
  await page.locator('form input').first().fill('示例财务');await page.getByPlaceholder('至少 6 位').fill('synthetic-password');
  const code=page.locator('label').filter({hasText:'财务注册码'}).locator('input');
  await page.getByRole('button',{name:'注册',exact:true}).click();assert.equal(await code.evaluate(element=>element.validity.valueMissing),true);assert.equal(submitted,0);
  await code.fill('synthetic-wrong-code');await page.getByRole('button',{name:'注册',exact:true}).click();await page.getByRole('dialog').getByText('财务注册码错误，不能注册财务账号。',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'知道了'}).click();
  await code.fill('synthetic-finance-code');await page.screenshot({path:path.join(out,`finance-registration-${width}.png`)});
  await page.getByRole('button',{name:'注册',exact:true}).click();await page.getByRole('status').getByText('账号已提交注册，待管理员审核通过后才能登录。',{exact:true}).waitFor();
  assert.equal(submitted,2);assert.equal(protectedReads,0,'Pending registration never opens protected pages');assert.equal(await page.locator('.platform-nav').count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('surface_lab_account')),null);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);results.push({registration:true,width,submitted,overflow,errors});await page.close();
 }
 return results;
}
