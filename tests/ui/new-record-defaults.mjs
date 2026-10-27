import assert from 'node:assert/strict';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';

async function assertBlank(form){
 const controls=await form.evaluate(el=>[...el.querySelectorAll('input,select,textarea')].filter(input=>!['file','hidden'].includes(input.type)).map(input=>({type:input.type,value:input.value,checked:input.checked,required:input.required})));
 assert(controls.length>3);for(const field of controls){if(['checkbox','radio'].includes(field.type))assert(!field.checked);else assert.equal(field.value,'','Every new editable control starts empty');}
 assert.equal(await form.evaluate(el=>el.checkValidity()),false,'Required fields cannot be silently submitted with defaults');
}
async function pick(page,input,value){await input.fill(value);await page.getByRole('listbox').getByRole('option',{name:value,exact:true}).click();}

export async function checkNewRecordDefaults(browser,origin,out,snapshot,users){
 const [,teacher,student]=users,results=[];
 const history={_id:'default-history',public_id:'QA-DEFAULT-PUR',material_name:'示例历史材料',purchase_category:'试剂原料',specification:'示例已选规格',quantity:4,unit:'瓶',preferred_supplier:'示例历史渠道',purchase_purpose:'公用',estimated_price:50,safety_notes:'示例安全事项',remark:'示例历史备注',applicant_username:student.username,status:'已完成',received_status:'已入库',created_at:'2026-10-20T00:00:00Z'};
 const catalog=[{name:'示例新材料',category:'试剂原料',categories:['试剂原料'],specifications:['唯一示例规格'],suppliers:[],units:[]},{name:history.material_name,category:'试剂原料',categories:['试剂原料'],specifications:[history.specification],suppliers:[],units:[]}];
 const batch={...snapshot.lab_material_batches[0],_id:'default-batch',material_name:'示例新材料',spec:'唯一示例规格',unit:'瓶',storage_room:'A101',storage_detail:'示例柜上层',storage_location:'A101 · 示例柜上层'};
 for(const theme of ['light','dark','mixed'])for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:960}}),account={...student,profile_required:false,session_token:'synthetic-defaults'},errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(({account,theme})=>{sessionStorage.setItem('surface_lab_account',JSON.stringify(account));localStorage.setItem('platform:theme',theme);},{account,theme});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{ok:true,account,teachers:[teacher]}});
   if(url.pathname==='/api/ops/listAll')return route.fulfill({json:{ok:true,revision:'defaults-1',data:{...snapshot,current_account:account,lab_work_requests:[],lab_purchase_requests:[history],lab_material_batches:[batch],lab_materials:[],lab_material_catalog:catalog,lab_student_accounts:[student],lab_registered_teacher_accounts:[teacher],lab_accounts:[teacher],lab_user_hidden_records:[]}}});
   if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': fixture\n\n'});
   if(route.request().method()!=='GET')writes.push(url.pathname);return route.fulfill({json:{ok:true,rows:[],comments:[]}});
  });
  try{
   await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.platform-sync-status')?.textContent.includes('同步完成'));
   const navigate=async name=>{await openNavigation(page);await page.locator('.platform-nav').getByRole('button',{name,exact:true}).click();await showModuleRecords(page);};
   for(const type of ['测试','加工','维修']){
    await navigate(type);await page.getByRole('button',{name:'新建'+type,exact:true}).click();const form=page.locator('.platform-section-create form');await assertBlank(form);
    const quantity=form.getByLabel(/^\*?\s*工作量$/);await quantity.fill('2');await quantity.fill('');assert.equal(await quantity.inputValue(),'');await form.getByRole('button',{name:'提交教师审核',exact:true}).click();
    assert.equal(writes.length,0);assert.equal(await form.getByRole('combobox',{name:/计量单位/}).inputValue(),'');
   }
   await navigate('采购/入库');await page.getByRole('button',{name:'新建采购',exact:true}).click();const purchase=page.locator('.platform-section-create form');await assertBlank(purchase);
   await purchase.getByLabel(/^\*?\s*数量$/).fill('2');await purchase.getByLabel(/^\*?\s*数量$/).fill('');assert.equal(await purchase.getByLabel(/^\*?\s*数量$/).inputValue(),'');
   await purchase.getByRole('combobox',{name:/采购类别/}).selectOption('试剂原料');await pick(page,purchase.getByPlaceholder('选择物品或搜索“其它”'),'示例新材料');assert.equal(await purchase.getByRole('combobox',{name:/规格 \/ 型号/}).inputValue(),'','One catalog specification still needs a choice');
   await pick(page,purchase.getByPlaceholder('选择物品或搜索“其它”'),history.material_name);assert.equal(await purchase.getByLabel(/^\*?\s*数量$/).inputValue(),'4');assert.equal(await purchase.getByRole('combobox',{name:/规格 \/ 型号/}).inputValue(),history.specification);assert.equal(await purchase.getByLabel(/预计金额/).inputValue(),'50');assert.equal(await purchase.getByRole('combobox',{name:/使用目的/}).inputValue(),'公用');
   await navigate('库存');await page.getByRole('button',{name:'开始录入现有材料',exact:true}).click();const initialization=page.locator('.platform-section-create form');await assertBlank(initialization);
   await initialization.getByRole('combobox',{name:/材料类别/}).selectOption('试剂原料');await pick(page,initialization.getByPlaceholder('选择材料或搜索“其它”'),'示例新材料');assert.equal(await initialization.getByRole('combobox',{name:/规格 \/ 型号/}).inputValue(),'');
   await navigate('出/退库');await page.getByRole('button',{name:'新增记录',exact:true}).click();const stock=page.locator('.platform-section-create form');await assertBlank(stock);
   const movement=stock.getByRole('combobox',{name:/类型/});assert.equal(await movement.inputValue(),'');await movement.selectOption('退库');await pick(page,stock.getByPlaceholder('搜索或选择采购材料'),'示例新材料');const batchInput=stock.getByPlaceholder('搜索或选择批次');await batchInput.fill('唯一示例规格');await page.getByRole('listbox').getByRole('option').click();assert.equal(await stock.getByLabel(/^\*?\s*单位$/).inputValue(),'瓶');assert.equal(await stock.getByRole('combobox',{name:/存放房间/}).inputValue(),'A101');
   await stock.getByLabel(/^\*?\s*数量$/).fill('2');await stock.getByLabel(/^\*?\s*数量$/).fill('');assert.equal(await stock.getByLabel(/^\*?\s*数量$/).inputValue(),'');
   await page.locator('.platform-section-create').screenshot({path:path.join(out,`new-record-defaults-${theme}-${width}.png`)});
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);results.push({newRecordDefaults:true,theme,width,newFormsChecked:6,requiredDefaultsEmpty:true,explicitHistoryAutofill:true,explicitBatchAutofill:true,businessWrites:0,overflow,errors});
  }finally{await page.close();}
 }
 return results;
}
