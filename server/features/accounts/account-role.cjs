module.exports = function changeAccountRole({ db, nowISO, addAudit, publicAccountForAdmin, recordChanges, requireAdmin }) {
  return (req, res, action, payload, account) => {
    requireAdmin(account);
    if (!['teacher', 'finance'].includes(payload.account_type)) throw new Error('请选择教师或财务身份。');
    const result = db.transaction(() => {
      const before = db.prepare('SELECT * FROM accounts WHERE id=?').get(Number(payload.id));
      if (!before || !['teacher', 'finance'].includes(before.account_type)) throw new Error('仅可切换教师与财务账号身份。');
      if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('账号信息已更新，请刷新后重试。');
      if (before.account_type === payload.account_type) return { account: publicAccountForAdmin(before), changed: false, id: before.id };
      if (payload.account_type === 'finance') {
        const pending = db.prepare("SELECT data_json FROM records WHERE deleted_at IS NULL AND collection IN ('lab_work_requests','lab_purchase_requests')").all()
          .some(row => { const record = JSON.parse(row.data_json); return record.status === '待教师审核' && record.review_teacher_username === before.username; });
        if (pending) throw new Error('该教师还有待审核工单，请先完成审核或由申请人撤回并重新选择审核教师。');
        const mentor = db.prepare('SELECT 1 FROM student_profiles WHERE responsible_teacher_username=? OR guiding_teacher_username=? LIMIT 1').get(before.username, before.username);
        if (mentor) throw new Error('该教师仍关联学生导师信息，请先更新学生资料。');
      }
      db.prepare('UPDATE accounts SET account_type=?,session_version=session_version+1,updated_at=? WHERE id=?').run(payload.account_type, nowISO(), before.id);
      const after = db.prepare('SELECT * FROM accounts WHERE id=?').get(before.id);
      addAudit(req, account, action, 'accounts', before.id, publicAccountForAdmin(before), publicAccountForAdmin(after));
      return { account: publicAccountForAdmin(after), changed: true, id: before.id };
    }).immediate();
    if (result.changed) recordChanges.disconnectAccount(result.id);
    recordChanges.notify();
    return res.json({ ok: true, account: result.account });
  };
};
