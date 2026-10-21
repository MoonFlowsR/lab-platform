import { workFeeKey } from './work-types.js';
import { useEffect, useMemo, useState } from "react";
import { splitReviewedWorkSections } from "../../shared/lib/request-sections.js";
import WorkHistory from "./WorkHistory.jsx";
import { indexWorkHistory, recentSameWork } from "./work-history.js";
import { AttachmentPanel, ExistingAttachmentsViewer, PreSubmitAttachmentUploader } from "../../shared/components/attachments.jsx";
import { styles } from "../../app/styles.js";
import RecordActions from "../../shared/components/RecordActions.jsx";
import { canReviewAssignedRequest } from "../../shared/lib/review-scope.js";
import { RequestHistorySection, RequestViewScope, ReviewTeacherField, WorkRequestCard } from "../../shared/components/request-records.jsx";
import { Field, SearchableSelect, Toolbar } from "../../shared/components/ui.jsx";
import { money, num } from "../../app/formatters.js";
import DashboardMetrics from "../dashboard/DashboardMetrics.jsx";
import { workOptions } from "./work-options.js";
import { showAlert } from "../../shared/components/platform-dialog.jsx";
import CustomOptionFields from "../../shared/components/CustomOptionFields.jsx";
import { ALLOWED_ATTACHMENT_LABEL } from "../../app/attachment-validation.js";

