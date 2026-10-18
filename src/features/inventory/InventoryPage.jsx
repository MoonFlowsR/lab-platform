import { useEffect, useMemo, useRef, useState } from "react";
import { styles } from "../../app/styles.js";
import { formatDate } from "../../app/formatters.js";
import RecordActions from "../../shared/components/RecordActions.jsx";
import { DataTable, Empty, Info, Toolbar } from "../../shared/components/ui.jsx";
import InventoryWarnings from "./InventoryWarnings.jsx";
import { groupMaterialBatches } from "./material-summary.js";
import { materialModelTerms } from "./material-model-search.js";
import { downloadCsv } from "../../shared/lib/csv-export.js";
import MaterialInitialization from "./MaterialInitialization.jsx";
import RecentRecords from "../../shared/components/RecentRecords.jsx";
import { formatPublicNumber } from "../../shared/lib/public-number.js";

function StockPhotoLinks({ row, attachments, onDownload, batch = false }) {
  const firstId = batch ? row.inbound_photo_attachment_id : row.photo_attachment_id;
  const item = attachments.find(file => !file.deleted_at && (String(file._id) === String(firstId || "") || (!firstId && !batch && file.target_collection === "lab_stock_transactions" && String(file.target_id) === String(row._id))));
  if (!item) return "-";
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    {item && <button style={styles.lightButton} onClick={() => onDownload?.(item)}>物品特写</button>}
  </div>;
}
function InventoryPage({ canInitialize = false, materialCatalog = [], isAdmin = false, onDeleteRecord, attachments = [], onDownloadAttachment, onInitialize, initializationMaterials, initializationBatches, initializationUnits, materials, batches, canManageStock, canEditBatchInformation = false, onUpdateBatch, onExportMaterials, onExportBatches, searchQuery = "" }) {
  const showSafetyNotes = batches.some(batch => batch.safety_notes);
  const showRemarks = batches.some(batch => batch.remark);
  const showAssociatedTeachers = batches.some(batch => batch.associated_teacher_names);
  const batchGroups = useMemo(() => groupMaterialBatches(batches).map(group => ({ ...group, created_at: group.latest_created_at })), [batches]);
  const batchColumns = ["批次", "材料", "材料类别", "采购人", "入库人", "采购渠道", "规格", "使用目的", "当前库存", "位置", "有效期", ...(showSafetyNotes ? ["安全事项"] : []), ...(showRemarks ? ["备注"] : []), ...(showAssociatedTeachers ? ["关联教师"] : []), "建立时间", "入库证明", ...((canManageStock || canEditBatchInformation) ? ["操作"] : [])];
  const batchRow = (b) => [
    b.batch_code,
    b.material_name,
    b.purchase_category || "未登记",
    b.purchaser_name || b.purchaser_username || "未登记",
    b.inbound_by_name || b.created_by_name || b.inbound_by_username || b.created_by_username || "未登记",
    b.supplier,
    b.spec,
    b.purchase_purpose || "未标注",
    `${b.current_qty} ${b.unit}`,
    b.storage_location || "-",
    b.expiry_date || "-",
    ...(showSafetyNotes ? [b.safety_notes || "-"] : []),
    ...(showRemarks ? [b.remark || "-"] : []),
    ...(showAssociatedTeachers ? [b.associated_teacher_names || "未关联"] : []),
    formatDate(b.created_at),
    <StockPhotoLinks key={`proof-${b._id}`} batch row={b} attachments={attachments} onDownload={onDownloadAttachment} />,
    ...((canManageStock || canEditBatchInformation) ? [<RecordActions key={`actions-${b._id}`} compact dangerous={isAdmin && <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_material_batches", b)}>永久删除批次</button>}><button style={styles.secondaryButton} onClick={() => onUpdateBatch?.(b)}>{canEditBatchInformation ? "修改物品信息" : "修改库存"}</button></RecordActions>] : []),
  ];
  return <main>
    <Toolbar title="库存" description={canInitialize ? "查看库存、有效期和入库证明；现存材料可在此建库。" : "查看和筛选库存、有效期及入库证明。"} />
    <InventoryWarnings batches={batches} Table={DataTable} cardStyle={styles.card} renderPhoto={row => <StockPhotoLinks batch row={row} attachments={attachments} onDownload={onDownloadAttachment} />} />
    {canInitialize && <MaterialInitialization materialCatalog={materialCatalog} materials={initializationMaterials} batches={initializationBatches} units={initializationUnits} onSave={onInitialize}       />}
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>材料汇总</h2><button style={styles.secondaryButton} onClick={onExportMaterials}>导出材料CSV</button></div>
      <RecentRecords rows={materials}>{shown => <div style={styles.cardGrid}>{shown.length === 0 ? <Empty text="暂无材料汇总。" /> : shown.map((m) => <MaterialCard key={m._id} row={m} isAdmin={isAdmin} onDeleteRecord={onDeleteRecord} searchQuery={searchQuery} />)}</div>}</RecentRecords>
    </section>
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>材料批次库存</h2><div className="platform-stock-export-actions"><button style={styles.lightButton} onClick={() => downloadCsv("inventorySummary", batchGroups)}>导出汇总CSV</button><button style={styles.secondaryButton} onClick={onExportBatches}>导出批次CSV</button></div></div>
      <p className="platform-stock-group-note">同材料、规格和房间汇总；展开查看原批次、照片及操作。</p>
      <RecentRecords rows={batchGroups}>{shown => <div className="platform-stock-groups">{shown.length ? shown.map(group => <BatchGroup key={`${group._id}:${searchQuery.trim()}`} group={group} searchQuery={searchQuery}>
        <DataTable desktopColumns={["批次", "当前库存", "位置", "有效期", "采购人", "入库人", "入库证明"]} mobileColumns={["批次", "当前库存", "位置", "有效期", "采购人", "入库人", "入库证明"]} columns={batchColumns} rows={group.batches.map(batchRow)} />
      </BatchGroup>) : <Empty text="暂无材料批次库存。" />}</div>}</RecentRecords>
    </section>
  </main>;
}
function MaterialModelMatch({ name, specifications, query }) {
  const normalize = text => String(text || "").normalize("NFKC").trim().toLowerCase();
  const keyword = normalize(query);
  if (!keyword || normalize(name).includes(keyword)) return null;
  const terms = materialModelTerms(name, specifications).filter(term => normalize(term).includes(keyword));
  if (!terms.length) return null;
  return <span className="platform-material-model-match">匹配名称：{terms.join("、")}</span>;
}
function MaterialCard({ row, isAdmin = false, onDeleteRecord, searchQuery }) {
  return <div style={styles.materialCard}>
    <div style={styles.rowBetween}>
      <h3 style={styles.h3}>{row.name_cn || row.name}</h3>
    </div>
    <MaterialModelMatch name={row.name_cn || row.name} specifications={row.stock_by_spec.map(item => item.spec)} query={searchQuery} />
    <div className="platform-detail-grid" style={styles.detailGrid2}>
      <Info label="存放位置" value={row.storage_locations.join("、") || "暂无位置"} />
      <Info label="按规格及房间库存" value={<div className="platform-material-stock-breakdown">{row.stock_by_spec.length ? row.stock_by_spec.map((item, index) => <div key={index}><span>{item.spec} · {item.storage_room || "房间未登记"}</span><strong>{item.quantity} {item.unit}</strong></div>) : "暂无库存批次"}</div>} />
    </div>
    <div className="platform-material-batch-codes"><b>所有批次：</b>{row.batch_codes.map(formatPublicNumber).join("、") || "暂无批次"}</div><details className="platform-material-batches"><summary>所有批次（{row.batch_codes.length}）</summary><div>{row.batch_codes.map(formatPublicNumber).join("、") || "暂无批次"}</div></details>
    <RecordActions dangerous={isAdmin && row.material_records.length > 0 && row.material_records.map(record => <button key={record._id} style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_materials", record)}>{row.material_records.length > 1 ? `永久删除材料 ${formatPublicNumber(record.public_id || record._id)}` : "永久删除材料"}</button>)} />
  </div>;
}
function groupExpiry(batches) {
  const values = [...new Set(batches.map(batch => String(batch.expiry_date || "").trim()))];
  const dates = values.filter(value => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value)).sort((a, b) => a.replaceAll("/", "-").localeCompare(b.replaceAll("/", "-")));
  if (dates.length) {
    const first = dates[0].replaceAll("/", "-");
    const days = Math.ceil((new Date(`${first}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    return { label: batches.length > 1 ? "最早到期" : "有效期", text: `${first}${values.includes("") ? "（部分未登记）" : ""}`, tone: days < 0 ? "is-danger" : days <= 30 ? "is-warning" : "" };
  }
  const longTerm = values.some(value => value === "长期" || value === "长期有效");
  return { label: "有效期", text: longTerm ? `长期${values.includes("") ? "（部分未登记）" : ""}` : "未登记", tone: "" };
}
function BatchGroup({ group, children, searchQuery }) {
  const [expanded, setExpanded] = useState(Boolean(searchQuery.trim()));
  const detailRef = useRef(null);
  useEffect(() => {
    if (searchQuery.trim()) detailRef.current?.querySelectorAll("details").forEach(detail => { detail.open = true; });
  }, [searchQuery]);
  const locations = [...new Set(group.batches.map(batch => batch.storage_detail || batch.storage_location).filter(Boolean))];
  const expiry = groupExpiry(group.batches);
  return <details className="platform-stock-group" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>
      <span className="platform-stock-group-field platform-stock-group-name"><small>材料</small><strong>{group.material_name}</strong></span>
      <span className="platform-stock-group-field"><small>规格</small><span>{group.spec || "无"}</span></span>
      <span className="platform-stock-group-field"><small>存放房间</small><span>{group.storage_room || "未登记"}</span></span>
      <span className="platform-stock-group-field platform-stock-group-quantity"><small>合计库存</small><strong>{group.current_qty} <span>{group.unit}</span></strong></span>
      <span className="platform-stock-group-disclosure"><small>{group.batches.length} 个批次</small><span className="platform-stock-group-show">查看批次</span><span className="platform-stock-group-hide">收起批次</span><i aria-hidden="true" /></span>
      <MaterialModelMatch name={group.material_name} specifications={[group.spec]} query={searchQuery} />
      <span className="platform-stock-group-meta"><span className="platform-stock-group-locations" title={locations.join("；")}><b>位置：</b>{locations.join("；") || "未登记"}</span><span className={expiry.tone}><b>{expiry.label}：</b>{expiry.text}</span></span>
    </summary>
    <div className="platform-stock-group-detail" ref={detailRef}>{children}</div>
  </details>;
}
export { InventoryPage, StockPhotoLinks };
