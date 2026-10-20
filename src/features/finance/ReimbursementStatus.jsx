import { useState } from 'react';
import { isReimbursementEligible, reimbursementLabel } from './reimbursement.js';
import { showAlert } from '../../shared/components/platform-dialog.jsx';

export default function ReimbursementStatus({ row, currentUser, onChange }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const editable = currentUser?.account_type === 'finance' && isReimbursementEligible(row) && onChange;
  return <span className="platform-reimbursement-state">
    <span>{row.settlement_status || '未登记'}</span>
    {editable ? <label className="platform-reimbursement-check"><input type="checkbox" checked={busy ? pending : row.reimbursed === true} disabled={busy} aria-label={`已报销 ${row.public_id}`} onChange={async event => {
      const value = event.target.checked;
      if (busy) return;
      setPending(value);
      setBusy(true);
      try { await onChange(['测试','加工','维修'].includes(row.request_type) ? 'lab_work_requests' : 'lab_purchase_requests', row, value); }
      catch (error) { await showAlert(error.message || '报销状态保存失败，请同步后重试。'); }
      finally { setBusy(false); }
    }} /><span>{busy ? '保存中…' : reimbursementLabel(row)}</span></label> : <strong className={row.reimbursed === true ? 'is-reimbursed' : 'is-unreimbursed'}>{reimbursementLabel(row)}</strong>}
  </span>;
}
