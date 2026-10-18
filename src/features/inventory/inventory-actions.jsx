import { callLabOps } from "../../app/api.js";
import { showAlert, showForm } from "../../shared/components/platform-dialog.jsx";
import { validatePhotoFile } from "../../app/attachment-validation.js";

export function createInventoryActions({ uploadStockEvidence, currentUser, loadAll, setMessage, canInboundStock, canEditBatchInformation, setEditingBatch, canManageStock }) {
async function initializeMaterialStock(form, file) {
    validatePhotoFile(file);
    const evidence = await uploadStockEvidence(file);
    const result = await callLabOps("initializeMaterialStock", { ...form, photo_attachment_id: evidence._id }, currentUser);
    await loadAll();
    setMessage("现有材料与期初库存已保存，所有用户均可查看和领用。");
    return result;
  }

async function addMaterialBatch(form, file) {
    if (!canInboundStock) return;
    try {
      const evidence = await uploadStockEvidence(file);
      await callLabOps("addMaterialBatch", { ...form, photo_attachment_id: evidence._id }, currentUser);
      setMessage("材料批次已新增。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function updateMaterialBatch(row) {
    if (canEditBatchInformation) { setEditingBatch(row); return; }
    if (!canManageStock) return showAlert("只有教师或管理员账号可以修改库存。");
    const values = await showForm({ title: '修改库存', message: '核对批次及修正后数量。修改原因必填，系统记录修改前后数值、操作人和时间。', confirmText: '确认修改',
      details: [{ label: '材料', value: row.material_name }, { label: '批次', value: row.batch_code }, { label: '当前库存', value: `${row.current_qty} ${row.unit}` }],
      fields: [
        { name: 'quantity', label: `修正后库存（${row.unit}）`, type: 'number', required: true, min: 0, value: row.current_qty ?? 0 },
        { name: 'minimum', label: '最低预警数量', type: 'number', required: true, min: 0, value: row.min_qty ?? 0 },
        { name: 'location', label: row.storage_room ? '存放房间' : '储存位置', required: true, value: row.storage_room || row.storage_location || '' },
        ...(row.storage_room ? [{ name: 'storage_detail', label: '具体位置简述', required: true, multiline: true, wide: true, maxLength: 500, value: row.storage_detail || '', placeholder: '如柜号、上/下层、左右侧' }] : []),
        { name: 'reason', label: '修改原因', required: true, multiline: true, wide: true, placeholder: '填写库存修正原因，操作将留存记录' },
      ],
      validate: values => [values.quantity, values.minimum].some(value => String(value ?? '').trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) ? '库存数量及最低预警数量须为不小于 0 的有效数字。' : '',
    });
    if (values === null) return;
    const nextQty = Number(values.quantity), minQty = Number(values.minimum), reason = values.reason.trim(), location = values.location.trim();
    const storage = row.storage_room ? { storage_room: location, storage_detail: values.storage_detail.trim() } : {};
    try {
      await callLabOps("updateMaterialBatch", {
        id: row._id,
        expected_updated_at: row.updated_at,
        current_qty: nextQty,
        storage_location: location.trim(),
        ...storage,
        min_qty: minQty,
        reason: reason.trim(),
      }, currentUser);
      setMessage("库存已修改，并已记录修改前后数值、操作人、时间和原因。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function saveMaterialBatchInformation(form, photo) {
    if (!canEditBatchInformation) throw new Error("只有学生或管理员可以修改物品信息。");
    const evidence = photo ? await uploadStockEvidence(photo) : null;
    await callLabOps("updateMaterialBatchInformation", { ...form, ...(evidence ? { photo_attachment_id: evidence._id } : {}) }, currentUser);
    setMessage("物品信息已修改，并已记录修改前后信息和原因。");
    await loadAll();
  }
return { initializeMaterialStock, addMaterialBatch, updateMaterialBatch, saveMaterialBatchInformation };
}
