import { useState } from "react";
import { Badge, DataTable, Empty, StatCard, Toolbar } from "./../components/ui.jsx";
import { styles } from "./../app/styles.js";
import { accountStatusLabels, accountTypeLabels, auditActionLabel } from "./../app/config.js";
import { formatDate } from "./../app/formatters.js";

function AdminPage({ accounts = [], auditLogs = [], onSetAccountStatus, onResetPassword, onExportAccounts, onExportAudit }) {
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const newestFirst = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || Number(b.id || b._id) - Number(a.id || a._id);
  const orderedAccounts = [...accounts].sort(newestFirst), orderedAudit = [...auditLogs].sort(newestFirst);
  const shownAccounts = showAllAccounts ? orderedAccounts : orderedAccounts.slice(0, 3);
  const shownAudit = showAllAudit ? orderedAudit : orderedAudit.slice(0, 3);
  const activeAccounts = accounts.filter((a) => a.status === "active").length;
  const pendingAccounts = accounts.filter((a) => a.status === "pending").length;
  const disabledAccounts = accounts.filter((a) => a.status === "disabled").length;
  const adminCount = accounts.filter((a) => a.account_type === "admin").length;

  return <main>
    <Toolbar title="账号管理" />
    <div style={styles.statsGrid}>
      <StatCard title="全部账号" value={accounts.length} tone="blue" />
      <StatCard title="启用账号" value={activeAccounts} tone="green" />
      <StatCard title="待审核账号" value={pendingAccounts} tone="orange" />
      <StatCard title="停用账号" value={disabledAccounts} tone="red" />
      <StatCard title="管理员账号" value={adminCount} tone="purple" />
    </div>
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>账号列表</h2><div style={styles.buttonRowCompact}>{accounts.length > 3 && <button aria-expanded={showAllAccounts} style={styles.lightButton} onClick={() => setShowAllAccounts(!showAllAccounts)}>{showAllAccounts ? "仅显示最近3条账号" : `查看全部账号（${accounts.length}）`}</button>}<button style={styles.secondaryButton} onClick={onExportAccounts}>导出账号CSV</button></div></div>
      {accounts.length === 0 ? <Empty text="暂无账号数据。" /> : <div className="platform-table-scroll" style={styles.tableWrap}><table className="platform-data-table" style={styles.table}>
        <thead><tr>{["姓名", "身份", "状态", "个人资料", "创建时间", "操作"].map((c) => <th key={c} style={styles.th}>{c}</th>)}</tr></thead>
        <tbody>{shownAccounts.map((a) => <tr key={a.id || a._id}>
          <td data-label="姓名" style={styles.td}>{a.display_name || a.username}</td>
          <td data-label="身份" style={styles.td}>{accountTypeLabels[a.account_type] || a.account_type}</td>
          <td data-label="状态" style={styles.td}><Badge text={accountStatusLabels[a.status] || a.status || "启用中"} /></td>
          <td data-label="个人资料" style={styles.td}>{a.account_type === "student" ? a.student_profile ? <><strong>{a.student_profile.responsible_teacher_name}</strong> · {a.student_profile.guiding_teacher_name}<br/>{a.student_profile.graduation_year}年毕业</> : <strong style={{color:"#b91c1c"}}>待完善</strong> : "—"}</td>
          <td data-label="创建时间" style={styles.td}>{formatDate(a.created_at)}</td>
          <td data-label="操作" style={styles.td}><div style={styles.buttonRowCompact}>
            {a.status === "pending" && <button style={styles.successButton} onClick={() => onSetAccountStatus(a, "active")}>审核通过</button>}
            {a.status === "disabled" && <button style={styles.successButton} onClick={() => onSetAccountStatus(a, "active")}>启用</button>}
            {a.status !== "disabled" && <button style={styles.warningButton} onClick={() => onSetAccountStatus(a, "disabled")}>停用</button>}
            {a.status === "active" && <button style={styles.lightButton} onClick={() => onSetAccountStatus(a, "pending")}>设为待审核</button>}
            <button style={styles.secondaryButton} onClick={() => onResetPassword(a)}>重置密码</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section style={styles.card}>
      <div style={styles.cardHeader}><div><h2 style={styles.h2}>最近操作日志</h2><p style={styles.muted}>库存修正、账号操作、审核、采购入库、附件等关键动作均保留审计痕迹。</p></div><div style={styles.buttonRowCompact}>{auditLogs.length > 3 && <button aria-expanded={showAllAudit} style={styles.lightButton} onClick={() => setShowAllAudit(!showAllAudit)}>{showAllAudit ? "仅显示最近3条日志" : `查看全部日志（${auditLogs.length}）`}</button>}<button style={styles.secondaryButton} onClick={onExportAudit}>导出日志CSV</button></div></div>
      <p><a href="/help#comment-audit">查看帮助评论与完整操作记录（含已删除内容）</a></p>
      <DataTable columns={["时间", "操作人", "身份", "动作", "对象", "IP"]} rows={shownAudit.map((log) => [formatDate(log.created_at), log.operator_username, accountTypeLabels[log.operator_role] || (log.operator_role === "system" ? "系统维护" : log.operator_role), auditActionLabel(log.action), `${log.target_type || "-"}/${log.target_id || "-"}`, log.ip_address || "-"])} />
    </section>
  </main>;
}
export { AdminPage };
