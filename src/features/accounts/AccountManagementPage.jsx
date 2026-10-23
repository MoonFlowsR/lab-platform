import { RecordVisibility } from '../../shared/components/RecentRecords.jsx';
import ExportButton from '../../shared/components/ExportButton.jsx';
import AccountSettingsDialog from './AccountSettingsDialog.jsx';
import { callLabOps } from '../../app/api.js';
import { SearchableSelect } from '../../shared/components/ui.jsx';
import { showAlert, showConfirm, showForm } from '../../shared/components/platform-dialog.jsx';
import AuditLog from './AuditLog.jsx';
import { useState } from "react";
import { Badge, DataTable, Empty, StatCard, Toolbar } from "../../shared/components/ui.jsx";
import { styles } from "../../app/styles.js";
import { accountStatusLabels, accountTypeLabels } from "../../app/config.js";
import { formatDate } from "../../app/formatters.js";

function AccountManagementPage({ task, accounts = [], allAccounts = [], teachers = [], onReload, auditProps, onSetAccountStatus, onResetPassword, onExportAccounts }) {
  const [editing, setEditing] = useState(null);
  async function transfer(row) {
    try {
      const preview = await callLabOps('adminTransferStockApprover', {id:row.id || row._id, preview:true}, auditProps.account);
      if (!preview.count) return showAlert('该账号暂无需要移交的私用/项目用物品。');
      const values = await showForm({title:'移交出库审批',message:'采购人及入库历史保留。未完成的出库申请改交接收人重新审批。',details:[{label:'原审批人',value:row.display_name || row.username},{label:'涉及批次',value:preview.count}],fields:[{name:'username',label:'接收人',required:true,value:'',render:({value,onChange})=><SearchableSelect required value={value} onChange={onChange} options={allAccounts.filter(a=>a.status==='active'&&a.username!==row.username&&['student','teacher'].includes(a.account_type)).map(a=>({value:a.username,label:a.display_name || a.username}))} placeholder="搜索或选择接收人"/>}]});
      if (!values) return;
      if (!await showConfirm('确认将这 '+preview.count+' 个批次的出库审批移交给 '+values.username+'？')) return;
      await callLabOps('adminTransferStockApprover',{id:row.id || row._id,username:values.username,revision:preview.revision},auditProps.account);
      await onReload();
    } catch(error) {showAlert(error.message);}
  }
  async function changeRole(row) {
    const next = row.account_type === 'finance' ? 'teacher' : 'finance';
    const label = next === 'finance' ? '财务' : '教师';
    if (!await showConfirm('将此账号切换为' + label + '？切换后需重新登录。', {title:'切换账号身份',details:[{label:'账号',value:row.display_name || row.username},{label:'新身份',value:label}]})) return;
    try { await callLabOps('adminSetAccountRole',{id:row.id || row._id,account_type:next,expected_updated_at:row.updated_at},auditProps.account);await onReload(); }
    catch(error) { await showAlert(error.message); }
  }
  const [showAllAccounts, setShowAllAccounts] = useState(Boolean(task));
  const newestFirst = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || Number(b.id || b._id) - Number(a.id || a._id);
  const orderedAccounts = [...accounts].sort(newestFirst);
  const shownAccounts = showAllAccounts ? orderedAccounts : orderedAccounts.slice(0, 1);
  const activeAccounts = accounts.filter((a) => a.status === "active").length;
  const pendingAccounts = accounts.filter((a) => a.status === "pending").length;
  const disabledAccounts = accounts.filter((a) => a.status === "disabled").length;
  const adminCount = accounts.filter((a) => a.account_type === "admin").length;

  return <main>
    <Toolbar title="账号管理" />
    {editing && <AccountSettingsDialog adminEdit account={editing} teachers={teachers} onClose={()=>setEditing(null)} onSaveProfile={async values=>{await callLabOps("adminUpdateStudentProfile",{id:editing.id || editing._id,...values},auditProps.account);setEditing(null);await onReload();}} />}
    <div style={styles.statsGrid}>
      <StatCard title="全部账号" value={accounts.length} tone="blue" />
      <StatCard title="启用账号" value={activeAccounts} tone="green" />
      <StatCard title="待审核账号" value={pendingAccounts} tone="orange" />
      <StatCard title="停用账号" value={disabledAccounts} tone="red" />
      <StatCard title="管理员账号" value={adminCount} tone="purple" />
    </div>
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>账号列表</h2><div style={styles.buttonRowCompact}><ExportButton subject="账号" onExport={onExportAccounts} /></div></div>
      <RecordVisibility total={accounts.length} expanded={showAllAccounts} onToggle={() => setShowAllAccounts(value => !value)} controlsId="account-list-rows" />
      <div id="account-list-rows">
      {accounts.length === 0 ? <Empty text="暂无账号数据。" /> : <DataTable columns={["姓名", "身份", "状态", "个人资料", "创建时间", "操作"]} mobileColumns={["姓名", "身份", "状态", "个人资料", "创建时间"]} rows={shownAccounts.map(a => [
          a.display_name || a.username,
          accountTypeLabels[a.account_type] || a.account_type,
          <Badge key="status" text={accountStatusLabels[a.status] || a.status || "启用中"} />,
          a.account_type === "student" ? a.student_profile ? `${a.student_profile.graduation_year}年毕业 / 合作结束` : <strong key="profile" style={{color:"#b91c1c"}}>待完善</strong> : "—",
          formatDate(a.created_at),
          <div key="actions" style={styles.buttonRowCompact}>
            {["teacher","finance"].includes(a.account_type) && <button style={styles.lightButton} onClick={()=>changeRole(a)}>{a.account_type === "finance" ? "设为教师" : "设为财务"}</button>}
            {a.account_type === "student" && <button style={styles.lightButton} onClick={()=>setEditing(a)}>修改学生资料</button>}
            {a.account_type !== "admin" && <button style={styles.lightButton} onClick={()=>transfer(a)}>移交出库审批</button>}
            {a.status === "pending" && <button style={styles.successButton} onClick={() => onSetAccountStatus(a, "active")}>审核通过</button>}
            {a.status === "disabled" && <button style={styles.successButton} onClick={() => onSetAccountStatus(a, "active")}>启用</button>}
            {a.status !== "disabled" && <button style={styles.warningButton} onClick={() => onSetAccountStatus(a, "disabled")}>停用</button>}
            {a.status === "active" && <button style={styles.lightButton} onClick={() => onSetAccountStatus(a, "pending")}>设为待审核</button>}
            <button style={styles.secondaryButton} onClick={() => onResetPassword(a)}>重置密码</button>
          </div>
      ])} />}
      </div>
      <RecordVisibility total={accounts.length} expanded={showAllAccounts} onToggle={() => setShowAllAccounts(value => !value)} controlsId="account-list-rows" footer />
    </section>
    {!task && <AuditLog {...auditProps} />}
  </main>;
}
export { AccountManagementPage };
