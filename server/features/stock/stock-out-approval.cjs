const { createHash } = require('node:crypto');
module.exports = function createStockOutService(context) {
  const { db, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO, storageDetails, requireItemPhoto, bindStockEvidence, batchPurchasePurpose, selectedStockTeachers } = context;
  const clean = value => String(value ?? '').trim();
  const numeric = (value, label) => { const number = Number(value); if (!['number','string'].includes(typeof value) || clean(value)==='' || !Number.isFinite(number) || number<=0) throw new Error(label+'必须大于0。'); return number; };
  function purchaser(batch) {
    const source = getRecord('lab_purchase_requests', batch.related_purchase_record_id) || listRecords('lab_purchase_requests', row => row.public_id === batch.related_purchase_id)[0];
    const username = batch.approval_delegate_username || batch.purchaser_username || source?.applicant_username || batch.created_by_username;
    const account = username && db.prepare('SELECT username,display_name,status FROM accounts WHERE username=?').get(username);
    if (!account || account.status !== 'active') throw new Error('出库审批人账号未启用，请联系管理员移交出库审批。');
    return account;
  }
  function signature(batch, owner) {
    return createHash('sha256').update(JSON.stringify([batch.material_id,batch.material_name,batch.spec,batch.unit,batchPurchasePurpose(batch),owner.username])).digest('hex');
  }
  function unchangedBatch(request) {
    const batch = getRecord('lab_material_batches', request.batch_id);
    if (!batch) throw new Error('关联库存批次已删除，不能继续出库。');
    const owner = purchaser(batch);
    if (signature(batch,owner) !== request.batch_signature) throw new Error('材料名称、规格、单位、用途或采购人已变化，请撤回后重新申请出库。');
    return batch;
  }
  function submission(req, account, payload) {
    if (account.account_type !== 'student') throw new Error('只有学生账号可以新建出库或退库记录。');
    return db.transaction(() => {
      const entryKey = clean(payload.entry_key);
      if (entryKey) {
        const duplicate = listRecords('lab_stock_out_requests', row => row.applicant_username === account.username && row.entry_key === entryKey)[0];
        if (duplicate) return { approval_required:true, request:duplicate };
        const movement = listRecords('lab_stock_transactions', row => row.operator_username === account.username && row.entry_key === entryKey)[0];
        if (movement) return { record:movement };
      }
      const batch = getRecord('lab_material_batches', payload.batch_id);
      if (!batch) throw new Error('未找到材料批次。');
      const type = clean(payload.transaction_type);
      if (!['出库','退库'].includes(type)) throw new Error('学生账号只能登记出库或退库；到货入库请在采购工单完成。');
      const quantity = numeric(payload.quantity,'数量'), unit = clean(payload.unit), teachers = selectedStockTeachers(account), storage = storageDetails(payload);
      if (!unit || unit !== clean(batch.unit)) throw new Error('出入退库单位必须与当前批次的库存单位一致：'+(batch.unit || '未设置')+'。');
      const beforeQty = Number(batch.current_qty || 0);
      if (type === '出库' && quantity > beforeQty) throw new Error(`库存不足，当前库存为 ${beforeQty} ${unit}`);
      const reason = clean(payload.usage_reason);
      if (reason.length > 2000) throw new Error('用途或备注不超过2000字。');
      const photo = requireItemPhoto(account,payload,type), purpose = batchPurchasePurpose(batch);
      const common = { entry_key:entryKey, batch_id:batch._id, batch_code:batch.batch_code, material_id:batch.material_id, material_name:batch.material_name, quantity, unit, ...storage, ...teachers, usage_reason:reason, purchase_purpose:purpose, photo_attachment_id:photo._id };
      if (type === '出库' && purpose === '私用/项目用（出库需采购人审批）') {
        const owner = purchaser(batch);
        if (owner.username === account.username) {
          return movement(req,account,batch,{...common,purchaser_username:owner.username,purchaser_name:owner.display_name || owner.username,approval_delegated:Boolean(batch.approval_delegate_username),purchaser_approval_exempt:true,purchaser_approval_exempt_reason:batch.approval_delegate_username ? 'delegate_self' : 'purchaser_self'},photo,type);
        }
        const request = insertRecord('lab_stock_out_requests',{ ...common,...nextPublicId('OUT'),transaction_type:'出库',applicant_username:account.username,applicant_name:account.display_name || account.username,operator_username:account.username,original_purchaser_username:batch.purchaser_username || batch.created_by_username,original_purchaser_name:batch.purchaser_name || batch.created_by_name,approval_delegated:Boolean(batch.approval_delegate_username),purchaser_username:owner.username,purchaser_name:owner.display_name || owner.username,batch_signature:signature(batch,owner),status:'待采购人审批',created_at:nowISO(),updated_at:nowISO() },{applicant_username:account.username,operator_username:account.username});
        updateRecord('lab_attachments',photo._id,{target_collection:'lab_stock_out_requests',target_id:request._id,target_public_id:request.public_id,attachment_state:'bound',bound_at:nowISO()});
        addAudit(req,account,'submitStockOutRequest','lab_stock_out_requests',request._id,null,request);
        return { approval_required:true, request };
      }
      return movement(req,account,batch,common,photo,type);
    }).immediate();
  }
  function movement(req,account,batch,values,photo,type,request=null) {
    const beforeQty=Number(batch.current_qty || 0), afterQty=type==='退库' ? beforeQty+values.quantity : beforeQty-values.quantity;
    if (afterQty<0) throw new Error(`库存不足，当前库存为 ${beforeQty} ${batch.unit}`);
    const after=updateRecord('lab_material_batches',batch._id,{current_qty:afterQty,...(type==='退库' ? {...storageDetails(values),inbound_photo_attachment_id:photo._id} : {}),last_stock_action_by:account.display_name,last_stock_action_at:nowISO()});
    const record=insertRecord('lab_stock_transactions',{...values,...nextPublicId('IO'),transaction_type:type,stock_before:beforeQty,stock_after:afterQty,operator_name:account.display_name || account.username,operator_username:account.username,operator_account_type:account.account_type,
      ...(request ? {stock_out_request_id:request._id,stock_out_request_public_id:request.public_id,purchaser_username:request.purchaser_username,purchaser_name:request.purchaser_name,purchaser_approved_by:request.approved_by,purchaser_approved_username:request.approved_username,purchaser_approved_at:request.approved_at,purchaser_review_note:request.review_note || ''} : {}),created_at:nowISO(),updated_at:nowISO()},{operator_username:account.username});
    bindStockEvidence(photo,record);
    addAudit(req,account,request ? 'completeStockOutRequest' : 'createStockTransaction','lab_material_batches',batch._id,batch,after);
    addAudit(req,account,request ? 'completeStockOutRequest' : 'createStockTransaction','lab_stock_transactions',record._id,batch,{transaction:record,batch:after});
    return {record};
  }
  function act(req,account,action,payload) {
    return db.transaction(() => {
      const before=getRecord('lab_stock_out_requests',payload.id);
      if (!before) throw new Error('未找到项目物品出库申请。');
      if (action==='reviewStockOutRequest') {
        if (before.purchaser_username!==account.username) throw new Error('只有该批次采购人可以审批出库申请。');
        if (before.status!=='待采购人审批') throw new Error('该出库申请已处理，请刷新页面。');
        unchangedBatch(before);
        const decision=clean(payload.decision), note=clean(payload.review_note);
        if (!['同意','驳回'].includes(decision)) throw new Error('审批只能选择同意或驳回。');
        if (decision==='驳回' && !note) throw new Error('驳回意见必填。');
        if (note.length>2000) throw new Error('审批意见不超过2000字。');
        const after=updateRecord('lab_stock_out_requests',before._id,{status:decision==='同意' ? '已同意待出库' : '已驳回',review_note:note,reviewed_by:account.display_name || account.username,reviewed_username:account.username,reviewed_at:nowISO(),...(decision==='同意' ? {approved_by:account.display_name || account.username,approved_username:account.username,approved_at:nowISO()} : {})});
        const log=insertRecord('lab_review_logs',{...nextPublicId('REV'),target_collection:'lab_stock_out_requests',target_id:before._id,target_public_id:before.public_id,reviewer_name:account.display_name || account.username,reviewer_username:account.username,action:decision,review_note:note,created_at:nowISO(),updated_at:nowISO()});
        addAudit(req,account,action,'lab_stock_out_requests',before._id,before,after); addAudit(req,account,action,'lab_review_logs',log._id,null,log);
        return {request:after};
      }
      if (account.account_type!=='student' || before.applicant_username!==account.username) throw new Error('只有原出库申请人可以操作该申请。');
      if (action==='withdrawStockOutRequest') {
        if (!['待采购人审批','已同意待出库','已驳回'].includes(before.status)) throw new Error('该申请不能撤回。');
        const after=updateRecord('lab_stock_out_requests',before._id,{status:'已撤回',withdrawn_by:account.display_name || account.username,withdrawn_at:nowISO()});
        addAudit(req,account,action,'lab_stock_out_requests',before._id,before,after); return {request:after};
      }
      if (action!=='completeStockOutRequest') throw new Error('未知出库操作。');
      if (before.status==='已出库') return {request:before,record:getRecord('lab_stock_transactions',before.transaction_id),already_completed:true};
      if (!['待采购人审批','已同意待出库'].includes(before.status)) throw new Error('须先取得采购人同意，再由申请人完成出库登记。');
      const batch=unchangedBatch(before), owner=purchaser(batch);
      const selfPurchase=owner.username===account.username && before.purchaser_username===account.username;
      if (!selfPurchase && (before.status!=='已同意待出库' || before.approved_username!==before.purchaser_username)) throw new Error('须先取得采购人同意，再由申请人完成出库登记。');
      const exemption=selfPurchase ? {purchaser_approval_exempt:true,purchaser_approval_exempt_reason:batch.approval_delegate_username ? 'delegate_self' : 'purchaser_self'} : {};
      const photo=getRecord('lab_attachments',before.photo_attachment_id);
      if (!photo || photo.deleted_at || photo.target_collection!=='lab_stock_out_requests' || String(photo.target_id)!==String(before._id) || photo.uploaded_by_username!==account.username) throw new Error('物品特写照片关联异常，请撤回并重新申请。');
      const values=Object.fromEntries(['entry_key','batch_id','batch_code','material_id','material_name','quantity','unit','storage_room','storage_detail','storage_location','responsible_teacher_username','responsible_teacher_name','guiding_teacher_username','guiding_teacher_name','graduation_year','usage_reason','purchase_purpose','photo_attachment_id'].map(key=>[key,before[key]]));
      const result=movement(req,account,batch,{...values,...exemption},photo,'出库',before);
      const after=updateRecord('lab_stock_out_requests',before._id,{...exemption,status:'已出库',transaction_id:result.record._id,transaction_public_id:result.record.public_id,completed_at:nowISO(),completed_by:account.display_name || account.username});
      addAudit(req,account,action,'lab_stock_out_requests',before._id,before,after);
      return {...result,request:after};
    }).immediate();
  }
  return {submission,act,signature};
};
