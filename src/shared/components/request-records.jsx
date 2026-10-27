import PersonName from './PersonName.jsx';
import RequestIdentity from './RequestIdentity.jsx';
import ReimbursementStatus, { ReimbursementBadge } from '../../features/finance/ReimbursementStatus.jsx';
import { styles } from "../../app/styles.js";
import { formatDate, money, sortByCreatedAt } from "../../app/formatters.js";
import { Badge, DataTable, Empty, Field, Info, SearchableSelect } from "./ui.jsx";
import RecentRecords from "./RecentRecords.jsx";
import { completionChangesText, isCompletedWork, workFee } from "../../features/work/work-values.js";
import { formatPublicNumber } from "../lib/public-number.js";
import './request-scope.css';

function ClosureInfo({ row }) {
  return <p style={styles.meta}>关闭人：<strong className="platform-identity"><PersonName value={row.closed_by_name || row.closed_by_username || "未记录"} /></strong> · 关闭时间：{formatDate(row.closed_at)} · <strong>不计完成费用或入库金额</strong></p>;
}
function RequestHistorySection({ title, rows, renderCard, emptyText, className = 'platform-section-history', defaultExpanded = false, showTitle = true }) {
  return <section className={className} style={styles.card} aria-label={title} tabIndex={-1}>
    {showTitle && <div style={styles.cardHeader}><h2 style={styles.h2} aria-label={`${title}（${rows.length}）`}>{title}<span className="platform-heading-count">（{rows.length}）</span></h2></div>}
    {rows.length === 0 ? <Empty text={emptyText} /> : <RecentRecords rows={rows} defaultExpanded={defaultExpanded}>{shown => shown.map(renderCard)}</RecentRecords>}
  </section>;
}
function ReviewTeacherField({ teachers, value, onChange }) {
  return <Field required label="审核教师"><SearchableSelect required value={value || ""} onChange={onChange} options={teachers.map(teacher => ({ value: teacher.username, label: teacher.display_name && teacher.display_name !== teacher.username ? `${teacher.display_name}（${teacher.username}）` : teacher.display_name || teacher.username }))} placeholder="搜索或选择审核教师" />{teachers.length === 0 && <small style={{ ...styles.muted, color: "var(--danger-ink)" }}>暂无可选教师，请联系管理员启用教师账号。</small>}</Field>;
}
function RequestViewScope({ scope, onChange, label, moduleName, recordLabel = "进度" }) {
  return <section aria-label={label} className="platform-request-scope">
    <Field label="查看范围"><SearchableSelect searchable={false} value={scope} onChange={onChange} options={[{ value: "mine", label: "本人" }, { value: "all", label: "全部" }]} placeholder="选择查看范围" /></Field>
    <small><span className="platform-text-phrase">调整查看范围可查看</span><span className="platform-text-phrase">团队内其它{moduleName.replaceAll('/', '')}{recordLabel}</span></small>
  </section>;
}
function ReviewHistory({ row, logs = [] }) {
  const matching = logs.filter(log => log.action !== "完成" && (String(log.target_id) === String(row._id) || (log.target_public_id && log.target_public_id === row.public_id)));
  const history = matching.length ? matching : (row.reviewed_at || row.review_note || row.reviewed_by) ? [{ _id: "latest-review", created_at: row.reviewed_at, reviewer_name: row.reviewed_by, reviewer_username: row.reviewed_username, action: row.status === "已关闭" ? row.closed_from_status || "已驳回" : ["待入库", "已完成", "已归档"].includes(row.status) ? "已通过" : row.status, review_note: row.review_note }] : [];
  if (!history.length) return null;
  return <details style={styles.logBox}><summary>审批记录（{history.length} 条）</summary><RecentRecords rows={sortByCreatedAt(history)}>{shown => <DataTable mobileColumns={["审批人", "审批结果", "审批意见", "审批时间"]} columns={["审批时间", "审批人", "审批结果", "审批意见"]} rows={shown.map(log => [formatDate(log.created_at), log.reviewer_name || log.reviewer_username || "-", log.action, log.review_note || "未填写"])} />}</RecentRecords></details>;
}
function WorkRequestCard({ currentUser, onReimbursementChange, row, logs = [], compact = false, attachmentPanel, actions, historyPanel }) {
  return <div className="platform-request-record" style={styles.listItem}>
    <div style={styles.rowBetween}>
      <div>
        <h3 style={styles.h3}>{row.work_content || formatPublicNumber(row.public_id)}</h3>
        <RequestIdentity row={row} />
      </div>
      <div style={styles.badgeRow}>
        <Badge text={row.status === "已通过" ? "已通过 · 待确认完成" : row.status} />
        <ReimbursementBadge row={row} />
        {row.completion_modified && <Badge text="完成时已修改" />}
        {compact && row.reviewed_by && <strong className="platform-identity">审批人：{row.reviewed_by}</strong>}
      </div>
    </div>
    <div className="platform-detail-grid" style={styles.detailGrid4}>
      <Info label={row.request_type === "维修" ? "维修人员单位" : `${row.request_type || "测试/加工/维修"}渠道`} value={row.external_unit} />
      {row.request_type === "维修" && <Info label="维修人员" value={row.repair_personnel || "未登记"} />}
      <Info label="工作量" value={`${row.workload_quantity || "-"} ${row.workload_unit || ""}`} />
      <Info label={(isCompletedWork(row) ? "最终总" : row.status === "已关闭" ? "原预计总" : "预计总") + row.request_type + "费"} value={money(workFee(row))} />
      {isCompletedWork(row) && <Info label="工单状态" value={<ReimbursementStatus row={row} currentUser={currentUser} onChange={onReimbursementChange} />} />}
    </div>
    {row.status === "已关闭" && <ClosureInfo row={row} />}
    {isCompletedWork(row) && <p style={styles.meta}>完成人：<strong className="platform-identity"><PersonName value={row.completed_by || row.completed_username || "未记录"} /></strong> · 完成时间：{formatDate(row.completed_at)}</p>}
    {!compact && <>
      {row.completion_modified && <details style={styles.logBox}><summary><strong>完成时修改记录</strong></summary><p style={styles.note}>{completionChangesText(row)}</p></details>}
      {(row.safety_notes || row.remark || row.completion_note) && <div style={styles.detailGrid2}>
        {row.safety_notes && <Info label="安全事项" value={row.safety_notes} />}
        {row.remark && <Info label="备注" value={row.remark} />}
        {row.completion_note && <Info label="完成备注" value={row.completion_note} />}
      </div>}
      <ReviewHistory row={row} logs={logs} />
    </>}
    {attachmentPanel}
    {actions}
    {historyPanel}
  </div>;
}
export { ClosureInfo, RequestHistorySection, RequestViewScope, ReviewHistory, ReviewTeacherField, WorkRequestCard };
