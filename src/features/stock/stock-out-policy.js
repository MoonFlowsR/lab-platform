export const privateStockPurpose = '私用/项目用（出库需采购人审批）';

const hasId = value => value != null && String(value).trim() !== '';

// These are immutable login identities. Display names may include mentor labels.
export function batchPurchaser(batch, purchases = []) {
  if (!batch) return { username: '', name: '' };
  const sourceById = hasId(batch.related_purchase_record_id)
    ? purchases.find(row => hasId(row._id) && String(row._id) === String(batch.related_purchase_record_id))
    : null;
  const source = sourceById || (hasId(batch.related_purchase_id)
    ? purchases.find(row => hasId(row.public_id) && row.public_id === batch.related_purchase_id)
    : null);
  if (batch.approval_delegate_username) return {username:batch.approval_delegate_username,name:batch.approval_delegate_name || batch.approval_delegate_username};
  if (batch.purchaser_username) return { username: batch.purchaser_username, name: batch.purchaser_name || batch.purchaser_username };
  if (source?.applicant_username) return { username: source.applicant_username, name: source.applicant_name || source.applicant_username };
  return { username: batch.created_by_username || '', name: batch.created_by_name || batch.created_by_username || '' };
}

export function batchIsPurchaserSelf(batch, account, purchases = []) {
  const owner = batchPurchaser(batch, purchases);
  return Boolean(account?.username && owner.username && owner.username === account.username);
}

export function stockRequestIsPurchaserSelf(row, batches = [], purchases = []) {
  if (!row?.applicant_username || row.applicant_username !== row.purchaser_username) return false;
  const batch = hasId(row.batch_id) ? batches.find(item => hasId(item._id) && String(item._id) === String(row.batch_id)) : null;
  // A removed or reassigned batch cannot enable the old request's approval exemption.
  return Boolean(batch && batchPurchaser(batch, purchases).username === row.applicant_username);
}

export function canCompleteStockRequest(row, account, batches = [], purchases = []) {
  if (account?.account_type !== 'student' || !account.username || row?.applicant_username !== account.username) return false;
  return row.status === '已同意待出库' || (row.status === '待采购人审批' && stockRequestIsPurchaserSelf(row, batches, purchases));
}

export function stockApprovalExemptionText(row) {
  if (row?.purchaser_approval_exempt === true && row.purchaser_approval_exempt_reason === 'delegate_self') return '受托审批人本人，无需审批';
  return row?.purchaser_approval_exempt === true && row.purchaser_approval_exempt_reason === 'purchaser_self'
    ? '采购人本人，无需审批' : '';
}
