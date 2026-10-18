import { apiPost, downloadAttachmentApi, uploadAttachmentApi, uploadDraftAttachmentApi } from "../../app/api.js";
import { showAlert, showConfirm } from "../components/platform-dialog.jsx";
import { validateAttachmentFile, validatePhotoFile } from "../../app/attachment-validation.js";

export function createAttachmentsActions({ currentUser, setMessage, loadAll }) {
async function uploadStockEvidence(file, transactionType = "入库") {
    if (transactionType === "出库") validatePhotoFile(file);
    else validateAttachmentFile(file);
    const draftId = `stock-${currentUser.username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return uploadDraftAttachmentApi(draftId, file, currentUser);
  }

async function downloadAttachment(attachment) {
    try {
      await downloadAttachmentApi(attachment, currentUser);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function deleteAttachment(attachment) {
    if (!attachment?._id) return showAlert("附件编号异常，无法删除。");
    if (!await showConfirm(`确定删除附件“${attachment.original_name || "未命名附件"}”吗？`)) return;
    try {
      await apiPost("attachments/delete", { id: attachment._id }, currentUser?.session_token || "");
      setMessage("附件已删除。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function uploadAttachment(target, file) {
    if (!file) return showAlert("请先选择附件文件。");
    try {
      await uploadAttachmentApi(target, file, currentUser);
      setMessage("附件已上传。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }
return { uploadStockEvidence, downloadAttachment, deleteAttachment, uploadAttachment };
}
