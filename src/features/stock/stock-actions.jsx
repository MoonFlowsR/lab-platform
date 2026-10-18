import { callLabOps } from "../../app/api.js";
import { stockRequestIsPurchaserSelf } from "./stock-out-policy.js";
import { showAlert, showConfirm, showForm } from "../../shared/components/platform-dialog.jsx";
import { validatePhotoFile } from "../../app/attachment-validation.js";

export function createStockActions({ uploadStockEvidence, currentUser, setMessage, loadAll, materialBatches, purchaseRequests }) {
async function addStockTransaction(form, photoFile) {
    try {
      let photoAttachmentId = "";
      const needsPhotos = ["入库", "出库", "退库"].includes(form.transaction_type);
      if (needsPhotos) { validatePhotoFile(photoFile); }
      if (["入库", "出库", "退库"].includes(form.transaction_type)) {
        const evidence = await uploadStockEvidence(photoFile, form.transaction_type);
        photoAttachmentId = evidence._id;
      }
      const result = await callLabOps("createStockTransaction", { ...form, photo_attachment_id: photoAttachmentId }, currentUser);
      setMessage(result.approval_required ? "出库申请已提交采购人审批，库存尚未扣减。" : "库存流水已保存，库存数量已更新。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function reviewStockOutRequest(row, decision) {
    const values = await showForm({ title: decision + '出库申请', message: decision === '同意' ? '同意后由申请人完成出库，当前不扣减库存。' : '驳回意见必填，申请人可重新提交。', confirmText: '确认' + decision,
      details: [{ label: '材料', value: row.material_name }, { label: '申请人', value: row.applicant_name }, { label: '申请数量', value: row.quantity + ' ' + row.unit }],
      fields: [{ name: 'review_note', label: decision === '驳回' ? '驳回意见' : '同意意见（可选）', required: decision === '驳回', multiline: true, wide: true, maxLength: 2000 }] });
    if (values === null) return false;
    try { await callLabOps('reviewStockOutRequest', { id: row._id, decision, review_note: values.review_note }, currentUser); setMessage('出库申请已' + decision + '。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }

async function completeStockOutRequest(row) {
    const selfPurchase = stockRequestIsPurchaserSelf(row, materialBatches, purchaseRequests);
    if (!await showConfirm(selfPurchase ? '采购人本人无需审批。确认实际领用以下材料，完成后扣减库存。' : '确认实际领用以下材料。完成后扣减库存，系统保留采购人审批记录。', { title: '完成出库登记', confirmText: '确认完成出库', details: [{ label: '材料 / 批次', value: row.material_name + ' · ' + row.batch_code }, { label: '出库数量', value: row.quantity + ' ' + row.unit }, { label: '采购人', value: row.purchaser_name }] })) return false;
    try { await callLabOps('completeStockOutRequest', { id: row._id }, currentUser); setMessage('出库已完成，库存数量已更新。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }

async function withdrawStockOutRequest(row) {
    const selfPurchase = row.applicant_username && row.applicant_username === row.purchaser_username;
    if (!await showConfirm(selfPurchase ? '撤回后本申请不能完成出库。如需修改数量、单位等信息，请重新登记出库。' : '撤回后本申请不能完成出库。如需修改数量、单位等信息，请重新提交，重新取得采购人同意。', { title: '撤回出库申请', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '材料', value: row.material_name }] })) return false;
    try { await callLabOps('withdrawStockOutRequest', { id: row._id }, currentUser); setMessage('出库申请已撤回，库存未变。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }
return { addStockTransaction, reviewStockOutRequest, completeStockOutRequest, withdrawStockOutRequest };
}
