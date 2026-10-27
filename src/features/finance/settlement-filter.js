export const settlementStatusOptions = [
  { value: '', label: '全部' },
  { value: '已挂账', label: '已挂账' },
  { value: '已开票', label: '已开票' },
];

// The saved accounting state is independent of workflow and reimbursement states.
export const matchesSettlementStatus = (row, status = '') => !status || row.settlement_status === status;
