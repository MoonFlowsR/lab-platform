import { useEffect, useState } from "react";
import { splitRequestSections } from "../../shared/lib/request-sections.js";
import { styles } from "../../app/styles.js";
import { canReviewAssignedRequest, reviewTeacherName } from "../../shared/lib/review-scope.js";
import { formatDate, money, normalizeItemName, num, uniqueNonEmpty } from "../../app/formatters.js";
import { Badge, DateInput, Field, Info, SearchableSelect, Toolbar } from "../../shared/components/ui.jsx";
import { ClosureInfo, RequestHistorySection, RequestViewScope, ReviewHistory, ReviewTeacherField } from "../../shared/components/request-records.jsx";
import { AttachmentPanel, ExistingAttachmentsViewer, FilePicker, PreSubmitAttachmentUploader } from "../../shared/components/attachments.jsx";
import RecordActions from "../../shared/components/RecordActions.jsx";
import DashboardMetrics from "../dashboard/DashboardMetrics.jsx";
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

function PurchasesPage({ registeredTeacherAccounts = [], teacherAccounts = [], reviewScope = "mine", onReviewScopeChange, viewScope = "mine", onViewScopeChange, materialCatalog = [], rows, logs = [], attachments = [], batches = [], purchaseHistory = [], purchaseCatalog = [], fundSummary = {}, currentUser, units = [], canSubmit, canReview, isAdmin = false, onAdd, onResubmit, onWithdraw, onReview, onCompleteInbound, onCloseRejected, onDeleteRecord, onHideRecord, onUploadAttachment, onDownloadAttachment, onDeleteAttachment, onExport }) {
  const isManager = canReview || isAdmin;
  const [editingRow, setEditingRow] = useState(null);
  useEffect(() => { if (editingRow && !rows.some(row => row._id === editingRow._id)) setEditingRow(null); }, [rows, editingRow]);
  const [inboundRow, setInboundRow] = useState(null);
  const { ongoing, history } = splitRequestSections(rows, { purchase: true, manager: isManager });
  const studentCanEdit = (row) => canSubmit && row.applicant_username === currentUser?.username && ["已撤回", "需修改", "已驳回"].includes(row.status);
  const studentCanClose = row => canSubmit && row.applicant_username === currentUser?.username && ["已驳回", "需修改"].includes(row.status);
  const studentCanWithdraw = (row) => currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待教师审核";
  const canInbound = (row) => canSubmit && currentUser?.account_type === "student" && row.applicant_username === currentUser.username && row.status === "待入库";

  const renderCard = (p) => {
    const rowAttachments = attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_purchase_requests" && (String(a.target_id) === String(p._id) || a.target_public_id === p.public_id));
    return <div key={p._id} style={styles.listItem}>
      <div style={styles.rowBetween}>
        <div>
          <h3 style={styles.h3}>{p.material_name}</h3>
          <p style={styles.meta}>{formatPublicNumber(p.public_id)} · 申请人：<strong className="platform-identity">{p.applicant_name}</strong> · 审核教师：<strong className="platform-identity">{reviewTeacherName(p)}</strong> · 提交时间：{formatDate(p.created_at)}</p>
        </div>
        <div style={styles.badgeRow}><Badge text={p.status} />{p.is_first_purchase && <Badge text="首次采购" />}</div>
      </div>
      <div className="platform-detail-grid" style={styles.detailGrid4}>
        <Info label="采购类别" value={p.purchase_category || "未填写"} />
        <Info label="规格" value={p.specification} />
        <Info label="数量" value={`${p.quantity} ${p.unit}`} />
        <Info label="采购渠道" value={p.preferred_supplier} />
        <Info label="预计金额" value={money(p.estimated_price)} />
        {p.reviewed_by && <Info label="审批人" value={p.reviewed_by} />}
        <Info label="使用目的" value={p.purchase_purpose || "未标注"} />
        {p.received_status === "已入库" && <Info label="有效期" value={p.expiry_date || "未填写"} />}
        <Info label="入库状态" value={p.received_status || (p.status === "已完成" ? "已入库" : "-")} />
        {(p.storage_room || p.storage_location) && <Info label="存放房间" value={p.storage_room || p.storage_location} />}
        {p.storage_detail && <Info label="具体位置简述" value={p.storage_detail} />}
      </div>
      {p.safety_notes && <p><b>安全事项：</b>{p.safety_notes}</p>}
      {p.remark && <p><b>备注：</b>{p.remark}</p>}
      {p.review_note && <p style={styles.note}><b>审核意见：</b>{p.review_note}{p.reviewed_by && <>（审批人：<strong className="platform-identity">{p.reviewed_by}</strong>）</>}</p>}
      <ReviewHistory row={p} logs={logs} />
      {p.status === "待入库" && <div style={styles.securityBox}><b>下一步：</b>物品到货后，原申请人上传照片并确认入库，采购才标记为“已完成”。</div>}
      {p.status === "已关闭" && <ClosureInfo row={p} />}
      <AttachmentPanel targetCollection="lab_purchase_requests" row={p} attachments={rowAttachments} onUpload={onUploadAttachment} onDownload={onDownloadAttachment} />
      {canInbound(p) && inboundRow?._id === p._id && <PurchaseInboundForm teacherAccounts={registeredTeacherAccounts} row={p} onCancel={() => setInboundRow(null)} onSubmit={async (form, photo) => {
        const ok = await onCompleteInbound(p, form, photo);
        if (ok !== false) setInboundRow(null);
        return ok;
      }} />}
      <RecordActions dangerous={isAdmin ? <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_purchase_requests", p)}>永久删除申请</button> : !canReview && <>{studentCanClose(p) && <button style={styles.warningButton} onClick={() => onCloseRejected?.("lab_purchase_requests", p)}>关闭工单</button>}<button style={styles.lightButton} onClick={() => onHideRecord?.("lab_purchase_requests", p)}>从我的列表隐藏</button></>}>
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
      title={isAdmin ? "采购记录" : canReview ? "采购审核" : "采购/入库"}
      description={isAdmin ? "查看团队采购和入库进度，管理记录。" : canReview ? "审核采购申请；到货后由申请人完成入库。" : "提交采购申请，跟进审核和入库。"}
      onExport={onExport}
    />
    {canSubmit && !editingRow && <PurchaseForm registeredTeacherAccounts={registeredTeacherAccounts} teacherAccounts={teacherAccounts} materialCatalog={materialCatalog} onSubmit={onAdd} purchaseHistory={purchaseHistory} purchaseCatalog={purchaseCatalog} batches={batches} fundSummary={fundSummary} currentUser={currentUser} units={units} />}
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

    {currentUser?.account_type === "teacher" && <RequestViewScope scope={reviewScope} onChange={onReviewScopeChange} label="采购审核查看范围" />}
    {currentUser?.account_type === "student" && <section aria-label="采购查看范围" className="platform-purchase-scope" style={styles.card}>
      <Field label="查看范围"><SearchableSelect value={viewScope} onChange={onViewScopeChange} clearOnInput={false} options={[{ value: "mine", label: "本人" }, { value: "all", label: "全部" }]} placeholder="搜索或选择查看范围" /></Field>
      <small style={styles.muted}>调整查看范围可查看团队内其它采购/入库进度</small>
    </section>}
    <DashboardMetrics purchases={rows} types={["采购"]} mode={canSubmit ? "student" : canReview ? "review" : "team"} money={money} />
    <RequestHistorySection className="platform-section-pending" title={isManager ? '待审核采购' : '进行中采购工单'} rows={ongoing} renderCard={renderCard} emptyText={`暂无${isManager ? '待审核' : '进行中'}采购申请。`} />
    <RequestHistorySection className="platform-section-reviewed" key={`${currentUser?.username}-purchases`} title={isAdmin ? '历史采购记录' : canReview ? '已审核采购' : '已完成采购工单'} rows={history} renderCard={renderCard} emptyText={`暂无${isAdmin ? '历史' : canReview ? '已审核' : '已完成'}采购申请。`} />
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
    <div style={styles.cardHeader}>
      <div>
        <h2 style={styles.h2}>{isEditing ? "修改并重新提交采购" : "新建采购申请"}</h2>
        <p style={styles.muted}>申请人：<strong className="platform-identity">{initialData?.applicant_name || initialData?.applicant_username || currentUser?.display_name || currentUser?.username}</strong> · 提交日期和时间由系统自动记录。</p>
      </div>
      {isEditing ? <button type="button" style={styles.lightButton} onClick={onCancel}>取消修改</button> : <button type="button" style={styles.primaryButton} onClick={() => setShow(!show)}>{show ? "收起表单" : "新建采购"}</button>}
    </div>

    {show && <>
      <p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p>
      <p role="note" style={{ color: "#b91c1c", fontSize: 13, lineHeight: 1.6, margin: "6px 0 12px" }}>若物品名称不存在，请先切换采购类别或尝试其他表示方法；仍未找到时选择“其它”填写，保存后自动加入列表。</p>

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
          <SearchableSelect required value={purchaseCategory} options={["试剂原料", "耗材"]} placeholder="搜索或选择采购类别" onChange={value => {
            setPurchaseCategory(value); setCustomMaterial(false);
            setForm((prev) => ({ ...prev, material_name: "", specification: "无", preferred_supplier: "", safety_notes: "", repeat_purchase_confirmed: false }));
          }} />
        </Field>
        <Field required label="采购物品名称"><SearchableSelect required value={customMaterial ? otherMaterialName : canonicalMaterialName(form.material_name)} onChange={name => { setCustomMaterial(name === otherMaterialName); changeMaterial(name === otherMaterialName ? "" : name); }} options={itemNames} searchTerms={materialTerms} placeholder="选择物品或搜索“其它”" /></Field>
        {customMaterial && <Field required label="其它采购物品名称"><input required style={styles.input} value={form.material_name} onChange={e => set("material_name", e.target.value)} placeholder="请填写具体采购物品名称" /></Field>}
        <SpecificationFields key={`${initialData?._id || 'new'}:${purchaseCategory}:${customMaterial ? 'custom' : form.material_name}`} value={form.specification} onChange={value => set("specification", value)} options={specificationOptions} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label="数量"><input required type="number" min="0" step="any" style={styles.input} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></Field>
        <CustomOptionFields key={`unit:${initialData?._id || 'new'}:${form.material_name}`} required label="单位" customLabel="其它单位" value={form.unit} onChange={value => set("unit", value)} options={uniqueNonEmpty([...purchaseUnits, ...catalogItems.flatMap(item => item.units || []), initialData?.unit])} placeholder="选择单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={30} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <CustomOptionFields key={`supplier:${initialData?._id || 'new'}:${form.material_name}`} required label="采购渠道 / 供应商" customLabel="其它采购渠道 / 供应商" value={form.preferred_supplier} onChange={value => set("preferred_supplier", value)} options={supplierNames} placeholder="选择渠道或搜索“其它”" customPlaceholder="请填写具体采购渠道或供应商" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
        <Field required label="使用目的"><SearchableSelect required value={form.purchase_purpose} onChange={value => set("purchase_purpose", value)} options={[{ value: "私用/项目用（出库需采购人审批）", label: "私用/项目用（出库需采购人审批）" }, "公用"]} placeholder="搜索或选择使用目的" /></Field>
        <ReviewTeacherField teachers={teacherAccounts} value={form.review_teacher_username} onChange={value => set("review_teacher_username", value)} />
        <Field required label="预计金额 / 元"><input required type="number" min="0" step="any" style={styles.input} value={form.estimated_price} onChange={(e) => set("estimated_price", Number(e.target.value))} /></Field>

        <Field wide required={isFirstPurchase} label={isFirstPurchase ? "安全事项（首次采购必填）" : "安全事项（可沿用历史）"}>
          <textarea required={isFirstPurchase} style={styles.textarea} value={form.safety_notes} onChange={(e) => set("safety_notes", e.target.value)} placeholder={latestSame?.safety_notes ? `历史记录：${latestSame.safety_notes}` : "危险性、储存要求、个人防护、特殊操作/废弃要求等"} />
        </Field>

        {!isFirstPurchase && <Field wide required label="重复采购确认">
          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={Boolean(form.repeat_purchase_confirmed)} onChange={(e) => set("repeat_purchase_confirmed", e.target.checked)} />
            <span>已确认历史同名采购已用完或现有库存不足，仍需再次采购。</span>
          </label>
        </Field>}

        <Field wide label="备注（可选）"><textarea style={styles.textarea} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
        {isEditing && existingAttachments.length > 0 && <Field wide label="已上传附件（可下载/可删除）"><ExistingAttachmentsViewer attachments={existingAttachments} onDownload={onDownloadAttachment} onDelete={onDeleteAttachment} allowDelete /></Field>}
        <Field wide label="新增附件（可选）"><PreSubmitAttachmentUploader attachments={pendingAttachments} onChange={setPendingAttachments} helper={`可上传报价单、商品截图等。提交前可下载核对或删除；提交后只支持下载，撤回/需修改后可替换。支持格式：${ALLOWED_ATTACHMENT_LABEL}。`} /></Field>
        <div style={styles.formActions}><button style={styles.primaryButton}>{submitLabel}</button></div>
      </form>
    </>}
  </section>;
}
function PurchaseInboundForm({ row, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    actual_qty: num(row.quantity) || 1,
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
      <div><h3 style={styles.h3}>到货并完成入库</h3><p style={styles.muted}>核对到货信息并上传物品特写，提交后完成采购入库。</p></div>
      <button type="button" style={styles.lightButton} onClick={onCancel}>取消</button>
    </div>
    <p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p>
    <form style={styles.formGrid} onSubmit={async (e) => {
      e.preventDefault();
      if (!form.storage_detail.trim()) return showAlert("请填写具体位置简述。");
      if (!form.expiry_date) return showAlert("请选择实际有效期或长期有效。");
      try { validatePhotoFile(photo); } catch (error) { return showAlert(error.message || error); }
      setBusy(true);
      try { await onSubmit(form, photo); } finally { setBusy(false); }
    }}>

      <Field required label="实际到货数量"><input required type="number" min="0" step="any" style={styles.input} value={form.actual_qty} onChange={(e) => set("actual_qty", Number(e.target.value))} /></Field>
      <Field required label="单位"><input required style={styles.input} value={form.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
      <StorageFields form={form} onChange={patch => setForm(prev => ({ ...prev, ...patch }))} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
      <ExpiryDateField value={form.expiry_date} onChange={value => set("expiry_date", value)} Field={Field} DateInput={DateInput} styles={styles} />
      <ItemPhotoFields photo={photo} onPhotoChange={setPhoto} Field={Field} FilePicker={FilePicker} styles={styles} />
      <Field wide label="入库备注（可选）"><textarea style={styles.textarea} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
      <div style={styles.formActions}><button disabled={busy} style={styles.successButton}>{busy ? "处理中..." : "确认入库并完成采购"}</button></div>
    </form>
  </div>;
}
export { PurchasesPage };
