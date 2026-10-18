module.exports = function closeRejectedRequest(before, payload, account, closedAt) {
  if (account.account_type !== 'student' || before.applicant_username !== account.username) throw new Error('只有学生申请人可以关闭本人被驳回的工单。');
  if (!['已驳回', '需修改'].includes(before.status)) throw new Error('仅被驳回或要求修改的工单可以关闭。');
  if (payload.confirmed !== true) throw new Error('请先确认关闭并结束工单。');
  if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) throw new Error('工单信息已更新，请刷新后重新确认。');
  return { status: '已关闭', closed_from_status: before.status, closed_by_username: account.username,
    closed_by_name: account.display_name || account.username, closed_at: closedAt };
};
