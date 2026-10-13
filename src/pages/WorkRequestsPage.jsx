import { useEffect, useState } from "react";
import { splitRequestSections, splitReviewedWorkSections } from "./../request-sections.js";
import { AttachmentPanel, ExistingAttachmentsViewer, PreSubmitAttachmentUploader } from "./../components/attachments.jsx";
import { styles } from "./../app/styles.js";
import RecordActions from "./../RecordActions.jsx";
import { canReviewAssignedRequest } from "./../review-scope.js";
import { RequestHistorySection, RequestViewScope, ReviewTeacherField, WorkRequestCard } from "./../components/request-records.jsx";
import { Field, SearchableSelect, Toolbar } from "./../components/ui.jsx";
import { money, num } from "./../app/formatters.js";
import DashboardMetrics from "./../DashboardMetrics.jsx";
import { workOptions } from "./../work-options.js";
import { showAlert } from "./../platform-dialog.jsx";
import CustomOptionFields from "./../CustomOptionFields.jsx";
import { ALLOWED_ATTACHMENT_LABEL } from "./../app/attachment-validation.js";

function WorkRequestsPage({ workHistory = [], teacherAccounts = [], reviewScope = "mine", onReviewScopeChange, fixedType, rows, logs, attachments = [], currentUser, units = [], canSubmit, canReview, isAdmin = false, onAdd, onResubmit, onWithdraw, onReview, onComplete, onCloseRejected, onDeleteRecord, onHideRecord, onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onExport }) {
  const isManager = canReview || isAdmin;
  const [editingRow, setEditingRow] = useState(null);
  useEffect(() => { if (editingRow && !rows.some(row => row._id === editingRow._id)) setEditingRow(null); }, [rows, editingRow]);
  const { ongoing, history, modified = [] } = isManager ? splitReviewedWorkSections(rows) : splitRequestSections(rows);
  const studentCanEdit = (row) => canSubmit && row.applicant_username === currentUser?.username && ["已撤回", "需修改", "已驳回"].includes(row.status);
  const studentCanClose = row => canSubmit && row.applicant_username === currentUser?.username && ["已驳回", "需修改"].includes(row.status);
  const studentCanWithdraw = (row) => currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待教师审核";

  const renderCard = (row) => {
    const rowAttachments = attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_work_requests" && (String(a.target_id) === String(row._id) || a.target_public_id === row.public_id));
    return <WorkRequestCard
      key={row._id}
      row={row}
      completionDetailsOpen={isManager && row.completion_modified === true}
      logs={logs.filter((log) => String(log.target_id) === String(row._id) || log.target_public_id === row.public_id)}
      attachmentPanel={<AttachmentPanel targetCollection="lab_work_requests" row={row} attachments={rowAttachments} onUpload={onUploadAttachment} onDownload={onDownloadAttachment} />}
      actions={<RecordActions dangerous={isAdmin ? <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_work_requests", row)}>永久删除申请</button> : !canReview && <>{studentCanClose(row) && <button style={styles.warningButton} onClick={() => onCloseRejected?.("lab_work_requests", row)}>关闭工单</button>}<button style={styles.lightButton} onClick={() => onHideRecord?.("lab_work_requests", row)}>从我的列表隐藏</button></>}>
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

  const title = isAdmin ? `${fixedType}记录` : canReview ? `${fixedType}审核` : fixedType;
  const description = isAdmin
    ? `查看全部申请及审批记录。`
    : canReview
      ? `同意或驳回待审核申请，保留审批记录。`
      : `提交和跟进${fixedType}申请，查看团队进度。`;

  return <main>
    <Toolbar title={title} description={description} onExport={onExport} />
    {canSubmit && !editingRow && <WorkRequestForm workHistory={workHistory} teacherAccounts={teacherAccounts} fixedType={fixedType} onSubmit={onAdd} currentUser={currentUser} units={units} />}
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

    {["teacher", "student"].includes(currentUser?.account_type) && <RequestViewScope scope={reviewScope} onChange={onReviewScopeChange} label={`${fixedType}${canReview ? "审核" : ""}查看范围`} />}
    <DashboardMetrics workRequests={rows} types={[fixedType]} mode={canSubmit ? "student" : canReview ? "review" : "team"} money={money} />
    <RequestHistorySection className="platform-section-pending" title={isManager ? `待审核${fixedType}` : `进行中${fixedType}工单`} rows={ongoing} renderCard={renderCard} emptyText={`暂无${isManager ? '待审核' : '进行中'}${fixedType}申请。`} />
    <RequestHistorySection key={`${currentUser?.username}-${fixedType}`} title={isAdmin ? `历史${fixedType}记录` : canReview ? `已审核${fixedType}` : `已完成${fixedType}工单`} rows={history} renderCard={renderCard} emptyText={`暂无${isAdmin ? '历史' : canReview ? '已审核' : '已完成'}${fixedType}申请。`} />
    {isManager && <RequestHistorySection className="platform-section-modified" title={`审批后修改的${fixedType}工单`} rows={modified} renderCard={renderCard} emptyText="暂无审批后修改的工单。" />}
  </main>;
}
function WorkRequestForm({ workHistory = [], teacherAccounts = [], fixedType, onSubmit, currentUser, units = [], initialData = null, existingAttachments = [], onDownloadAttachment, onDeleteAttachment, submitLabel = "提交教师审核", onCancel }) {
  const isEditing = Boolean(initialData);
  const choices = workOptions(fixedType, workHistory, units, initialData || {});
  const defaultForm = {
    request_type: fixedType,
    review_teacher_username: "",
    work_content: "",
    external_unit: "",
    workload_quantity: 1,
    workload_unit: "样品",
    safety_notes: "",
    cost_test: "",
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
        if (![form.work_content, form.external_unit, form.workload_unit].every(value => String(value || "").trim() && !["其它", "其他", "__custom_option__"].includes(String(value).trim()))) return showAlert("请完整选择或填写名称、渠道和计费方式。");
        if (!teacherAccounts.some(teacher => teacher.username === form.review_teacher_username)) return showAlert("请选择已启用的审核教师。");
        if (busy) return;
        setBusy(true);
        try {
          const ok = await onSubmit({ ...form, work_content: form.work_content.trim(), request_type: fixedType }, pendingAttachments);
          if (ok !== false && !isEditing) {
            setPendingAttachments([]);
            setForm(defaultForm);
            setShow(false);
          }
        } finally { setBusy(false); }
      }}>
        <CustomOptionFields required label={fixedType + "名称"} customLabel={"其它" + fixedType + "名称"} value={form.work_content} onChange={value => set("work_content", value)} options={choices.names} placeholder={"搜索或选择" + fixedType + "名称"} customPlaceholder={"请填写具体" + fixedType + "名称"} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <CustomOptionFields required label={fixedType + "渠道"} customLabel={"其它" + fixedType + "渠道"} value={form.external_unit} onChange={value => set("external_unit", value)} options={choices.channels} placeholder={"搜索或选择" + fixedType + "渠道"} customPlaceholder="请填写具体执行单位或渠道" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label="数量">
          <input required type="number" min="0.01" step="0.01" style={styles.input} value={form.workload_quantity} onChange={(e) => set("workload_quantity", Number(e.target.value))} />
        </Field>
        <CustomOptionFields required label="计费方式" customLabel="其它计费方式" value={form.workload_unit} onChange={value => set("workload_unit", value)} options={choices.billing} placeholder="搜索或选择计费方式" customPlaceholder="请填写具体计费方式" maxLength={60} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label={"预计总" + fixedType + "费 / 元"}>
          <input required type="number" min="0" step="0.01" style={styles.input} value={fixedType === "测试" ? form.cost_test : form.cost_processing} onChange={(e) => set(fixedType === "测试" ? "cost_test" : "cost_processing", e.target.value)} />
        </Field>
        <ReviewTeacherField teachers={teacherAccounts} value={form.review_teacher_username} onChange={value => set("review_teacher_username", value)} />
        <Field wide label="安全注意事项（可选）">
          <textarea style={styles.textarea} value={form.safety_notes} onChange={(e) => set("safety_notes", e.target.value)} placeholder="如有特殊安全要求请填写" />
        </Field>
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