function WorkRequestsPage({ task, onReimbursementChange, workHistory = [], teacherAccounts = [], reviewScope = "mine", onReviewScopeChange, fixedType, rows, logs, attachments = [], currentUser, units = [], canSubmit, canReview, isAdmin = false, onAdd, onResubmit, onWithdraw, onReview, onComplete, onCloseRejected, onDeleteRecord, onHideRecord, onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onExport }) {
  const historyIndex = useMemo(() => canReview ? indexWorkHistory(workHistory) : new Map(), [canReview, workHistory]);
  const [editingRow, setEditingRow] = useState(null);
  useEffect(() => { if (editingRow && !rows.some(row => row._id === editingRow._id)) setEditingRow(null); }, [rows, editingRow]);
  const { pending, reviewed, completed, modified } = splitReviewedWorkSections(rows);
  const studentCanEdit = (row) => canSubmit && row.applicant_username === currentUser?.username && ["已撤回", "需修改", "已驳回"].includes(row.status);
  const studentCanClose = row => canSubmit && row.applicant_username === currentUser?.username && ["已驳回", "需修改"].includes(row.status);
  const studentCanWithdraw = (row) => currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待教师审核";

  const renderCard = (row) => {
    const rowAttachments = attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_work_requests" && (String(a.target_id) === String(row._id) || a.target_public_id === row.public_id));
    return <WorkRequestCard
      key={row._id}
      currentUser={currentUser} onReimbursementChange={onReimbursementChange}
      row={row}
      completionDetailsOpen={row.completion_modified === true}
      historyPanel={canReview && row.status === "待教师审核" && <WorkHistory type={fixedType} rows={recentSameWork(row, historyIndex)} />}
      logs={logs.filter((log) => String(log.target_id) === String(row._id) || log.target_public_id === row.public_id)}
      attachmentPanel={<AttachmentPanel targetCollection="lab_work_requests" row={row} attachments={rowAttachments} onUpload={onUploadAttachment} onDownload={onDownloadAttachment} />}
      actions={<RecordActions dangerous={isAdmin ? <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_work_requests", row)}>永久删除申请</button> : currentUser?.account_type === "student" && <>{studentCanClose(row) && <button style={styles.warningButton} onClick={() => onCloseRejected?.("lab_work_requests", row)}>关闭工单</button>}<button style={styles.lightButton} onClick={() => onHideRecord?.("lab_work_requests", row)}>从我的列表隐藏</button></>}>
        {canReview && canReviewAssignedRequest(row, currentUser) && row.status === "待教师审核" && <>
          <button style={styles.successButton} onClick={() => onReview(row, "已通过")}>同意</button>
          <button style={styles.dangerButton} onClick={() => onReview(row, "已驳回")}>驳回</button>
        </>}
        {canSubmit && row.applicant_username === currentUser?.username && row.status === "已通过" && <button style={styles.successButton} onClick={() => onComplete(row)}>确认完成</button>}
        {studentCanWithdraw(row) && <button style={styles.warningButton} onClick={() => onWithdraw(row)}>撤回</button>}
        {studentCanEdit(row) && <button style={styles.secondaryButton} onClick={() => setEditingRow(row)}>修改/重新提交</button>}
      </RecordActions>}
    />;
  };

  const title = (isAdmin || currentUser?.account_type === "finance") ? `${fixedType}记录` : canReview ? `${fixedType}审核` : fixedType;
  const description = (isAdmin || currentUser?.account_type === "finance")
    ? `查看全部申请及审批记录。`
    : canReview
      ? `同意或驳回待审核申请，保留审批记录。`
      : `提交和跟进${fixedType}申请，查看团队进度。`;

  return <main>
    <Toolbar title={title} description={description} onExport={onExport} />
    {canSubmit && !task && !editingRow && <WorkRequestForm workHistory={workHistory} teacherAccounts={teacherAccounts} fixedType={fixedType} onSubmit={onAdd} currentUser={currentUser} units={units} />}
    {canSubmit && editingRow && <WorkRequestForm
      workHistory={workHistory}
      teacherAccounts={teacherAccounts}
      fixedType={fixedType}
      initialData={editingRow}
      existingAttachments={attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_work_requests" && (String(a.target_id) === String(editingRow._id) || a.target_public_id === editingRow.public_id))}
      onDownloadAttachment={onDownloadAttachment}
      onDeleteAttachment={onDeleteAttachment}
      submitLabel="保存修改并重新提交"
      onCancel={() => setEditingRow(null)}
      onSubmit={async (form, pendingAttachments) => {
        const ok = await onResubmit(editingRow, form, pendingAttachments);
        if (ok !== false) setEditingRow(null);
        return ok;
      }}
      currentUser={currentUser}
      units={units}
    />}

    {!task && ["teacher", "student"].includes(currentUser?.account_type) && <RequestViewScope key={fixedType} scope={reviewScope} onChange={onReviewScopeChange} label={`${fixedType}${canReview ? "审核" : ""}查看范围`} />}
    {task ? <RequestHistorySection showTitle={false} className={"platform-section-" + (task.section || "pending")} title={task.title} rows={rows} renderCard={renderCard} defaultExpanded emptyText={task.count ? "没有符合搜索的记录。" : "当前没有此类待办。"} /> : <>
    <DashboardMetrics showReimbursement={currentUser?.account_type === "finance"} workRequests={rows} types={[fixedType]} mode={canSubmit ? "student" : canReview ? "review" : "team"} money={money} />
    <RequestHistorySection className="platform-section-pending" title={`待审批${fixedType}工单`} rows={pending} renderCard={renderCard} emptyText="暂无待审批工单。" />
    <RequestHistorySection className="platform-section-approved" title={`已审批${fixedType}工单`} rows={reviewed} renderCard={renderCard} emptyText="暂无已审批未完成工单。" />
    <RequestHistorySection className="platform-section-reviewed" title={`已完成${fixedType}工单`} rows={completed} renderCard={renderCard} emptyText="暂无已完成工单。" />
    <RequestHistorySection className="platform-section-modified" title={`完成时修改的${fixedType}工单`} rows={modified} renderCard={renderCard} emptyText="暂无确认完成时修改过信息的工单。" />
    </>}
  </main>;
}
function WorkRequestForm({ workHistory = [], teacherAccounts = [], fixedType, onSubmit, currentUser, units = [], initialData = null, existingAttachments = [], onDownloadAttachment, onDeleteAttachment, submitLabel = "提交教师审核", onCancel }) {
  const isEditing = Boolean(initialData);
  const isRepair = fixedType === "维修";
  const contentLabel = isRepair ? "维修设备" : fixedType + "名称";
  const choices = workOptions(fixedType, workHistory, units, initialData || {});
  const defaultForm = {
    request_type: fixedType,
    review_teacher_username: "",
    work_content: "",
    external_unit: "",
    repair_personnel: "",
    workload_quantity: 1,
    workload_unit: fixedType === '维修' ? '次' : '样品',
    safety_notes: "",
    cost_test: "",
    cost_repair: "",
    cost_processing: initialData?.request_type === "加工" ? (initialData.cost_processing ?? (num(initialData.cost_test) + num(initialData.cost_material))) : "",
    remark: "",
  };
  const [show, setShow] = useState(Boolean(initialData));
  const [form, setForm] = useState({ ...defaultForm, ...(initialData || {}), request_type: fixedType });
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({ ...defaultForm, ...(initialData || {}), request_type: fixedType });
    setShow(Boolean(initialData));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Reset on record identity; background sync must preserve unsaved form input.
  }, [initialData?._id, fixedType]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));


  return <section className="platform-section-create" style={styles.card}>
    <div style={styles.cardHeader}>
      <div>
        <h2 style={styles.h2}>{isEditing ? `修改并重新提交${fixedType}` : `新建${fixedType}申请`}</h2>
        <p style={styles.muted}>申请人：<strong className="platform-identity">{initialData?.applicant_name || initialData?.applicant_username || currentUser?.display_name || currentUser?.username}</strong> · 提交日期和时间由系统自动记录。</p>
      </div>
      {isEditing ? <button type="button" style={styles.lightButton} onClick={onCancel}>取消修改</button> : <button type="button" style={styles.primaryButton} onClick={() => setShow(!show)}>{show ? "收起表单" : `新建${fixedType}`}</button>}
    </div>
    {show && <>
      <p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p>
      <form style={styles.formGrid} onSubmit={async (e) => {
        e.preventDefault();
        if (![form.work_content, form.external_unit, form.workload_unit].every(value => String(value || "").trim() && !["其它", "其他", "__custom_option__"].includes(String(value).trim()))) return showAlert(isRepair ? "请填写维修设备和维修人员单位。" : "请完整选择或填写名称、渠道和计量单位。");
        if (isRepair && !form.repair_personnel.trim()) return showAlert("请填写维修人员。");
        if (!teacherAccounts.some(teacher => teacher.username === form.review_teacher_username)) return showAlert("请选择已启用的审核教师。");
        if (busy) return;
        setBusy(true);
        try {
          const ok = await onSubmit({ ...form, work_content: form.work_content.trim(), external_unit: form.external_unit.trim(), ...(isRepair ? { repair_personnel: form.repair_personnel.trim() } : {}), request_type: fixedType }, pendingAttachments);
          if (ok !== false && !isEditing) {
            setPendingAttachments([]);
            setForm(defaultForm);
            setShow(false);
          }
        } finally { setBusy(false); }
      }}>
        <CustomOptionFields required label={contentLabel} customLabel={"其它" + contentLabel} value={form.work_content} onChange={value => set("work_content", value)} options={choices.names} placeholder={"选择" + contentLabel + "或搜索“其它”"} customPlaceholder={"请填写具体" + contentLabel} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        {!isRepair && <CustomOptionFields required label={fixedType + "渠道"} customLabel={"其它" + fixedType + "渠道"} value={form.external_unit} onChange={value => set("external_unit", value)} options={choices.channels} placeholder="选择渠道或搜索“其它”" customPlaceholder="请填写具体执行单位或渠道" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />}
        <Field required label="工作量">
          <input required type="number" min="0" step="any" style={styles.input} value={form.workload_quantity} onChange={(e) => set("workload_quantity", Number(e.target.value))} />
        </Field>
        <CustomOptionFields required label="计量单位" customLabel="其它计量单位" value={form.workload_unit} onChange={value => set("workload_unit", value)} options={choices.billing} placeholder="选择计量单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={60} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        {isRepair && <>
          <Field required label="维修人员"><input required maxLength={100} style={styles.input} value={form.repair_personnel} onChange={e => set("repair_personnel", e.target.value)} placeholder="填写维修人员姓名" /></Field>
          <CustomOptionFields required label="维修人员单位" customLabel="其它维修人员单位" value={form.external_unit} onChange={value => set("external_unit", value)} options={choices.channels} placeholder="选择维修人员单位或搜索“其它”" customPlaceholder="填写维修人员所属单位" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        </>}
        <Field required label={"预计总" + fixedType + "费 / 元"}>
          <input required type="number" min="0" step="0.01" style={styles.input} value={form[workFeeKey(fixedType)]} onChange={(e) => set(workFeeKey(fixedType), e.target.value)} />
        </Field>
        <ReviewTeacherField teachers={teacherAccounts} value={form.review_teacher_username} onChange={value => set("review_teacher_username", value)} />
        {!isRepair && <Field wide label="安全事项（可选）">
          <textarea style={styles.textarea} value={form.safety_notes} onChange={(e) => set("safety_notes", e.target.value)} placeholder="如有特殊安全要求请填写" />
        </Field>}
        <Field wide label="备注（可选）">
          <textarea style={styles.textarea} value={form.remark} onChange={(e) => set("remark", e.target.value)} />
        </Field>
        {isEditing && existingAttachments.length > 0 && <Field wide label="已上传附件（可下载/可删除）"><ExistingAttachmentsViewer attachments={existingAttachments} onDownload={onDownloadAttachment} onDelete={onDeleteAttachment} allowDelete /></Field>}
        <Field wide label="新增附件（可选）"><PreSubmitAttachmentUploader attachments={pendingAttachments} onChange={setPendingAttachments} helper={`提交前可下载核对或删除；提交后只支持下载，撤回/需修改后可删除错误附件并重新上传。支持格式：${ALLOWED_ATTACHMENT_LABEL}。`} /></Field>
        <div style={styles.formActions}><button disabled={busy} style={styles.primaryButton}>{busy ? "正在保存申请和附件..." : submitLabel}</button></div>
      </form>
    </>}
  </section>;
}
export { WorkRequestsPage };
