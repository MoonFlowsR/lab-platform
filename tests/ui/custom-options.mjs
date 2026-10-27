import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openNavigation } from './navigation.mjs';
import { showModuleRecords } from './module-records.mjs';
import { platformSettings } from '../../src/shared/lib/platform-settings.js';

const require = createRequire(import.meta.url);
const buildMaterialCatalog = require('../../server/features/inventory/material-catalog.cjs');
const types = ['测试', '加工', '维修'];
const configuredRooms = platformSettings.rooms;
const photo = { name: 'synthetic-option-proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') };

async function module(page, name) {
  await openNavigation(page);
  await page.locator('.platform-nav').getByRole('button', { name, exact: true }).click();
  await showModuleRecords(page);
}
async function menu(page, control) {
  const id = await control.getAttribute('aria-controls');
  assert(id, 'Searchable choices must expose their own listbox');
  return page.locator(`[role="listbox"][id="${id}"]`);
}
async function pick(page, control, name) {
  if (await control.evaluate(element => element.tagName) === 'SELECT') return control.selectOption(name);
  await control.fill(name);
  const list = await menu(page, control);
  await list.getByRole('option', { name, exact: true }).click();
}
async function options(page, control, present, absent = []) {
  let labels;
  if (await control.evaluate(element => element.tagName) === 'SELECT') labels = await control.locator('option').allTextContents();
  else {
    await control.click();
    const list = await menu(page, control);
    await list.waitFor({ state: 'visible' });
    labels = await list.getByRole('option').allTextContents();
    const dialog = control.locator('xpath=ancestor::dialog');
    if (await dialog.count()) await dialog.getByRole('heading').first().click();
    else await control.press('Escape');
    await list.waitFor({ state: 'hidden' });
  }
  if (labels.includes('其它')) assert.equal(labels.at(-1), '其它', 'The custom entry stays last');
  for (const label of present) assert.equal(labels.filter(value => value === label).length, 1, `Exactly one saved option: ${label}`);
  for (const label of absent) assert(!labels.includes(label), `Draft/deleted/unrelated option must be absent: ${label}`);
  return labels;
}
async function custom(page, form, placeholder, label, value) {
  await pick(page, form.getByPlaceholder(placeholder, { exact: true }), '其它');
  await form.getByLabel(label, { exact: false }).fill(value);
}
async function newPurchase(page) {
  await module(page, '采购/入库');
  await page.getByRole('button', { name: '新建采购', exact: true }).click();
  const form = page.locator('.platform-section-create form');
  await form.getByRole('combobox', { name: /采购类别/ }).selectOption('耗材');
  return form;
}
async function newWork(page, type) {
  await module(page, type);
  await page.getByRole('button', { name: `新建${type}`, exact: true }).click();
  return page.locator('.platform-section-create form');
}
async function stockForm(page, materialName) {
  await module(page, '出/退库');
  await page.getByRole('button', { name: '新增记录', exact: true }).click();
  const form = page.locator('.platform-section-create form');
  await pick(page, form.getByPlaceholder('搜索或选择采购材料', { exact: true }), materialName);
  return form;
}
async function initialization(page) {
  await module(page, '库存');
  await page.getByRole('button', { name: '开始录入现有材料', exact: true }).click();
  return page.locator('.platform-section-create form');
}
async function editBatch(page, materialName) {
  await module(page, '库存');
  const expand = page.getByRole('button', { name: /^展开其余 \d+ 组$/ });
  if (await expand.count()) await expand.click();
  const group = page.locator('.platform-stock-group').filter({ hasText: materialName });
  await group.locator(':scope > summary').click();
  await group.getByRole('button', { name: '修改物品信息', exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog', { name: '修改物品信息', exact: true });
  await dialog.waitFor();
  return dialog;
}

// Every mutation below is an intercepted request into this shared synthetic store.
// Two independent browser sessions re-read that store; no production API or database is used.
export async function checkCustomOptions(browser, origin, out, snapshot, users) {
  const results = [], templateStudent = users.find(user => user.account_type === 'student');
  const teacher = users.find(user => user.account_type === 'teacher');
  const teacherLabel = `${teacher.display_name}（${teacher.username}）`;
  for (const width of [1440, 390, 320]) {
    const stamp = new Date().toISOString(), saved = structuredClone(snapshot), writes = [], reads = new Map(), sessions = [], errors = [];
    let revision = 0, serial = 6000;
    const writer = { ...templateStudent, profile_required: false, session_token: 'synthetic-options-writer' };
    const reader = { ...templateStudent, id: 602, _id: 602, username: 'qa-options-reader', display_name: '示例选项读取学生', profile_required: false, session_token: 'synthetic-options-reader' };
    const values = { name: `示例保存材料${width}`, spec: `示例保存规格${width}`, unit: `示例保存盒${width}`, supplier: `示例保存渠道${width}`, master: `示例主数据渠道${width}`, draft: `未提交选项${width}`, room: 'A103', editedRoom: 'B204', editedSupplier: `示例修改渠道${width}` };
    const purchase = (id, account, status) => ({ ...snapshot.lab_purchase_requests[0], _id: id, public_id: `QA-OPTIONS-PUR-${id}`, material_name: `示例待入库材料${id}`, purchase_category: '耗材', applicant_username: account.username, applicant_name: account.display_name, status, quantity: 2, unit: '盒', estimated_price: 20, preferred_supplier: '示例初始渠道', specification: '示例原规格', purchase_purpose: '公用', created_at: stamp, updated_at: stamp, review_teacher_username: teacher.username, review_teacher_name: teacher.display_name });
    const writerInbound = purchase(610, writer, '待入库'), readerInbound = purchase(611, reader, '待入库');
    const readerPurchase = { ...purchase(612, reader, '已完成'), inbound_batch_id: 620, completed_at: stamp, received_status: '已入库' };
    const readerBatch = { ...snapshot.lab_material_batches[0], _id: 620, public_id: 'QA-OPTIONS-BATCH-620', batch_code: 'QA-OPTIONS-BATCH-620', material_id: 621, material_name: '示例可编辑选项材料', purchase_category: '耗材', unit: '盒', spec: '示例原规格', supplier: '示例初始渠道', storage_room: '205', storage_detail: '示例柜', storage_location: '205 · 示例柜', purchase_purpose: '公用', related_purchase_record_id: 612, related_purchase_id: readerPurchase.public_id, purchaser_username: reader.username, purchaser_name: reader.display_name, created_by_username: reader.username, created_at: stamp, updated_at: stamp, expiry_date: '长期', min_qty: 0 };
    Object.assign(saved, {
      lab_purchase_requests: [writerInbound, readerInbound, readerPurchase], lab_material_batches: [readerBatch],
      lab_materials: [{ _id: 621, name_cn: readerBatch.material_name, category: '耗材', default_unit: '盒', created_at: stamp }],
      lab_stock_transactions: [{ _id: 630, storage_room: 'C301', storage_location: 'C301 · 示例历史柜', created_at: stamp }, { _id: 631, storage_room: '删除房间', deleted_at: stamp }, { _id: 632, storage_location: '旧整串位置 · 不得当房间' }],
      lab_stock_out_requests: [{ _id: 633, storage_room: 'D401', status: '待采购人审批', created_at: stamp }],
      lab_test_processing_units: [{ _id: 634, unit_type: '采购单位', unit_name: values.master }],
      lab_work_requests: types.map((type, i) => ({ ...snapshot.lab_work_requests[0], _id: 640 + i, public_id: `QA-OPTIONS-WORK-${i}`, request_type: type, work_content: `示例待完成${type}`, external_unit: `示例原${type}渠道`, workload_unit: '次', workload_quantity: 1, status: '已通过', applicant_username: reader.username, applicant_name: reader.display_name, created_at: stamp, updated_at: stamp, cost_test: 10, cost_processing: 10, cost_repair: 10 })),
      lab_review_logs: [], lab_attachments: [], lab_user_hidden_records: [], lab_purchase_catalog: [],
    });
    const collectionRows = name => saved[name] || [];
    const data = account => ({ ...saved, current_account: account, lab_material_catalog: buildMaterialCatalog(collectionRows), lab_student_accounts: [...(snapshot.lab_student_accounts || []), reader] });
    async function open(account) {
      const page = await browser.newPage({ viewport: { width, height: 960 } }); sessions.push(page);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(account => { sessionStorage.setItem('surface_lab_account', JSON.stringify(account)); window.__optionsDocument = Math.random().toString(36); }, account);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/auth/me') return route.fulfill({ json: { ok: true, account, teachers: [teacher] } });
        if (url.pathname === '/api/ops/listAll') { reads.set(account.username, (reads.get(account.username) || 0) + 1); return route.fulfill({ json: { ok: true, data: data(account), revision: `options-${revision}` } }); }
        if (url.pathname === '/api/events') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated options fixture\n\n' });
        if (url.pathname === '/api/attachments/uploadJson') return route.fulfill({ json: { ok: true, attachment: { _id: 'options-photo' } } });
        const action = url.pathname.replace('/api/ops/', ''), payload = route.request().postDataJSON();
        let record;
        if (action === 'submitPurchaseRequest' || action === 'submitWorkRequest') {
          record = { ...payload, _id: ++serial, public_id: `QA-OPTIONS-${serial}`, applicant_username: account.username, applicant_name: account.display_name, status: '待教师审核', created_at: stamp, updated_at: stamp };
          saved[action === 'submitPurchaseRequest' ? 'lab_purchase_requests' : 'lab_work_requests'].push(record);
        } else if (action === 'withdrawWorkRequest') {
          record = saved.lab_work_requests.find(row => row._id === payload.id); assert(record); record.status = '已撤回';
        } else if (action === 'completePurchaseInbound') {
          record = saved.lab_purchase_requests.find(row => row._id === payload.id); assert(record);
          const storage = { storage_room: payload.storage_room, storage_detail: payload.storage_detail, storage_location: `${payload.storage_room} · ${payload.storage_detail}` };
          Object.assign(record, storage, { status: '已完成', received_status: '已入库', completed_at: stamp, actual_received_qty: payload.actual_qty, actual_received_unit: payload.unit, settlement_status: payload.settlement_status });
          const material = { _id: ++serial, name_cn: record.material_name, category: record.purchase_category, default_unit: payload.unit, created_at: stamp };
          const batch = { ...readerBatch, ...storage, _id: ++serial, material_id: material._id, material_name: record.material_name, batch_code: `QA-OPTIONS-BATCH-${serial}`, public_id: `QA-OPTIONS-BATCH-${serial}`, unit: payload.unit, supplier: record.preferred_supplier, related_purchase_record_id: record._id, related_purchase_id: record.public_id, purchaser_username: account.username, current_qty: payload.actual_qty };
          record.inbound_batch_id = batch._id; saved.lab_materials.push(material); saved.lab_material_batches.push(batch);
          saved.lab_stock_transactions.push({ ...storage, _id: ++serial, material_name: material.name_cn, unit: payload.unit, transaction_type: '入库', created_at: stamp });
        } else if (action === 'updateMaterialBatchInformation') {
          record = saved.lab_material_batches.find(row => row._id === payload.id); assert(record);
          Object.assign(record, payload, { storage_location: `${payload.storage_room} · ${payload.storage_detail}` });
          const linked = saved.lab_purchase_requests.find(row => row._id === record.related_purchase_record_id);
          if (linked) linked.preferred_supplier = record.supplier;
        } else return route.fulfill({ json: { ok: true, rows: [], total: 0, comments: [] } });
        writes.push({ action, account: account.username, payload: structuredClone(payload) }); revision++;
        return route.fulfill({ json: { ok: true, record } });
      });
      await page.goto(origin); await page.getByTestId('task-total').waitFor();
      return page;
    }
    async function sync(page, account) {
      const documentId = await page.evaluate(() => window.__optionsDocument), before = reads.get(account.username) || 0;
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/ops/listAll');
      await page.getByRole('button', { name: '手动同步', exact: true }).click(); await response;
      await page.getByRole('button', { name: '手动同步', exact: true }).waitFor({ state: 'visible' });
      assert((reads.get(account.username) || 0) > before);
      assert.equal(await page.evaluate(() => window.__optionsDocument), documentId, 'An already-open user page synchronizes without document reload');
    }
    async function result(name, page, extra = {}) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, name); assert.deepEqual(errors, []);
      results.push({ customOptions: name, width, sharedPersistedFixture: true, apiIntercepted: true, productionTouched: false, overflow, errors: [...errors], ...extra });
    }
    try {
      const writerPage = await open(writer), readerPage = await open(reader);
      // Reader stays on an already-mounted form while another user saves new catalog entries.
      let readerForm = await newPurchase(readerPage), writerForm = await newPurchase(writerPage);
      await readerForm.getByLabel(/^\*?\s*数量$/).fill('7');
      await readerForm.getByLabel('备注（可选）', { exact: false }).fill('示例未提交备注');
      await custom(writerPage, writerForm, '选择物品或搜索“其它”', '其它采购物品名称', values.name);
      await custom(writerPage, writerForm, '选择规格或搜索“其它”', '其它规格 / 型号', values.spec);
      await custom(writerPage, writerForm, '选择单位或搜索“其它”', '其它单位', values.unit);
      await custom(writerPage, writerForm, '选择渠道或搜索“其它”', '其它采购渠道', values.supplier);
      await writerForm.getByRole('combobox', { name: /使用目的/ }).selectOption('公用');
      await pick(writerPage, writerForm.getByPlaceholder('搜索或选择审核教师'), teacherLabel);
      await writerForm.getByLabel('预计金额 / 元', { exact: false }).fill('20');
      await writerForm.getByLabel(/^\*?\s*数量$/).fill('1');
      await writerForm.getByLabel('安全事项（首次采购必填）', { exact: false }).fill('示例安全事项');
      await writerForm.getByRole('button', { name: '提交采购审核', exact: true }).click();
      await writerForm.waitFor({ state: 'hidden' });
      assert.equal(writes.filter(row => row.action === 'submitPurchaseRequest').length, 1);
      assert(saved.lab_purchase_requests.some(row => row.material_name === values.name && row.specification === values.spec && row.unit === values.unit && row.preferred_supplier === values.supplier));
      await result('purchase-custom-values-save', writerPage, { savedFields: 4 });

      await sync(readerPage, reader);
      assert.equal(await readerForm.getByLabel(/^\*?\s*数量$/).inputValue(), '7', 'Catalog synchronization preserves the open form quantity');
      assert.equal(await readerForm.getByLabel('备注（可选）', { exact: false }).inputValue(), '示例未提交备注', 'Catalog synchronization preserves the open form remark');
      await options(readerPage, readerForm.getByPlaceholder('选择物品或搜索“其它”'), [values.name]);
      await pick(readerPage, readerForm.getByPlaceholder('选择物品或搜索“其它”'), values.name);
      await options(readerPage, readerForm.getByPlaceholder('选择规格或搜索“其它”'), [values.spec]);
      await options(readerPage, readerForm.getByPlaceholder('选择单位或搜索“其它”'), [values.unit]);
      await options(readerPage, readerForm.getByPlaceholder('选择渠道或搜索“其它”'), [values.supplier, values.master]);
      writerForm = await newPurchase(writerPage);
      for (const [placeholder, label, value] of [['选择物品或搜索“其它”', '其它采购物品名称', values.draft], ['选择规格或搜索“其它”', '其它规格 / 型号', values.draft + '规格'], ['选择单位或搜索“其它”', '其它单位', values.draft + '单位'], ['选择渠道或搜索“其它”', '其它采购渠道', values.draft + '渠道']]) await custom(writerPage, writerForm, placeholder, label, value);
      await sync(readerPage, reader);
      await options(readerPage, readerForm.getByPlaceholder('选择物品或搜索“其它”'), [values.name], [values.draft]);
      await options(readerPage, readerForm.getByPlaceholder('选择规格或搜索“其它”'), [values.spec], [values.draft + '规格']);
      await options(readerPage, readerForm.getByPlaceholder('选择单位或搜索“其它”'), [values.unit], [values.draft + '单位']);
      await options(readerPage, readerForm.getByPlaceholder('选择渠道或搜索“其它”'), [values.supplier], [values.draft + '渠道']);
      await result('catalog-shared-after-manual-sync-drafts-isolated', readerPage, { users: 2, documentReloaded: false });

      readerForm = await stockForm(readerPage, readerBatch.material_name);
      await options(readerPage, readerForm.getByRole('combobox', { name: /存放房间/ }), [...configuredRooms, 'C301', 'D401'], [values.room, '删除房间', '旧整串位置 · 不得当房间']);
      await module(writerPage, '采购/入库');
      await writerPage.getByRole('button', { name: '确认到货并入库', exact: true }).filter({ visible: true }).click();
      const inbound = writerPage.locator('.platform-purchase-inbound');
      await inbound.getByRole('combobox', { name: /存放房间/ }).selectOption('__other_room__');
      await inbound.getByLabel('其它存放房间', { exact: false }).fill(values.draft + '房间');
      await sync(readerPage, reader);
      await options(readerPage, readerForm.getByRole('combobox', { name: /存放房间/ }), configuredRooms, [values.draft + '房间']);
      await inbound.getByLabel('其它存放房间', { exact: false }).fill(values.room);
      await inbound.getByLabel('具体位置简述', { exact: false }).fill('示例柜上层');
      await inbound.getByRole('combobox', { name: /工单状态/ }).selectOption('已挂账');
      await inbound.getByRole('checkbox', { name: '长期有效' }).check();
      await inbound.locator('input[type=file]').setInputFiles(photo);
      await inbound.getByRole('button', { name: '确认入库并完成采购', exact: true }).click();
      await writerPage.getByRole('dialog').getByRole('button', { name: '确认到货并完成入库', exact: true }).click();
      await inbound.waitFor({ state: 'hidden' }); assert.equal(writes.filter(row => row.action === 'completePurchaseInbound').length, 1);
      await sync(readerPage, reader);
      const roomLabels = await options(readerPage, readerForm.getByRole('combobox', { name: /存放房间/ }), [...configuredRooms, values.room, 'C301', 'D401'], [values.draft + '房间']);
      assert.deepEqual(roomLabels.filter(value => configuredRooms.includes(value)), configuredRooms); assert.equal(roomLabels.at(-1), '其它');
      assert(configuredRooms.every(room => roomLabels.indexOf(room) < roomLabels.indexOf(values.room)), 'Configured rooms stay before discovered rooms');
      await module(readerPage, '采购/入库'); await readerPage.getByRole('button', { name: '确认到货并入库', exact: true }).filter({ visible: true }).click();
      await options(readerPage, readerPage.locator('.platform-purchase-inbound').getByRole('combobox', { name: /存放房间/ }), [values.room]);
      const init = await initialization(readerPage);
      await options(readerPage, init.getByRole('combobox', { name: /存放房间/ }), [values.room]);
      await init.getByRole('combobox', { name: /材料类别/ }).selectOption('耗材');
      await options(readerPage, init.getByPlaceholder('选择材料或搜索“其它”'), [values.name]);
      await pick(readerPage, init.getByPlaceholder('选择材料或搜索“其它”'), values.name);
      await options(readerPage, init.getByPlaceholder('选择规格或搜索“其它”'), [values.spec]);
      await options(readerPage, init.getByPlaceholder('选择单位或搜索“其它”'), [values.unit]);
      await options(readerPage, init.getByPlaceholder('选择渠道或搜索“其它”'), [values.supplier, values.master]);
      const editor = await editBatch(readerPage, readerBatch.material_name);
      await options(readerPage, editor.getByRole('combobox', { name: /存放房间/ }), [values.room]);
      await options(readerPage, editor.getByPlaceholder('选择材料或搜索“其它”'), [values.name]);
      await options(readerPage, editor.getByPlaceholder('选择单位或搜索“其它”'), [values.unit]);
      await options(readerPage, editor.getByPlaceholder('选择渠道或搜索“其它”'), [values.supplier, values.master]);
      await result('saved-room-all-four-entry-points', readerPage, { room: values.room, roomEntryPoints: ['purchase-inbound', 'initialization', 'batch-editor', 'stock'], draftRoomIsolated: true });

      await editor.getByRole('combobox', { name: /存放房间/ }).selectOption('__other_room__');
      await editor.getByLabel('其它存放房间', { exact: false }).fill(values.editedRoom);
      await custom(readerPage, editor, '选择渠道或搜索“其它”', '其它采购渠道', values.editedSupplier);
      await editor.getByLabel('修改原因', { exact: false }).fill('示例选项共享验证');
      await editor.getByRole('button', { name: '确认修改', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      assert.equal(writes.filter(row => row.action === 'updateMaterialBatchInformation').length, 1);
      assert.equal(readerBatch.storage_room, values.editedRoom);
      const writerStock = await stockForm(writerPage, readerBatch.material_name); await sync(writerPage, writer);
      await options(writerPage, writerStock.getByRole('combobox', { name: /存放房间/ }), [values.room, values.editedRoom]);
      writerForm = await newPurchase(writerPage);
      await options(writerPage, writerForm.getByPlaceholder('选择渠道或搜索“其它”'), [values.editedSupplier, values.master]);
      await result('batch-edit-saved-room-and-supplier-shared', writerPage, { permission: 'existing purchaser within 48 hours', materialUnitsShared: true, masterSupplierShared: true });

      const workValues = new Map();
      for (const type of types) {
        const value = { name: `示例保存${type}${width}`, channel: `示例保存${type}渠道${width}`, unit: `示例保存${type}计量${width}` }; workValues.set(type, value);
        const form = await newWork(writerPage, type), nameLabel = type === '维修' ? '维修设备' : type + '名称';
        await custom(writerPage, form, `选择${nameLabel}或搜索“其它”`, '其它' + nameLabel, value.name);
        await custom(writerPage, form, type === '维修' ? '选择维修人员单位或搜索“其它”' : '选择渠道或搜索“其它”', type === '维修' ? '其它维修人员单位' : `其它${type}渠道`, value.channel);
        await custom(writerPage, form, '选择计量单位或搜索“其它”', '其它计量单位', value.unit);
        if (type === '维修') await form.getByLabel(/^\*?\s*维修人员$/).fill('示例维修人员');
        await form.getByLabel(`预计总${type}费 / 元`, { exact: false }).fill('10');
        await form.getByLabel(/^\*?\s*工作量$/).fill('1');
        await pick(writerPage, form.getByPlaceholder('搜索或选择审核教师'), teacherLabel);
        await form.getByRole('button', { name: '提交教师审核', exact: true }).click(); await form.waitFor({ state: 'hidden' });
        const card = writerPage.locator('.platform-request-record').filter({ has: writerPage.getByRole('heading', { name: value.name, exact: true }) });
        await card.getByRole('button', { name: '撤回', exact: true }).click();
        await writerPage.getByRole('dialog').getByRole('button', { name: '确认撤回', exact: true }).click(); await card.waitFor({ state: 'hidden' });
      }
      assert.equal(writes.filter(row => row.action === 'submitWorkRequest').length, 3); assert.equal(writes.filter(row => row.action === 'withdrawWorkRequest').length, 3);
      for (const value of workValues.values()) assert(saved.lab_work_requests.some(row => row.work_content === value.name && row.status === '已撤回'));
      await result('three-work-types-save-then-withdraw', writerPage, { savedAndWithdrawn: 3, mutationRequests: 6, withdrawnRowsHidden: true });

      await sync(readerPage, reader);
      for (const type of types) {
        const value = workValues.get(type), other = types.filter(other => other !== type).map(other => workValues.get(other));
        const form = await newWork(readerPage, type), nameLabel = type === '维修' ? '维修设备' : type + '名称';
        await readerPage.getByRole('combobox', { name: '查看范围', exact: true }).selectOption('all');
        await options(readerPage, form.getByPlaceholder(`选择${nameLabel}或搜索“其它”`), [value.name], other.map(row => row.name));
        await options(readerPage, form.getByPlaceholder(type === '维修' ? '选择维修人员单位或搜索“其它”' : '选择渠道或搜索“其它”'), [value.channel], other.map(row => row.channel));
        await options(readerPage, form.getByPlaceholder('选择计量单位或搜索“其它”'), [value.unit], other.map(row => row.unit));
        assert.equal(await readerPage.getByRole('heading', { name: value.name, exact: true }).count(), 0, 'Withdrawn work remains excluded from the record display');
        await readerPage.getByRole('button', { name: '确认完成', exact: true }).filter({ visible: true }).click();
        const dialog = readerPage.getByRole('dialog');
        await options(readerPage, dialog.getByPlaceholder('选择计量单位或搜索“其它”'), [value.unit], other.map(row => row.unit));
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
      }
      const workDraft = await newWork(writerPage, '测试');
      for (const [placeholder, label] of [['选择测试名称或搜索“其它”', '其它测试名称'], ['选择渠道或搜索“其它”', '其它测试渠道'], ['选择计量单位或搜索“其它”', '其它计量单位']]) await custom(writerPage, workDraft, placeholder, label, values.draft);
      await sync(readerPage, reader); const readerWork = await newWork(readerPage, '测试');
      for (const placeholder of ['选择测试名称或搜索“其它”', '选择渠道或搜索“其它”', '选择计量单位或搜索“其它”']) await options(readerPage, readerWork.getByPlaceholder(placeholder), [], [values.draft]);
      assert.equal(writes.filter(row => row.action === 'submitWorkRequest').length, 3, 'Draft input sends no extra save');
      await readerPage.screenshot({ path: path.join(out, `custom-options-shared-${width}.png`), fullPage: true });
      await result('withdrawn-work-options-shared-type-isolated-no-drafts', readerPage, { workTypes: 3, completionUnitsShared: true, documentReloaded: false, draftWorkIsolated: true });
    } catch (error) {
      const screenshots = [];
      for (let index = 0; index < sessions.length; index++) {
        const file = `custom-options-failure-${width}-${index === 0 ? 'writer' : 'reader'}.png`;
        try { await sessions[index].screenshot({ path: path.join(out, file), fullPage: true }); screenshots.push(file); }
        catch { /* Keep the original assertion even if the failed page cannot be captured. */ }
      }
      await fs.writeFile(path.join(out, `custom-options-failure-${width}.json`), JSON.stringify({
        width, completedCases: results.filter(row => row.width === width).map(row => row.customOptions),
        error: error.stack || error.message, pageErrors: errors, writes, snapshotReads: Object.fromEntries(reads),
        screenshots, apiIntercepted: true, productionTouched: false,
      }, null, 2)).catch(() => {});
      throw error;
    } finally { await Promise.all(sessions.map(page => page.close())); }
  }
  return results;
}
