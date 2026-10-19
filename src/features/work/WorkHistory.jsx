import { workFeeKey } from './work-types.js';
import { DataTable, Empty } from '../../shared/components/ui.jsx';
import { formatDate, money } from '../../app/formatters.js';
import { styles } from '../../app/styles.js';
import { isCompletedWork, workFee } from './work-values.js';

export default function WorkHistory({ type, rows }) {
  return <details className="platform-same-work-history" style={styles.logBox}>
    <summary>近半年相同{type}记录（{rows.length}）</summary>
    {rows.length ? <DataTable
      mobileColumns={['提交时间', '状态', '工作量', '最终费用（元）']}
      columns={['申请编号', '提交时间', '状态', '工作量', '预计费用（元）', '最终费用（元）', '审批人']}
      rows={rows.map(row => [row.public_id, formatDate(row.created_at), row.status === '已通过' ? '已批准待完成' : row.status,
        `${row.workload_quantity ?? '—'} ${row.workload_unit || ''}`,
        money(row.completion_original?.[workFeeKey(type)] ?? workFee(row)),
        isCompletedWork(row) ? money(workFee(row)) : '—', row.reviewed_by || '—'])}
    /> : <Empty text="近半年暂无该同学在同一机构进行的相同项目记录。" />}
  </details>;
}
