import { money } from "../../app/formatters.js";
import { callLabOps, uploadAttachmentApi } from "../../app/api.js";
import { showAlert, showConfirm, showPrompt } from "../../shared/components/platform-dialog.jsx";
import { validatePhotoFile } from "../../app/attachment-validation.js";

export function createPurchasesActions({ currentUser, setMessage, loadAll, canReview }) {
async function addPurchaseRequest(form, pendingAttachments = []) {
    try {
      const response = await callLabOps("submitPurchaseRequest", form, currentUser);
      const record = response.record || null;
      for (const item of (Array.isArray(pendingAttachments) ? pendingAttachments : [])) {
        if (record?._id) {
          await uploadAttachmentApi({ target_collection: "lab_purchase_requests", target_id: record._id, target_public_id: record.public_id }, item.file, currentUser);
        }
      }
      setMessage("采购申请已提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function withdrawPurchaseRequest(row) {
    if (!await showConfirm("确定撤回这条采购申请吗？撤回后将从记录列表移除。", { title: '撤回采购确认', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '采购物品', value: row.material_name }] })) return;
    try {
      await callLabOps("withdrawPurchaseRequest", { id: row._id }, currentUser);
      setMessage("采购申请已撤回，已从记录列表移除。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function resubmitPurchaseRequest(row, form, pendingAttachments = []) {
    try {
      await callLabOps("resubmitPurchaseRequest", { id: row._id, patch: form }, currentUser);
      for (const item of (Array.isArray(pendingAttachments) ? pendingAttachments : [])) {
        await uploadAttachmentApi({ target_collection: "lab_purchase_requests", target_id: row._id, target_public_id: row.public_id }, item.file, currentUser);
      }
      setMessage("采购申请已修改并重新提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function reviewPurchase(row, nextStatus) {
    if (!canReview) return showAlert("只有被指定的审核教师可以审核采购申请。");
    const needsNote = nextStatus === "已驳回";
    const input = await showPrompt(
      nextStatus === "已通过" ? "采购同意意见（可选，可留空）" : "请输入采购驳回意见（必填）",
      row.review_note || "",
      { title: '采购申请审核', multiline: true, field: { required: needsNote }, danger: needsNote, confirmText: needsNote ? '确认驳回' : '确认同意', message: nextStatus === '已通过' ? '同意后进入待入库，物品到货后须完成入库。' : '', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }, { label: '采购物品', value: row.material_name }, { label: '审批结果', value: nextStatus }] }
    );
    if (input === null) return;
    const note = input.trim();
    if (needsNote && !note) return showAlert("请填写审批意见。");
    try {
      await callLabOps("reviewPurchaseRequest", {
        id: row._id,
        next_status: nextStatus,
        review_note: note,
        reviewer_teacher_name: currentUser?.display_name || currentUser?.username || "",
      }, currentUser);
      setMessage(nextStatus === "已通过" ? "采购已审核通过，等待申请人到货后完成入库。" : "采购审核已更新。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function completePurchaseInbound(row, form, photoFile) {
    try {
      validatePhotoFile(photoFile);
      if (!["已开票","已挂账"].includes(form.settlement_status)) throw new Error("请选择工单状态：已开票或已挂账。");
      if (!await showConfirm("请确认物品已到货，数量、总采购费及存放信息无误。确认后完成采购入库，修改信息会留痕。", {title:"确认到货并完成采购",confirmText:"确认到货并完成入库",details:[{label:"采购物品",value:row.material_name},{label:"实际到货数量",value:form.actual_qty+" "+form.unit},{label:"最终总采购费",value:money(form.actual_total_price)},{label:"工单状态",value:form.settlement_status},{label:"存放位置",value:form.storage_room+" · "+form.storage_detail}]})) return false;
      const photo = await uploadAttachmentApi({
        target_collection: "lab_purchase_requests",
        target_id: row._id,
        target_public_id: row.public_id,
      }, photoFile, currentUser);
      await callLabOps("completePurchaseInbound", {
        id: row._id,
        confirmed: true,
        expected_updated_at: row.updated_at,
        actual_total_price: Number(form.actual_total_price),
        settlement_status: form.settlement_status,
        actual_qty: Number(form.actual_qty),
        unit: form.unit,
        storage_location: form.storage_location,
        storage_room: form.storage_room,
        storage_detail: form.storage_detail,

        expiry_date: form.expiry_date,
        remark: form.remark,
        photo_attachment_id: photo._id,
      }, currentUser);
      setMessage("到货照片和入库信息已保存，采购已完成并自动生成库存批次与入库流水。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }
return { addPurchaseRequest, withdrawPurchaseRequest, resubmitPurchaseRequest, reviewPurchase, completePurchaseInbound };
}
