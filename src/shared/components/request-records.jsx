import { styles } from "../../app/styles.js";
import { formatDate, money, sortByCreatedAt } from "../../app/formatters.js";
import { reviewTeacherName } from "../lib/review-scope.js";
import { Badge, DataTable, Empty, Field, Info, SearchableSelect } from "./ui.jsx";
import RecentRecords from "./RecentRecords.jsx";
import { completionChangesText, isCompletedWork, workFee } from "../../features/work/work-values.js";
import { formatPublicNumber } from "../lib/public-number.js";

function ClosureInfo({ row }) {
  return <p style={styles.meta}>关闭人：<strong className="platform-identity">{row.closed_by_name || row.closed_by_username || "未记录"}</strong> · 关闭时间：{formatDate(row.closed_at)} · <strong>不计完成费用或入库金额</strong></p>;
}
function PurchaseSummaryCard({ row }) {
  return <div style={styles.listItem}>
    <div style={styles.rowBetween}>
      <div>
        <h3 style={styles.h3}>{row.material_name || formatPublicNumber(row.public_id)}</h3>
        <p style={styles.meta}>{formatPublicNumber(row.public_id)} · 申请人：<strong className="platform-identity">{row.applicant_name}</strong> · 审核教师：<strong className="platform-identity">{reviewTeacherName(row)}</strong> · 提交时间：{formatDate(row.created_at)}</p>
      </div>
      <Badge text={row.status} />
    </div>
    {row.status === "已关闭" && <ClosureInfo row={row} />}
    <div className="platform-detail-grid" style={styles.detailGrid4}>
      <Info label="规格" value={row.specification} />
      <Info label="数量" value={`${row.quantity || "-"} ${row.unit || ""}`} />
      <Info label="采购渠道" value={row.preferred_supplier} />
      <Info label="使用目的" value={row.purchase_purpose || "未标注"} />
      {row.received_status === "已入库" && <Info label="有效期" value={row.expiry_date || "未填写"} />}
      <Info label="预计金额" value={money(row.estimated_price)} />
    </div>
    {row.review_note && <p style={styles.note}><b>审批意见：</b>{row.review_note}{row.reviewed_by && <>（审批人：<strong className="platform-identity">{row.reviewed_by}</strong>）</>}</p>}
  </div>;
}
function RequestHistorySection({ title, rows, renderCard, emptyText, className = 'platform-section-history' }) {
  return <section className={className} style={styles.card}>
    <div style={styles.cardHeader}><h2 style={styles.h2}>{title}（{rows.length}）</h2></div>
    {rows.length === 0 ? <Empty text={emptyText} /> : <RecentRecords rows={rows}>{shown => shown.map(renderCard)}</RecentRecords>}
  </section>;
}
function ReviewTeacherField({ teachers, value, onChange }) {
  return <Field required label="审核教师"><SearchableSelect required value={value || ""} onChange={onChange} options={teachers.map(teacher => ({ value: teacher.username, label: teacher.display_name && teacher.display_name !== teacher.username ? `${teacher.display_name}（${teacher.username}）` : teacher.display_name || teacher.username }))} placeholder="搜索或选择审核教师" />{teachers.length === 0 && <small style={{ ...styles.muted, color: "#b91c1c" }}>暂无可选教师，请联系管理员启用教师账号。</small>}</Field>;
}
function RequestViewScope({ scope, onChange, label }) {
  return <section aria-label={label} className="platform-purchase-scope" style={styles.card}>
    <Field label="查看范围"><SearchableSelect value={scope} onChange={onChange} clearOnInput={false} options={[{ value: "mine", label: "本人" }, { value: "all", label: "全部" }]} placeholder="搜索或选择查看范围" /></Field>
    <small style={styles.muted}>调整查看范围可查看团队内其它测试/加工/采购/入库进度</small>
  </section>;
}
function ReviewHistory({ row, logs = [] }) {
  const matching = logs.filter(log => log.action !== "完成" && (String(log.target_id) === String(row._id) || (log.target_public_id && log.target_public_id === row.public_id)));
  const history = matching.length ? matching : (row.reviewed_at || row.review_note || row.reviewed_by) ? [{ _id: "latest-review", created_at: row.reviewed_at, reviewer_name: row.reviewed_by, reviewer_username: row.reviewed_username, action: row.status === "已关闭" ? row.closed_from_status || "已驳回" : ["待入库", "已完成", "已归档"].includes(row.status) ? "已通过" : row.status, review_note: row.review_note }] : [];
  if (!history.length) return null;
  return <details open style={styles.logBox}><summary>审批记录（{history.length} 条）</summary><RecentRecords rows={sortByCreatedAt(history)}>{shown => <DataTable mobileColumns={["审批人", "审批结果", "审批意见", "审批时间"]} columns={["审批时间", "审批人", "审批结果", "审批意见"]} rows={shown.map(log => [formatDate(log.created_at), log.reviewer_name || log.reviewer_username || "-", log.action, log.review_note || "未填写"])} />}</RecentRecords></details>;
}
function WorkRequestCard({ row, logs = [], compact = false, completionDetailsOpen = false, attachmentPanel, actions, historyPanel }) {
  return <div style={styles.listItem}>
    <div style={styles.rowBetween}>
      <div>
        <h3 style={styles.h3}>{row.work_content || formatPublicNumber(row.public_id)}</h3>
        <p style={styles.meta}>{formatPublicNumber(row.public_id)} · {row.request_type || "测试/加工"} · 申请人：<strong className="platform-identity">{row.applicant_name}</strong> · 审核教师：<strong className="platform-identity">{reviewTeacherName(row)}</strong> · 提交时间：{formatDate(row.created_at)}</p>
      </div>
      <div style={styles.badgeRow}>
        <Badge text={row.status === "已通过" ? "已通过 · 待确认完成" : row.status} />
        {row.completion_modified && <Badge text="完结时已修改" />}
        {compact && row.reviewed_by && <strong className="platform-identity">审批人：{row.reviewed_by}</strong>}
      </div>
    </div>
    <div className="platform-detail-grid" style={styles.detailGrid4}>
      <Info label={`${row.request_type || "测试/加工"}渠道`} value={row.external_unit} />
      <Info label="工作量" value={`${row.workload_quantity || "-"} ${row.workload_unit || ""}`} />
      <Info label={(isCompletedWork(row) ? "最终总" : row.status === "已关闭" ? "原预计总" : "预计总") + row.request_type + "费"} value={money(workFee(row))} />
      {isCompletedWork(row) && <Info label="开票/挂账状态" value={row.settlement_status || "未登记"} />}
    </div>
    {row.status === "已关闭" && <ClosureInfo row={row} />}
    {isCompletedWork(row) && <p style={styles.meta}>完结人：<strong className="platform-identity">{row.completed_by || row.completed_username || "未记录"}</strong> · 完成时间：{formatDate(row.completed_at)}</p>}
    {!compact && <>
      {row.completion_modified && <details open={completionDetailsOpen} style={styles.logBox}><summary><strong>完结修改记录</strong></summary><p style={styles.note}>{completionChangesText(row)}</p></details>}
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
export { ClosureInfo, PurchaseSummaryCard, RequestHistorySection, RequestViewScope, ReviewHistory, ReviewTeacherField, WorkRequestCard };
