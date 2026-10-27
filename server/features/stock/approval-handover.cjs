const { createHash } = require('node:crypto');

module.exports = function createApprovalHandover({ db, listRecords, updateRecord, addAudit, nowISO, requireAdmin, recordChanges, stockOutService }) {
  return function handover(req, res, payload, admin) {
    requireAdmin(admin);
    const from = db.prepare('SELECT * FROM accounts WHERE id=?').get(Number(payload.id));
    if (!from) throw new Error('未找到原采购人账号。');
    const related = () => listRecords('lab_material_batches', batch =>
      /私用|项目/.test(batch.purchase_purpose || '') &&
      (batch.approval_delegate_username || batch.purchaser_username || batch.created_by_username) === from.username);
    const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows.map(row => [row._id, row.updated_at]))).digest('hex');
    if (payload.preview) {
      const batches = related();
      return res.json({ ok: true, count: batches.length, revision: fingerprint(batches) });
    }
    const target = db.prepare("SELECT * FROM accounts WHERE username=? AND status='active' AND account_type='student'").get(String(payload.username || ''));
    if (!target || target.username === from.username) throw new Error('请选择其他启用中的学生。');
    const result = db.transaction(() => {
      const batches = related();
      if (payload.revision !== fingerprint(batches)) throw new Error('库存已变化，请重新确认移交范围。');
      let requests = 0;
      for (const before of batches) {
        const after = updateRecord('lab_material_batches', before._id, {
          approval_delegate_username: target.username, approval_delegate_name: target.display_name || target.username,
          approval_transferred_at: nowISO(), approval_transferred_by: admin.username,
        });
        addAudit(req, admin, 'adminTransferStockApprover', 'lab_material_batches', before._id, before, after);
        for (const request of listRecords('lab_stock_out_requests', row => String(row.batch_id) === String(before._id) && ['待采购人审批', '已同意待出库'].includes(row.status))) {
          const updated = updateRecord('lab_stock_out_requests', request._id, {
            original_purchaser_username: request.original_purchaser_username || before.purchaser_username || before.created_by_username,
            original_purchaser_name: request.original_purchaser_name || before.purchaser_name || before.created_by_name,
            purchaser_username: target.username, purchaser_name: target.display_name || target.username,
            approval_delegated: true, status: '待采购人审批',
            batch_signature: stockOutService.signature(after, target),
            approved_username: '', approved_by: '', approved_at: null, reviewed_username: '', reviewed_by: '', reviewed_at: null, review_note: '',
          });
          addAudit(req, admin, 'adminTransferStockApprover', 'lab_stock_out_requests', request._id, request, updated);
          requests++;
        }
      }
      return { batches: batches.length, requests };
    }).immediate();
    recordChanges.notify();
    return res.json({ ok: true, ...result });
  };
};
