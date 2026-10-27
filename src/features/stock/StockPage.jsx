import PersonName from '../../shared/components/PersonName.jsx';
import PhraseText from '../../shared/components/PhraseText.jsx';
import { Badge, DataTable, Field, SearchableSelect, Toolbar } from "../../shared/components/ui.jsx";
import { materialSearchTerms } from "../inventory/material-model-search.js";
import { styles } from "../../app/styles.js";
import { formatDate, normalizeItemName, uniqueNonEmpty } from "../../app/formatters.js";
import StockOutRequests from "./StockOutRequests.jsx";
import { MovementMetrics } from "../dashboard/DashboardMetrics.jsx";
import RecentRecords from "../../shared/components/RecentRecords.jsx";
import { StockPhotoLinks } from "../inventory/InventoryPage.jsx";
import RecordActions from "../../shared/components/RecordActions.jsx";
import { useState } from "react";
import { canonicalMaterialName } from "../../shared/lib/dropdown-normalize.js";
import { showAlert } from "../../shared/components/platform-dialog.jsx";
import { validatePhotoFile } from "../../app/attachment-validation.js";
import StorageFields from "../../shared/components/StorageFields.jsx";
import { FilePicker } from "../../shared/components/attachments.jsx";
import ItemPhotoFields from "../../shared/components/ItemPhotoFields.jsx";
import { batchIsPurchaserSelf, batchPurchaser, privateStockPurpose, stockApprovalExemptionText } from "./stock-out-policy.js";
import { formatPublicNumber } from "../../shared/lib/public-number.js";
import { RequestViewScope } from "../../shared/components/request-records.jsx";
import ExportButton from "../../shared/components/ExportButton.jsx";

