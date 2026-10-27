import PersonName from '../../shared/components/PersonName.jsx';
import RequestIdentity from '../../shared/components/RequestIdentity.jsx';
import ReimbursementStatus, { ReimbursementBadge } from '../finance/ReimbursementStatus.jsx';
import { isReceivedPurchase, purchaseWasModified, purchaseAmount, purchaseAmountLabel, purchaseQuantityText, inboundChangesText } from './purchase-values.js';
import SupplierChangeHistory from "../../shared/components/SupplierChangeHistory.jsx";
import { useEffect, useState } from "react";
import { splitReviewedPurchaseSections } from "../../shared/lib/request-sections.js";
import { styles } from "../../app/styles.js";
import { canReviewAssignedRequest } from "../../shared/lib/review-scope.js";
import { formatDate, money, normalizeItemName, num, uniqueNonEmpty } from "../../app/formatters.js";
import { Badge, DateInput, Field, Info, SearchableSelect, Toolbar } from "../../shared/components/ui.jsx";
import { ClosureInfo, RequestHistorySection, RequestViewScope, ReviewHistory, ReviewTeacherField } from "../../shared/components/request-records.jsx";
import { AttachmentPanel, ExistingAttachmentsViewer, FilePicker, PreSubmitAttachmentUploader } from "../../shared/components/attachments.jsx";
import RecordActions from "../../shared/components/RecordActions.jsx";
import DashboardMetrics from "../dashboard/DashboardMetrics.jsx";
import ExportButton from "../../shared/components/ExportButton.jsx";
import { purchaseItems, purchaseSuppliers, purchaseUnits, suppliers } from "../../app/config.js";
import { summarizeMaterials } from "../inventory/material-summary.js";
import { canonicalMaterialName } from "../../shared/lib/dropdown-normalize.js";
import { materialSearchTerms } from "../inventory/material-model-search.js";
import { latestMaterialPurchase, purchaseFormFromHistory } from "./purchase-autofill.js";
import { showAlert } from "../../shared/components/platform-dialog.jsx";
import { formatPublicNumber } from "../../shared/lib/public-number.js";
import SpecificationFields from "../../shared/components/SpecificationFields.jsx";
import CustomOptionFields from "../../shared/components/CustomOptionFields.jsx";
import { ALLOWED_ATTACHMENT_LABEL, validatePhotoFile } from "../../app/attachment-validation.js";
import StorageFields from "../../shared/components/StorageFields.jsx";
import ExpiryDateField from "../../shared/components/ExpiryDateField.jsx";
import ItemPhotoFields from "../../shared/components/ItemPhotoFields.jsx";

