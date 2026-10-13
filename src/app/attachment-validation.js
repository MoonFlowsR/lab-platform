
const ALLOWED_ATTACHMENT_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"];
const ALLOWED_ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.join(",");
const ALLOWED_ATTACHMENT_LABEL = "PNG、JPG/JPEG、PDF、Word（DOC/DOCX）、Excel（XLS/XLSX）、CSV、TXT";
function getFileExtension(filename) {
  const name = String(filename || "").toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}
function validateAttachmentFile(file) {
  if (!file) throw new Error("请选择需要上传的附件。");
  const extension = getFileExtension(file.name);
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
    throw new Error(`附件格式不支持。当前仅支持：${ALLOWED_ATTACHMENT_LABEL}。`);
  }
  if (file.size > 20 * 1024 * 1024 && ![".png", ".jpg", ".jpeg"].includes(extension)) {
    throw new Error("单个附件暂时限制为 20 MB 以内。较大文件建议压缩后上传或后续改为专用附件服务。");
  }
}
function validatePhotoFile(file) {
  if (!file) throw new Error("请上传照片。");
  const extension = getFileExtension(file.name);
  if (![".png", ".jpg", ".jpeg"].includes(extension)) {
    throw new Error("照片仅支持 PNG、JPG/JPEG 格式。");
  }

}
export { ALLOWED_ATTACHMENT_ACCEPT, ALLOWED_ATTACHMENT_LABEL, validateAttachmentFile, validatePhotoFile };