function StockPage({ task, movementType = "", currentUser, purchaseRequests = [], teacherAccounts = [], requests = [], onReviewRequest, onCompleteRequest, onWithdrawRequest, onExportRequests, viewScope = "mine", onViewScopeChange, materialCatalog = [], rows, batches, attachments = [], isAdmin = false, onDeleteRecord, isManager, canSubmit, onAdd, onDownloadAttachment, onExport }) {
  const movementTypes = ["入库", "出库", "退库"];
  const selectedRows = movementType ? rows.filter(row => row.transaction_type === movementType) : rows;
  const otherRows = selectedRows.filter(row => !movementTypes.includes(row.transaction_type));
  const historyProps = { attachments, isAdmin, onDeleteRecord, onDownloadAttachment };
  return <main>
    <Toolbar title={isManager ? "出入退库" : "出/退库"} description={isManager ? "按学生、日期和出入退库类型筛选，分别查看入库、出库、退库。" : "登记出库和退库，查看库存流水及证明。"} onExport={task ? () => onExportRequests(requests) : undefined} scope={!task && canSubmit && <RequestViewScope scope={viewScope} onChange={onViewScopeChange} label="出退库查看范围" moduleName="出库/退库" recordLabel="记录" />} />
    {canSubmit && !task && <StockForm currentUser={currentUser} purchaseRequests={purchaseRequests} teacherAccounts={teacherAccounts} materialCatalog={materialCatalog} batches={batches} isManager={isManager} onSubmit={onAdd} />}
    {!task && <MovementMetrics rows={selectedRows} actions={<ExportButton onExport={() => onExport(selectedRows)} />} />}
    {(!movementType || movementType === '出库') && <StockOutRequests defaultExpanded={Boolean(task)} rows={requests} currentUser={currentUser} batches={batches} purchaseRequests={purchaseRequests} attachments={attachments} onReview={onReviewRequest} onComplete={onCompleteRequest} onWithdraw={onWithdrawRequest} onDownload={onDownloadAttachment} onExport={onExportRequests} styles={styles} formatDate={formatDate} Badge={Badge} />}
    {!task && <>
    {isManager ? movementTypes.filter(type => !movementType || type === movementType).map(type => <StockHistorySection key={type} title={`${type}历史`} rows={selectedRows.filter(row => row.transaction_type === type)} {...historyProps} extra={type === "入库" && otherRows.length > 0 ? <details><summary>库存修正记录（{otherRows.length}）</summary><StockHistorySection embedded title="库存修正" rows={otherRows} {...historyProps} /></details> : null} />) : <StockHistorySection title="库存流水历史" rows={selectedRows} {...historyProps} />}
    </>}
  </main>;
}
function StockHistorySection({ title, rows, attachments, isAdmin, onDeleteRecord, onDownloadAttachment, extra = null, embedded = false }) {
  return <section className="platform-section-history" style={embedded ? {} : styles.card}>
    <div style={styles.cardHeader}><h2 style={styles.h2}>{title}（{rows.length}）</h2></div>
    <RecentRecords rows={rows}>{shownRows => {
  const tableRows = shownRows.map((t) => {
    return [
      t.public_id,
      t.transaction_type,
      t.material_name,
      t.batch_code,
      `${t.quantity} ${t.unit}`,
      t.stock_before == null ? "—" : `${t.stock_before} ${t.unit || ""}`,
      t.stock_after == null ? "—" : `${t.stock_after} ${t.unit || ""}`,
      t.operator_name,
      t.storage_location || "-",
      t.purchase_purpose || "未标注",
      [stockApprovalExemptionText(t), t.purchaser_approved_by ? `${t.purchaser_approved_by} · ${formatDate(t.purchaser_approved_at)}` : t.consent_note].filter(Boolean).join('；') || "-",
      t.usage_reason || t.modification_reason || "-",
      ...(shownRows.some(row => row.associated_teacher_names) ? [t.associated_teacher_names || "未关联"] : []),
      formatDate(t.created_at),
      <StockPhotoLinks key={`photo-${t._id}`} row={t} attachments={attachments} onDownload={onDownloadAttachment} />,
      ...(isAdmin ? [<RecordActions key={`delete-${t._id}`} compact dangerous={<button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_stock_transactions", t)}>永久删除流水</button>} />] : []),
    ];
  });

  return <DataTable mobileColumns={["材料", "类型", "数量", "变更后", "操作人", "地点"]} columns={["编号", "类型", "材料", "批次", "数量", "变更前", "变更后", "操作人", "地点", "使用目的", "采购人审批 / 原同意备注", "用途/原因", ...(shownRows.some(row => row.associated_teacher_names) ? ["关联教师"] : []), "时间", "附件证明", ...(isAdmin ? ["管理操作"] : [])]} rows={tableRows} />;
    }}</RecentRecords>

      {extra}
    </section>;
}
function StockForm({ currentUser, purchaseRequests = [], materialCatalog = [], batches, onSubmit }) {
  const [materialName,setMaterialName] = useState(''), [show,setShow] = useState(false), [photo,setPhoto] = useState(null), [busy,setBusy] = useState(false);
  const defaults = () => ({ entry_key:crypto.randomUUID(),transaction_type:'出库',batch_id:'',quantity:1,unit:'',storage_room:'',storage_detail:'',storage_location:'',usage_reason:'' });
  const [form,setForm] = useState(defaults);
  const selectedBatch = batches.find(batch => String(batch._id) === String(form.batch_id));
  const projectOut = form.transaction_type === '出库' && selectedBatch?.purchase_purpose === privateStockPurpose;
  const selfPurchase = projectOut && batchIsPurchaserSelf(selectedBatch, currentUser, purchaseRequests);
  const approvalRequired = projectOut && !selfPurchase;
  const purchaser = batchPurchaser(selectedBatch, purchaseRequests);
  const materialNames = uniqueNonEmpty([...materialCatalog.map(item=>item.name),...batches.map(batch=>canonicalMaterialName(batch.material_name))]);
  const materialTerms = materialSearchTerms(materialCatalog, batches);
  const matchingBatches = materialName ? batches.filter(batch=>normalizeItemName(batch.material_name)===normalizeItemName(materialName)) : [];
  const batchSearchTerms = new Map(matchingBatches.map(batch => [String(batch._id), [batch.batch_code, formatPublicNumber(batch.batch_code)]]));
  const set = (key,value) => setForm(prev=>({...prev,[key]:value}));
  return <section className="platform-section-create" style={styles.card}>
    <div className="platform-create-heading is-movement" style={styles.cardHeader}><div><h2 style={styles.h2}>新增出/退库记录</h2><p className="platform-create-description" style={styles.muted}><PhraseText>出库：领用库存；退库：归还剩余材料。到货入库在采购工单完成。</PhraseText></p>{show && form.transaction_type === '出库' && <p className="platform-create-notice" role="note" style={{ color: "var(--danger-ink)", fontSize: 15, fontWeight: 700, lineHeight: 1.6, margin: "8px 0 0" }}><PhraseText>私用/项目用物品：采购人本人可直接登记；其他人须经采购人审批，通过后方可使用！</PhraseText></p>}</div><button type="button" style={styles.primaryButton} onClick={()=>setShow(!show)}>{show ? '收起表单' : '新增记录'}</button></div>
    {show && <><p style={styles.requiredHint}><span style={styles.requiredStar}>*</span> 为必填项</p><form style={styles.formGrid} onSubmit={async event=>{
      event.preventDefault(); if(busy)return;
      if(!form.storage_detail.trim()) return showAlert('请填写具体位置简述。');
      try { validatePhotoFile(photo); } catch(error) { return showAlert(error.message || error); }
      if(form.unit.trim()!==String(selectedBatch?.unit || '').trim()) return showAlert(`请使用当前批次的库存单位：${selectedBatch?.unit || '未设置'}。`);
      setBusy(true); try { const ok=await onSubmit(form,photo); if(ok!==false){setMaterialName('');setForm(defaults());setPhoto(null);setShow(false);} } finally {setBusy(false);}
    }}>

        <Field required label="类型"><SearchableSelect searchable={false} required value={form.transaction_type} onChange={value=>{set('transaction_type',value);setPhoto(null);set('entry_key',crypto.randomUUID());}} options={['出库','退库']} placeholder="选择出/退库类型" /></Field>
      <Field required label="材料名称"><SearchableSelect required value={materialName} onChange={name=>{setMaterialName(name);setForm(prev=>({...prev,batch_id:'',unit:'',storage_room:'',storage_detail:'',storage_location:'',entry_key:crypto.randomUUID()}));setPhoto(null);}} options={materialNames} searchTerms={materialTerms} placeholder="搜索或选择采购材料" /></Field>
      <Field required label="材料批次"><SearchableSelect required disabled={!materialName} value={form.batch_id} onChange={value=>{const batch=batches.find(row=>String(row._id)===value);setForm(prev=>({...prev,batch_id:value,unit:batch?.unit || '',storage_room:batch?.storage_room || '',storage_detail:batch?.storage_detail || '',storage_location:batch?.storage_location || '',entry_key:crypto.randomUUID()}));setPhoto(null);}} options={matchingBatches.map(batch=>({value:batch._id,label:`${formatPublicNumber(batch.batch_code)} · ${batch.material_name} · 规格 ${batch.spec || '无'} · ${batch.storage_room || '房间未登记'} · ${batch.purchase_purpose || '未标注'} · 当前 ${batch.current_qty} ${batch.unit}`}))} searchTerms={batchSearchTerms} placeholder={materialName ? '搜索或选择批次' : '请先选择材料'} /></Field>
      {materialName && !matchingBatches.length && <p role="note" style={{...styles.fullWidth,...styles.muted}}>该材料暂无库存批次。采购到货请在采购工单入库；现存材料可先建库。</p>}
      <Field required label="数量"><input required type="number" min="0" step="any" style={styles.input} value={form.quantity} onChange={event=>set('quantity',Number(event.target.value))} /></Field>
      <Field required label="单位"><input required style={styles.input} value={form.unit} onChange={event=>set('unit',event.target.value)} placeholder="选择批次后自动带出单位" /></Field>

      <StorageFields key={`${form.transaction_type}:${form.batch_id}`} form={form} onChange={patch=>setForm(prev=>({...prev,...patch}))} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
      {approvalRequired && <Field wide label="采购人审批"><p style={styles.note}>提交给采购人：<strong className="platform-identity"><PersonName value={purchaser.name || '未登记，请联系管理员核对'} /></strong>。同意后在下方出库申请中点击“完成出库登记”。</p></Field>}
      {selfPurchase && <p role="note" style={{ ...styles.fullWidth, ...styles.note }}>采购人本人，无需审批。保存后完成出库并扣减库存。</p>}
      <Field wide label="用途 / 备注（可选）"><textarea maxLength={2000} style={styles.textarea} value={form.usage_reason} onChange={event=>set('usage_reason',event.target.value)} /></Field>
      <ItemPhotoFields photo={photo} onPhotoChange={setPhoto} Field={Field} FilePicker={FilePicker} styles={styles} />
      <div style={styles.formActions}><button disabled={busy} style={styles.primaryButton}>{busy ? '提交中…' : approvalRequired ? '提交采购人审批' : selfPurchase ? '完成出库登记' : '保存流水'}</button></div>
    </form></>}
  </section>;
}
export { StockPage };