function PurchasesPage({ task, onReimbursementChange, registeredTeacherAccounts = [], teacherAccounts = [], reviewScope = "mine", onReviewScopeChange, viewScope = "mine", onViewScopeChange, materialCatalog = [], rows, logs = [], attachments = [], batches = [], purchaseHistory = [], purchaseCatalog = [], fundSummary = {}, currentUser, units = [], canSubmit, canReview, isAdmin = false, onAdd, onResubmit, onWithdraw, onReview, onCompleteInbound, onCloseRejected, onDeleteRecord, onHideRecord, onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onExport }) {
  const [editingRow, setEditingRow] = useState(null);
  useEffect(() => { if (editingRow && !rows.some(row => row._id === editingRow._id)) setEditingRow(null); }, [rows, editingRow]);
  const [inboundRow, setInboundRow] = useState(null);
  const { pending, reviewed, completed, modified } = splitReviewedPurchaseSections(rows);
  const studentCanEdit = (row) => canSubmit && row.applicant_username === currentUser?.username && ["需修改", "已驳回"].includes(row.status);
  const studentCanClose = row => canSubmit && row.applicant_username === currentUser?.username && ["已驳回", "需修改"].includes(row.status);
  const studentCanWithdraw = (row) => currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待教师审核";
  const canInbound = (row) => canSubmit && currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待入库";

  const renderCard = (p) => {
    const rowAttachments = attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_purchase_requests" && (String(a.target_id) === String(p._id) || a.target_public_id === p.public_id));
    return <div key={p._id} className="platform-request-record" style={styles.listItem}>
      <div style={styles.rowBetween}>
        <div>
          <h3 style={styles.h3}>{p.material_name}</h3>
          <RequestIdentity row={p} />
        </div>
        <div style={styles.badgeRow}><Badge text={p.status} /><ReimbursementBadge row={p} />{purchaseWasModified(p) && <Badge text="完成时已修改" />}{p.is_first_purchase && <Badge text="首次采购" />}</div>
      </div>
      <div className="platform-detail-grid" style={styles.detailGrid4}>
        <Info label="采购类别" value={p.purchase_category || "未填写"} />
        <Info label="规格" value={p.specification} />
        <Info label={isReceivedPurchase(p) ? "到货数量" : "数量"} value={purchaseQuantityText(p)} />
        <Info label="采购渠道" value={p.preferred_supplier} />
        <Info label={purchaseAmountLabel(p)} value={money(purchaseAmount(p))} />
        {isReceivedPurchase(p) && <Info label="工单状态" value={<ReimbursementStatus row={p} currentUser={currentUser} onChange={onReimbursementChange} />} />}
        <Info label="使用目的" value={p.purchase_purpose || "未标注"} />
        {p.received_status === "已入库" && <Info label="有效期" value={p.expiry_date || "未填写"} />}
        <Info label="入库状态" value={p.received_status || (p.status === "已完成" ? "已入库" : "-")} />
        {(p.storage_room || p.storage_location) && <Info label="存放房间" value={p.storage_room || p.storage_location} />}
        {p.storage_detail && <Info label="具体位置简述" value={p.storage_detail} />}
      </div>
      {p.safety_notes && <p><b>安全事项：</b>{p.safety_notes}</p>}
      {p.remark && <p><b>备注：</b>{p.remark}</p>}
      {isReceivedPurchase(p) && <p style={styles.meta}>入库确认人：<strong className="platform-identity"><PersonName value={p.completed_by || p.completed_username || "未登记"} /></strong> · 确认时间：{formatDate(p.completed_at)}</p>}
      {purchaseWasModified(p) && <details style={styles.logBox}><summary><strong>完成时修改记录</strong></summary><p style={styles.note}>{inboundChangesText(p)}</p></details>}
      {p.inbound_note && <p><b>入库备注：</b>{p.inbound_note}</p>}
      <ReviewHistory row={p} logs={logs} />
      <SupplierChangeHistory row={p} />
      {p.status === "待入库" && <div style={styles.securityBox}><b>下一步：</b>物品到货后，原申请人上传照片并确认入库，采购才标记为“已完成”。</div>}
      {p.status === "已关闭" && <ClosureInfo row={p} />}
      <AttachmentPanel targetCollection="lab_purchase_requests" row={p} attachments={rowAttachments} onUpload={onUploadAttachment} onDownload={onDownloadAttachment} />
      {canInbound(p) && inboundRow?._id === p._id && <PurchaseInboundForm teacherAccounts={registeredTeacherAccounts} row={p} onCancel={() => setInboundRow(null)} onSubmit={async (form, photo) => {
        const ok = await onCompleteInbound(p, form, photo);
        if (ok !== false) setInboundRow(null);
        return ok;
      }} />}
      <RecordActions dangerous={isAdmin ? <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_purchase_requests", p)}>永久删除申请</button> : currentUser?.account_type === "student" && <>{studentCanClose(p) && <button style={styles.warningButton} onClick={() => onCloseRejected?.("lab_purchase_requests", p)}>关闭工单</button>}<button style={styles.lightButton} onClick={() => onHideRecord?.("lab_purchase_requests", p)}>从我的列表隐藏</button></>}>
        {canReview && canReviewAssignedRequest(p, currentUser) && p.status === "待教师审核" && <>
          <button style={styles.successButton} onClick={() => onReview(p, "已通过")}>同意</button>
          <button style={styles.dangerButton} onClick={() => onReview(p, "已驳回")}>驳回</button>
        </>}
        {studentCanWithdraw(p) && <button style={styles.warningButton} onClick={() => onWithdraw(p)}>撤回</button>}
        {studentCanEdit(p) && <button style={styles.secondaryButton} onClick={() => setEditingRow(p)}>修改/重新提交</button>}
        {canInbound(p) && <button style={styles.successButton} onClick={() => setInboundRow(inboundRow?._id === p._id ? null : p)}>{inboundRow?._id === p._id ? "收起入库" : "确认到货并入库"}</button>}
      </RecordActions>
    </div>;
  };

  return <main>
    <Toolbar
      title={(isAdmin || currentUser?.account_type === "finance") ? "采购记录" : canReview ? "采购审核" : "采购/入库"}
      description={(isAdmin || currentUser?.account_type === "finance") ? "查看团队采购和入库进度，管理记录。" : canReview ? "审核采购申请；到货后由申请人完成入库。" : "提交采购申请，跟进审核和入库。"}
      onExport={task ? onExport : undefined}
      scope={!task && (currentUser?.account_type === "teacher" ? <RequestViewScope scope={reviewScope} onChange={onReviewScopeChange} label="采购审核查看范围" moduleName="采购/入库" /> : currentUser?.account_type === "student" ? <RequestViewScope scope={viewScope} onChange={onViewScopeChange} label="采购查看范围" moduleName="采购/入库" /> : null)}
    />
    {canSubmit && !task && !editingRow && <PurchaseForm registeredTeacherAccounts={registeredTeacherAccounts} teacherAccounts={teacherAccounts} materialCatalog={materialCatalog} onSubmit={onAdd} purchaseHistory={purchaseHistory} purchaseCatalog={purchaseCatalog} batches={batches} fundSummary={fundSummary} currentUser={currentUser} units={units} />}
    {canSubmit && editingRow && <PurchaseForm registeredTeacherAccounts={registeredTeacherAccounts} teacherAccounts={teacherAccounts} materialCatalog={materialCatalog}
      initialData={editingRow}
      existingAttachments={attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_purchase_requests" && (String(a.target_id) === String(editingRow._id) || a.target_public_id === editingRow.public_id))}
      onDownloadAttachment={onDownloadAttachment}
      onDeleteAttachment={onDeleteAttachment}
      submitLabel="保存修改并重新提交"
      onCancel={() => setEditingRow(null)}
      onSubmit={async (form, pendingAttachments) => {
        const ok = await onResubmit(editingRow, form, pendingAttachments);
        if (ok !== false) setEditingRow(null);
        return ok;
      }}
      purchaseHistory={purchaseHistory}
      purchaseCatalog={purchaseCatalog}
      batches={batches}
      fundSummary={fundSummary}
      currentUser={currentUser}
      units={units}
    />}

    {task ? <RequestHistorySection showTitle={false} className={"platform-section-" + (task.section || "pending")} title={task.title} rows={rows} renderCard={renderCard} defaultExpanded emptyText={task.count ? "没有符合搜索的记录。" : "当前没有此类待办。"} /> : <>
    <DashboardMetrics showReimbursement={currentUser?.account_type === "finance"} purchases={rows} types={["采购"]} mode={canSubmit ? "student" : canReview ? "review" : "team"} money={money} actions={<ExportButton onExport={onExport} />} />
    <RequestHistorySection className="platform-section-pending" title="待审批采购工单" rows={pending} renderCard={renderCard} emptyText="暂无待审批工单。" />
    <RequestHistorySection className="platform-section-approved" title="已审批采购工单" rows={reviewed} renderCard={renderCard} emptyText="暂无已审批未完成工单。" />
    <RequestHistorySection className="platform-section-reviewed" title="已完成采购工单" rows={completed} renderCard={renderCard} emptyText="暂无已完成工单。" />
    <RequestHistorySection className="platform-section-modified" title="完成时修改的采购工单" rows={modified} renderCard={renderCard} emptyText="暂无入库确认时修改过信息的工单。" />
    </>}
  </main>;
}
function PurchaseForm({ teacherAccounts = [], materialCatalog = [], onSubmit, purchaseHistory = [], purchaseCatalog = [], batches = [], currentUser, units = [], initialData = null, existingAttachments = [], onDownloadAttachment, onDeleteAttachment, submitLabel = "提交采购审核", onCancel }) {
  const isEditing = Boolean(initialData);
  const catalogItems = materialCatalog.length ? materialCatalog : purchaseItems;
  const materialTerms = materialSearchTerms(catalogItems, batches);
  const otherMaterialName = "其它";
  const [customMaterial, setCustomMaterial] = useState(false);
  function initialCategory() {
    if (["试剂原料", "耗材"].includes(initialData?.purchase_category)) return initialData.purchase_category;
    const matches = catalogItems.filter((item) => normalizeItemName(item.name) === normalizeItemName(initialData?.material_name));
    if (matches.length === 1) return matches[0].category;
    const specMatches = matches.filter((item) => item.specifications.includes(initialData?.specification));
    return specMatches.length === 1 ? specMatches[0].category : "";
  }
  const defaultForm = {
    material_name: "",
    review_teacher_username: "",
    specification: "无",
    quantity: 1,
    unit: "g",
    preferred_supplier: "",
    purchase_purpose: "",
    estimated_price: 0,
    safety_notes: "",
    repeat_purchase_confirmed: false,
    remark: "",
  };
  const [purchaseCategory, setPurchaseCategory] = useState(initialCategory);
  const [show, setShow] = useState(Boolean(initialData));
  const [form, setForm] = useState({ ...defaultForm, ...(initialData || {}) });
  const [pendingAttachments, setPendingAttachments] = useState([]);

  useEffect(() => {
    setForm({ ...defaultForm, ...(initialData || {}) });
    setPurchaseCategory(initialCategory());
    setShow(Boolean(initialData)); setCustomMaterial(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Reset on record identity; background sync must preserve unsaved form input.
  }, [initialData?._id]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const normalizedName = normalizeItemName(form.material_name);
  const historyMatches = purchaseHistory
    .filter((p) => String(p._id) !== String(initialData?._id || ""))
    .filter((p) => !["已撤回", "已驳回"].includes(p.status))
    .filter((p) => normalizeItemName(p.material_name) === normalizedName && normalizedName);
  const catalogMatch = purchaseCatalog.find((item) => item.normalized_name === normalizedName) || null;
  const currentWasCounted = Boolean(initialData?.public_id && catalogMatch && normalizeItemName(initialData.material_name) === normalizedName && !["已撤回", "已驳回"].includes(initialData.status));
  const previousCount = Math.max(0, num(catalogMatch?.count) - (currentWasCounted ? 1 : 0));
  const latestSame = historyMatches[0] || (previousCount > 0 && catalogMatch ? {
    public_id: catalogMatch.last_public_id,
    quantity: catalogMatch.last_quantity,
    unit: catalogMatch.last_unit,
    status: catalogMatch.last_status,
    safety_notes: catalogMatch.last_safety_notes,
  } : null);
  const currentStock = summarizeMaterials([], batches.filter(b => normalizeItemName(b.material_name) === normalizedName && normalizedName))[0]?.stock_by_spec.map(item => `${item.spec}：${item.quantity} ${item.unit}`).join("；") || "0";
  const isFirstPurchase = !normalizedName || previousCount === 0;
  const selectedItems = catalogItems.filter((item) => normalizeItemName(item.name) === normalizedName && (!purchaseCategory || (item.categories || [item.category]).includes(purchaseCategory)));
  const itemNames = uniqueNonEmpty([
    ...catalogItems.filter((item) => !purchaseCategory || (item.categories || [item.category]).includes(purchaseCategory)).map((item) => item.name),
    ...(!purchaseCategory ? [canonicalMaterialName(initialData?.material_name)] : []),
    otherMaterialName,
  ]);
  const specificationOptions = uniqueNonEmpty(selectedItems.flatMap((item) => item.specifications));
  const supplierNames = uniqueNonEmpty([
    ...(purchaseCategory ? purchaseSuppliers[purchaseCategory] : suppliers),
    ...catalogItems.flatMap(item => item.suppliers || []),
    ...units.filter((u) => u.unit_type === "采购单位" || u.unit_type === "其他").map((u) => u.unit_name),
    initialData?.preferred_supplier,
  ]);
  function changeMaterial(name) {
    const matches = catalogItems.filter((entry) => entry.name === name);
    const item = matches.find((entry) => (entry.categories || [entry.category]).includes(purchaseCategory)) || (matches.length === 1 ? matches[0] : null);
    if (item && !(item.categories || [item.category]).includes(purchaseCategory)) setPurchaseCategory(item.category);
    const previous = latestMaterialPurchase(name, purchaseHistory, initialData?._id || "");
    setForm(prev => prev.material_name === name ? prev : { ...purchaseFormFromHistory({ ...defaultForm, specification: item?.specifications.length === 1 ? item.specifications[0] : "无" }, name, previous), review_teacher_username: prev.review_teacher_username });
  }

  return <section className="platform-section-create" style={styles.card}>
    <div className="platform-create-heading has-meta" style={styles.cardHeader}>
      <div>
        <h2 style={styles.h2}>{isEditing ? "修改并重新提交采购" : "新建采购申请"}</h2>
        <p className="platform-request-form-meta" style={styles.muted}><span>申请人：<strong className="platform-identity"><PersonName value={initialData?.applicant_name || initialData?.applicant_username || currentUser?.display_name || currentUser?.username} /></strong></span><span>提交时间：自动记录</span></p>
      </div>
      {isEditing ? <button type="button" style={styles.lightButton} onClick={onCancel}>取消修改</button> : <button type="button" style={styles.primaryButton} onClick={() => setShow(!show)}>{show ? "收起表单" : "新建采购"}</button>}
    </div>

    {show && <>
      <p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p>
      <p role="note" style={{ color: "var(--danger-ink)", fontSize: "var(--text-label)", lineHeight: 1.6, margin: "6px 0 12px" }}>若物品名称不存在，请先切换采购类别或尝试其他表示方法；仍未找到时选择“其它”填写，保存后自动加入列表。</p>

      {latestSame && <div style={styles.warningBox}>
        <b>检测到历史同名采购：</b>{formatPublicNumber(latestSame.public_id)}，最近数量 {latestSame.quantity} {latestSame.unit}，状态“{latestSame.status}”；当前库存：{currentStock}。请确认历史采购已用完或现有库存不足后再提交。
      </div>}

      <form style={styles.formGrid} onSubmit={async (e) => {
        e.preventDefault();
        if (!String(form.material_name).trim() || !String(form.specification).trim() || !String(form.preferred_supplier).trim()) return showAlert("请填写采购物品名称、规格和采购渠道。");
        if (!["试剂原料", "耗材"].includes(purchaseCategory)) return showAlert("请选择采购类别。");
        if (!["私用/项目用（出库需采购人审批）", "公用"].includes(form.purchase_purpose)) return showAlert("请选择采购使用目的。");
        if (!String(form.unit).trim() || String(form.unit).trim().length > 30 || ["其它", "其他", "__custom_option__"].includes(String(form.unit).trim())) return showAlert("请选择单位，或选择“其它”后填写具体单位（不超过30字）。");
        if (!isFirstPurchase && !form.repeat_purchase_confirmed) return showAlert("检测到历史同名采购，请先勾选确认现有库存不足或已用完。");
        if (isFirstPurchase && !String(form.safety_notes || "").trim()) return showAlert("首次采购该物品必须填写安全事项。");
        if (!teacherAccounts.some(teacher => teacher.username === form.review_teacher_username)) return showAlert("请选择已启用的审核教师。");
        const { expiry_date: unusedExpiry, ...application } = form;
        const ok = await onSubmit({ ...application, purchase_category: purchaseCategory, repeat_purchase_confirmed: Boolean(form.repeat_purchase_confirmed) }, pendingAttachments);
        if (ok !== false && !isEditing) {
          setPendingAttachments([]);
          setForm(defaultForm);
          setPurchaseCategory(""); setCustomMaterial(false);
          setShow(false);
        }
      }}>

        <Field required label="采购类别">
          <SearchableSelect searchable={false} required value={purchaseCategory} options={["试剂原料", "耗材"]} placeholder="选择采购类别" onChange={value => {
            setPurchaseCategory(value); setCustomMaterial(false);
            setForm((prev) => ({ ...prev, material_name: "", specification: "无", preferred_supplier: "", safety_notes: "", repeat_purchase_confirmed: false }));
          }} />
        </Field>
        <Field required label="采购物品名称"><SearchableSelect required value={customMaterial ? otherMaterialName : canonicalMaterialName(form.material_name)} onChange={name => { setCustomMaterial(name === otherMaterialName); changeMaterial(name === otherMaterialName ? "" : name); }} options={itemNames} searchTerms={materialTerms} placeholder="选择物品或搜索“其它”" /></Field>
        {customMaterial && <Field required label="其它采购物品名称"><input required style={styles.input} value={form.material_name} onChange={e => set("material_name", e.target.value)} placeholder="请填写具体采购物品名称" /></Field>}
        <SpecificationFields key={`${initialData?._id || 'new'}:${purchaseCategory}:${customMaterial ? 'custom' : form.material_name}`} value={form.specification} onChange={value => set("specification", value)} options={specificationOptions} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label="数量"><input required type="number" min="0" step="any" style={styles.input} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></Field>
        <CustomOptionFields key={`unit:${initialData?._id || 'new'}:${form.material_name}`} required label="单位" customLabel="其它单位" value={form.unit} onChange={value => set("unit", value)} options={uniqueNonEmpty([...purchaseUnits, ...catalogItems.flatMap(item => item.units || []), initialData?.unit])} placeholder="选择单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={30} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <CustomOptionFields key={`supplier:${initialData?._id || 'new'}:${form.material_name}`} required label="采购渠道" customLabel="其它采购渠道" value={form.preferred_supplier} onChange={value => set("preferred_supplier", value)} options={supplierNames} placeholder="选择渠道或搜索“其它”" customPlaceholder="请填写具体采购渠道" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label="使用目的"><SearchableSelect searchable={false} required value={form.purchase_purpose} onChange={value => set("purchase_purpose", value)} options={[{ value: "私用/项目用（出库需采购人审批）", label: "私用/项目用（出库需采购人审批）" }, "公用"]} placeholder="选择使用目的" /></Field>
        <ReviewTeacherField teachers={teacherAccounts} value={form.review_teacher_username} onChange={value => set("review_teacher_username", value)} />
        <Field required label="预计金额 / 元"><input required type="number" min="0" step="any" style={styles.input} value={form.estimated_price} onChange={(e) => set("estimated_price", Number(e.target.value))} /></Field>

        <div className="platform-form-notes">
        <Field required={isFirstPurchase} label={isFirstPurchase ? "安全事项（首次采购必填）" : "安全事项（可沿用历史）"}>
          <textarea required={isFirstPurchase} style={styles.textarea} value={form.safety_notes} onChange={(e) => set("safety_notes", e.target.value)} placeholder={latestSame?.safety_notes ? `历史记录：${latestSame.safety_notes}` : "危险性、储存要求、个人防护、特殊操作/废弃要求等"} />
        </Field>
        <Field label="备注（可选）"><textarea style={styles.textarea} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
        </div>

        {!isFirstPurchase && <Field wide required label="重复采购确认">
          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={Boolean(form.repeat_purchase_confirmed)} onChange={(e) => set("repeat_purchase_confirmed", e.target.checked)} />
            <span>已确认历史同名采购已用完或现有库存不足，仍需再次采购。</span>
          </label>
        </Field>}

        {isEditing && existingAttachments.length > 0 && <Field wide label="已上传附件（可下载/可删除）"><ExistingAttachmentsViewer attachments={existingAttachments} onDownload={onDownloadAttachment} onDelete={onDeleteAttachment} allowDelete /></Field>}
        <Field wide label="新增附件（可选）"><PreSubmitAttachmentUploader attachments={pendingAttachments} onChange={setPendingAttachments} helper={`可上传报价单、商品截图等。提交前可下载核对或删除；提交后只支持下载，需修改后可替换。支持格式：${ALLOWED_ATTACHMENT_LABEL}。`} /></Field>
        <div style={styles.formActions}><button style={styles.primaryButton}>{submitLabel}</button></div>
      </form>
    </>}
  </section>;
}
function PurchaseInboundForm({ row, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    actual_qty: num(row.quantity) || 1,
    actual_total_price: row.estimated_price ?? "",
    settlement_status: "",
    unit: row.unit || "g",
    storage_location: "",
    storage_room: "",
    storage_detail: "",

    expiry_date: "",
    remark: "",
  });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  return <div className="platform-purchase-inbound" style={styles.inboundBox}>
    <div style={styles.cardHeader}>
      <div><h3 style={styles.h3}>到货并完成入库</h3><p style={styles.muted}>核对实际数量和总采购费，选择工单状态，上传物品特写后确认入库。</p></div>
      <button type="button" style={styles.lightButton} onClick={onCancel}>取消</button>
    </div>
    <p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p>
    <form style={styles.formGrid} onSubmit={async (e) => {
      e.preventDefault();
      if (!["已开票","已挂账"].includes(form.settlement_status)) return showAlert("请选择工单状态：已开票或已挂账。");
      if (!Number.isFinite(Number(form.actual_qty)) || Number(form.actual_qty) <= 0) return showAlert("实际到货数量必须大于 0。");
      if (!form.storage_detail.trim()) return showAlert("请填写具体位置简述。");
      if (!form.expiry_date) return showAlert("请选择实际有效期或长期有效。");
      try { validatePhotoFile(photo); } catch (error) { return showAlert(error.message || error); }
      setBusy(true);
      try { await onSubmit(form, photo); } finally { setBusy(false); }
    }}>

      <Field required label="实际到货数量"><input required type="number" min="0" step="any" style={styles.input} value={form.actual_qty} onChange={(e) => set("actual_qty", e.target.value)} /></Field>
      <Field required label="单位"><input required style={styles.input} value={form.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
      <Field required label="最终总采购费 / 元"><input required type="number" min="0" step="any" style={styles.input} value={form.actual_total_price} onChange={e => set("actual_total_price", e.target.value)} /></Field>
      <Field required label="工单状态"><SearchableSelect searchable={false} required value={form.settlement_status} onChange={value => set("settlement_status", value)} options={["已开票","已挂账"]} placeholder="请选择" /></Field>
      <StorageFields form={form} onChange={patch => setForm(prev => ({ ...prev, ...patch }))} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
      <ExpiryDateField value={form.expiry_date} onChange={value => set("expiry_date", value)} Field={Field} DateInput={DateInput} styles={styles} />
      <ItemPhotoFields photo={photo} onPhotoChange={setPhoto} Field={Field} FilePicker={FilePicker} styles={styles} />
      <Field wide label="入库备注（可选）"><textarea style={styles.textarea} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
      <div style={styles.formActions}><button disabled={busy} style={styles.successButton}>{busy ? "处理中..." : "确认入库并完成采购"}</button></div>
    </form>
  </div>;
}
export { PurchasesPage };
