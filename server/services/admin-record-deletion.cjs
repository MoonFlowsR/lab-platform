const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const names = { lab_work_requests:'测试/加工/维修申请', lab_purchase_requests:'采购申请', lab_materials:'材料', lab_material_batches:'库存批次', lab_stock_transactions:'出入退库记录', lab_stock_out_requests:'项目物品出库申请', lab_review_logs:'审批记录', lab_attachments:'附件', lab_expense_records:'费用记录', lab_test_processing_units:'外协单位' };
const allowed = ['lab_work_requests','lab_purchase_requests','lab_materials','lab_material_batches','lab_stock_transactions','lab_stock_out_requests','lab_expense_records','lab_test_processing_units'];
module.exports = function createDeletionService({ db, uploadDir, nowISO, addAudit }) {
  const root = path.resolve(uploadDir);
  const key = row => `${row.collection}:${row.id}`;
  const matches = (row, collection, id, publicId) => row.collection === collection && (String(row.id) === String(id) || (publicId && row.public_id === publicId));
  const filePath = stored => {
    const absolute = path.resolve(root, stored);
    if (!absolute.toLowerCase().startsWith((root + path.sep).toLowerCase())) throw new Error('附件存储路径异常，不能执行删除。');
    return absolute;
  };
  function plan(collection, id) {
    if (!allowed.includes(collection)) throw new Error('该类型不支持永久删除。');
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('记录编号无效。');
    const rows = db.prepare('SELECT * FROM records').all().map(row => ({...row,data:JSON.parse(row.data_json)}));
    const target = rows.find(row => row.collection === collection && row.id === Number(id) && !row.deleted_at);
    if (!target) throw new Error('记录不存在或已被删除，请刷新页面。');
    const removed = new Map([[key(target),target]]);
    const add = row => removed.set(key(row),row);
    if (collection === 'lab_materials') {
      rows.filter(row => row.collection === 'lab_material_batches' && String(row.data.material_id) === String(id)).forEach(add);
      rows.filter(row => row.collection === 'lab_stock_transactions' && String(row.data.material_id) === String(id)).forEach(add);
    }
    const removedBatches = [...removed.values()].filter(row => row.collection === 'lab_material_batches');
    for (const batch of removedBatches) rows.filter(row => ['lab_stock_transactions','lab_stock_out_requests'].includes(row.collection) && (String(row.data.batch_id) === String(batch.id) || (batch.data.batch_code && row.data.batch_code === batch.data.batch_code))).forEach(add);
    const core = [...removed.values()];
    for (const row of rows.filter(row => row.collection === 'lab_review_logs')) {
      if (core.some(parent => (!row.data.target_collection || row.data.target_collection === parent.collection) && matches(parent,parent.collection,row.data.target_id,row.data.target_public_id))) add(row);
    }
    const pendingUpdates = new Map();
    const survivors = rows.filter(row => !removed.has(key(row)) && row.collection !== 'lab_attachments');
    const deletedPhotos = new Set(core.flatMap(row => [row.data.photo_attachment_id,row.data.inbound_photo_attachment_id,row.data.storage_photo_attachment_id]).filter(Boolean).map(String));
    for (const attachment of rows.filter(row => row.collection === 'lab_attachments')) {
      const boundToDeleted = core.some(parent => matches(parent,attachment.data.target_collection,attachment.data.target_id,attachment.data.target_public_id));
      if (!boundToDeleted && !deletedPhotos.has(String(attachment.id))) continue;
      const stockOwner = survivors.find(row => row.collection === 'lab_stock_transactions' && ([row.data.photo_attachment_id,row.data.storage_photo_attachment_id].some(id => String(id) === String(attachment.id)) || matches(row,attachment.data.target_collection,attachment.data.target_id,attachment.data.target_public_id)));
      const purchaseOwner = survivors.find(row => row.collection === 'lab_purchase_requests' && ([row.data.inbound_photo_attachment_id,row.data.storage_photo_attachment_id].some(id => String(id) === String(attachment.id)) || matches(row,attachment.data.target_collection,attachment.data.target_id,attachment.data.target_public_id)));
      const batchOwner = survivors.find(row => row.collection === 'lab_material_batches' && [row.data.inbound_photo_attachment_id,row.data.storage_photo_attachment_id].some(id => String(id) === String(attachment.id)));
      const requestOwner = survivors.find(row => row.collection === 'lab_stock_out_requests' && String(row.data.photo_attachment_id) === String(attachment.id));
      const owner = stockOwner || purchaseOwner || batchOwner || requestOwner;
      if (owner && !attachment.deleted_at && !attachment.data.deleted_at) {
        if (boundToDeleted) pendingUpdates.set(key(attachment),{ row:attachment, patch:{ target_collection:owner.collection,target_id:String(owner.id),target_public_id:owner.public_id || '',attachment_state:'bound' } });
      } else add(attachment);
    }
    const deletedIds = new Set([...removed.values()].map(row => String(row.id)));
    const deletedAttachments = [...removed.values()].filter(row => row.collection === 'lab_attachments');
    const deletedAttachmentIds = new Set(deletedAttachments.map(row => String(row.id)));
    // Remove dangling references while retaining actual stock and project-use restrictions.
    for (const row of survivors) {
      const patch = {};
      if (collection === 'lab_purchase_requests') {
        if (String(row.data.related_purchase_record_id) === String(id)) patch.related_purchase_record_id = '';
        for (const field of ['related_purchase_id','created_from_purchase_id']) if (target.public_id && row.data[field] === target.public_id) patch[field] = '';
        if (row.collection === 'lab_material_batches' && Object.keys(patch).length) {
          if (!row.data.purchase_purpose) patch.purchase_purpose = target.data.purchase_purpose || '';
          if (!row.data.purchaser_name) patch.purchaser_name = target.data.applicant_name || target.data.applicant_username || '';
          if (!row.data.purchaser_username) patch.purchaser_username = target.data.applicant_username || '';
        }
      }
      for (const field of ['inbound_batch_id','inbound_transaction_id']) if (row.data[field] && deletedIds.has(String(row.data[field]))) patch[field] = '';
      if ('inbound_batch_id' in patch) { patch.inbound_batch_code = ''; patch.received_status = '关联库存已删除'; }
      for (const field of ['photo_attachment_id','inbound_photo_attachment_id','storage_photo_attachment_id']) if (row.data[field] && deletedAttachmentIds.has(String(row.data[field]))) patch[field] = '';
      if (Object.keys(patch).length) pendingUpdates.set(key(row),{row,patch});
    }
    const deleted = [...removed.values()];
    const keptFiles = new Set(rows.filter(row => row.collection === 'lab_attachments' && !removed.has(key(row)) && row.data.storage_path).flatMap(row => {
      try { return [filePath(row.data.storage_path).toLowerCase()]; } catch { return []; }
    }));
    const files = [...new Set(deletedAttachments.filter(row => row.data.storage_path).map(row => filePath(row.data.storage_path)))].filter(file => !keptFiles.has(file.toLowerCase()));
    const counts = Object.fromEntries(Object.entries(names).map(([type,title]) => [title,deleted.filter(row => row.collection === type).length]).filter(([,count]) => count));
    const updates = [...pendingUpdates.values()];
    const token = createHash('sha256').update(JSON.stringify({ target:key(target),deleted:deleted.map(row => [key(row),row.updated_at,row.data_json]).sort(),updates:updates.map(({row,patch}) => [key(row),row.updated_at,patch]).sort(),files })).digest('hex');
    let note = '同时删除关联审批、个人隐藏记录及专属附件。';
    if (collection === 'lab_purchase_requests') note = '保留已有库存、出入退库记录及入库凭证；采购申请、审批及专属采购附件永久删除。';
    if (collection === 'lab_materials' || collection === 'lab_material_batches') note = '同时永久删除其库存批次、关联出入退库记录及专属附件；采购申请保留。';
    if (collection === 'lab_stock_out_requests') note = '删除出库申请、审批及专属照片；已有出库流水和当前库存保留。';
    if (collection === 'lab_stock_transactions') note = '只删除这条流水及专属附件，不自动增减当前库存；需要修正数量时请使用“修改库存”。';
    return {target,deleted,updates,files,summary:{token,title:names[collection],public_id:target.public_id || String(id),name:target.data.work_content || target.data.material_name || target.data.name_cn || target.data.name || target.data.batch_code || '',counts,note}};
  }
  function execute(req, account, payload) {
    const moved = [];
    let stagingDir;
    let result;
    try {
      result = db.transaction(() => {
        const current = plan(payload.collection,payload.id);
        if (!payload.token || current.summary.token !== payload.token) throw new Error('记录或关联数据已变化，请重新查看删除范围后确认。');
        const existingFiles = current.files.filter(file => fs.existsSync(file));
        if (existingFiles.length) {
          stagingDir = path.join(root,'.deletion-' + randomUUID());
          fs.mkdirSync(stagingDir);
          existingFiles.forEach((file,index) => {const parked = path.join(stagingDir,String(index));fs.renameSync(file,parked);moved.push({file,parked});});
        }
        const deleteRow = db.prepare('DELETE FROM records WHERE collection=? AND id=?');
        const deleteHidden = db.prepare('DELETE FROM lab_user_hidden_records WHERE target_collection=? AND (target_id=? OR (target_public_id<>\'\' AND target_public_id=?))');
        const deleteAudit = db.prepare('DELETE FROM audit_logs WHERE target_type=? AND target_id=?');
        for (const row of current.deleted) {
          deleteHidden.run(row.collection,String(row.id),row.public_id || '');
          deleteAudit.run(row.collection,String(row.id));
          deleteRow.run(row.collection,row.id);
        }
        for (const {row,patch} of current.updates) {
          const updated = {...row.data,...patch,updated_at:nowISO()};
          db.prepare('UPDATE records SET data_json=?, updated_at=? WHERE collection=? AND id=?').run(JSON.stringify(updated),updated.updated_at,row.collection,row.id);
        }
        // Keep a deletion operation log without retaining copies of the deleted business data.
        addAudit(req,account,'adminDeleteRecord',current.target.collection,current.target.id,null,{permanently_deleted:true,counts:current.summary.counts});
        return {counts:current.summary.counts,deleted:current.deleted.map(row => ({collection:row.collection,id:String(row.id)}))};
      })();
    } catch (error) {
      for (const item of moved.reverse()) fs.renameSync(item.parked,item.file);
      if (stagingDir) fs.rmdirSync(stagingDir);
      throw error;
    }
    for (const item of moved) fs.unlinkSync(item.parked);
    if (stagingDir) fs.rmdirSync(stagingDir);
    return result;
  }
  return {preview:(collection,id) => plan(collection,id).summary,execute};
};
