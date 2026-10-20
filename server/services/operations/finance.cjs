module.exports = function createFinanceOperations({ db, getRecord, updateRecord, addAudit, nowISO, recordChanges }) {
  return {
    setReimbursementStatus(req, res, action, payload, account) {
      if (account.account_type !== 'finance') throw new Error('只有财务账号可以登记报销状态。');
      if (!['lab_work_requests', 'lab_purchase_requests'].includes(payload.collection)) throw new Error('不支持此类工单。');
      if (typeof payload.reimbursed !== 'boolean') throw new Error('请选择报销状态。');
      const record = db.transaction(() => {
        const before = getRecord(payload.collection, payload.id);
        if (!before) throw new Error('未找到工单。');
        const purchase = payload.collection === 'lab_purchase_requests';
        const completed = purchase
          ? before.status !== '已关闭' && (['已完成', '已入库', '已归档'].includes(before.status) || before.received_status === '已入库')
          : ['已完成', '已归档'].includes(before.status) && ['测试', '加工', '维修'].includes(before.request_type);
        if (!completed || !['已开票', '已挂账'].includes(before.settlement_status)) throw new Error('仅可登记已完成且工单状态为已开票或已挂账的工单。');
        if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('工单已更新，请同步后重新核对报销状态。');
        if ((before.reimbursed === true) === payload.reimbursed) return before;
        const after = updateRecord(payload.collection, before._id, {
          reimbursed: payload.reimbursed,
          reimbursed_by: payload.reimbursed ? account.display_name || account.username : '',
          reimbursed_username: payload.reimbursed ? account.username : '',
          reimbursed_at: payload.reimbursed ? nowISO() : '',
        });
        addAudit(req, account, action, payload.collection, before._id, before, after);
        return after;
      }).immediate();
      recordChanges.notify();
      return res.json({ ok: true, record });
    },
  };
};
