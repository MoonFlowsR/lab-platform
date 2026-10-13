import { styles } from "./../app/styles.js";
import { formatDate } from "./../app/formatters.js";
import RecordActions from "./../RecordActions.jsx";
import { DataTable, Empty, Info, Toolbar } from "./../components/ui.jsx";
import InventoryWarnings from "./../InventoryWarnings.jsx";


import MaterialInitialization from "./../MaterialInitialization.jsx";
import RecentRecords from "./../RecentRecords.jsx";

function StockPhotoLinks({ row, attachments, onDownload, batch = false }) {
  const firstId = batch ? row.inbound_photo_attachment_id : row.photo_attachment_id;
  const item = attachments.find(file => !file.deleted_at && (String(file._id) === String(firstId || "") || (!firstId && !batch && file.target_collection === "lab_stock_transactions" && String(file.target_id) === String(row._id))));
  if (!item) return "-";
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    {item && <button style={styles.lightButton} onClick={() => onDownload?.(item)}>物品特写</button>}
  </div>;
}
function MaterialsPage({ canInitialize = false, materialCatalog = [], isAdmin = false, onDeleteRecord, attachments = [], onDownloadAttachment, onInitialize, initializationMaterials, initializationBatches, initializationUnits, materials, batches, canManageStock, canEditBatchInformation = false, onUpdateBatch, onExportMaterials, onExportBatches }) {
  const showSafetyNotes = batches.some(batch => batch.safety_notes);
  const showRemarks = batches.some(batch => batch.remark);
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
    ...(batches.some(row => row.associated_teacher_names) ? [b.associated_teacher_names || "未关联"] : []),
    formatDate(b.created_at),
    <StockPhotoLinks key={`proof-${b._id}`} batch row={b} attachments={attachments} onDownload={onDownloadAttachment} />,
    ...((canManageStock || canEditBatchInformation) ? [<RecordActions key={`actions-${b._id}`} compact dangerous={isAdmin && <button style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_material_batches", b)}>永久删除批次</button>}><button style={styles.secondaryButton} onClick={() => onUpdateBatch?.(b)}>{canEditBatchInformation ? "修改物品信息" : "修改库存"}</button></RecordActions>] : []),
  ];
  return <main>
    <Toolbar title="库存" description={canInitialize ? "查看库存、有效期和入库证明；现存材料可在此建库。" : "查看和筛选库存、有效期及入库证明。"} />
    <InventoryWarnings batches={batches} Table={DataTable} cardStyle={styles.card} renderPhoto={row => <StockPhotoLinks batch row={row} attachments={attachments} onDownload={onDownloadAttachment} />} />
    {canInitialize && <MaterialInitialization materialCatalog={materialCatalog} materials={initializationMaterials} batches={initializationBatches} units={initializationUnits} onSave={onInitialize}       />}
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>材料主数据</h2><button style={styles.secondaryButton} onClick={onExportMaterials}>导出材料CSV</button></div>
      <RecentRecords rows={materials}>{shown => <div style={styles.cardGrid}>{shown.length === 0 ? <Empty text="暂无材料主数据。" /> : shown.map((m) => <MaterialCard key={m._id} row={m} isAdmin={isAdmin} onDeleteRecord={onDeleteRecord} />)}</div>}</RecentRecords>
    </section>
    <section style={styles.card}>
      <div style={styles.cardHeader}><h2 style={styles.h2}>材料批次库存</h2><button style={styles.secondaryButton} onClick={onExportBatches}>导出批次CSV</button></div>
      <RecentRecords rows={batches}>{shown => <DataTable mobileColumns={["材料", "规格", "当前库存", "位置", "采购人", "入库人"]} columns={["批次", "材料", "材料类别", "采购人", "入库人", "供应商", "规格", "使用目的", "当前库存", "位置", "有效期至", ...(showSafetyNotes ? ["安全事项"] : []), ...(showRemarks ? ["备注"] : []), ...(batches.some(row => row.associated_teacher_names) ? ["关联教师"] : []), "建立时间", "入库证明", ...((canManageStock || canEditBatchInformation) ? ["操作"] : [])]} rows={shown.map(batchRow)} />}</RecentRecords>
    </section>
  </main>;
}
function MaterialCard({ row, isAdmin = false, onDeleteRecord }) {
  return <div style={styles.materialCard}>
    <div style={styles.rowBetween}>
      <h3 style={styles.h3}>{row.name_cn || row.name}</h3>
    </div>
    <div className="platform-detail-grid" style={styles.detailGrid2}>
      <Info label="保存位置" value={row.storage_locations.join("、") || "暂无位置"} />
      <Info label="按规格库存" value={row.stock_by_spec.map(item => `${item.spec}：${item.quantity} ${item.unit}`).join("；") || "暂无库存批次"} />
    </div>
    <div className="platform-material-batch-codes"><b>所有批次：</b>{row.batch_codes.join("、") || "暂无批次"}</div><details className="platform-material-batches"><summary>所有批次（{row.batch_codes.length}）</summary><div>{row.batch_codes.join("、") || "暂无批次"}</div></details>
    <RecordActions dangerous={isAdmin && row.material_records.length > 0 && row.material_records.map(record => <button key={record._id} style={styles.dangerButton} onClick={() => onDeleteRecord?.("lab_materials", record)}>{row.material_records.length > 1 ? `永久删除材料 ${record.public_id || record._id}` : "永久删除材料"}</button>)} />
  </div>;
}
export { MaterialsPage, StockPhotoLinks };
