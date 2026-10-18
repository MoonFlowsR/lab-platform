import { requestJson } from "../shared/api/api-request.js";
import { ACCOUNT_STORAGE_KEY, API_BASE } from "./config.js";
import { validateAttachmentFile } from "./attachment-validation.js";
import { compressUploadPhoto } from "../shared/api/photo-compression.js";
import { downloadAttachmentBlob } from "../shared/api/attachment-download.js";

async function apiPost(path, data = {}, token = "", options = {}) {
  try { return await requestJson(`${API_BASE}/api/${path}`, data, token, options); }
  catch (error) {
    if (token && error.status === 401) window.dispatchEvent(new CustomEvent('platform-auth-expired', { detail: { token, message: error.message } }));
    if (token && error.code === 'PROFILE_REQUIRED') window.dispatchEvent(new CustomEvent('platform-profile-required', { detail: { token } }));
    throw error;
  }
}
async function callLabOps(action, payload = {}, currentUser = null) {
  return await apiPost(`ops/${action}`, payload, currentUser?.session_token || "");
}
async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });
}
async function uploadAttachmentApi(target, file, currentUser = null) {
  validateAttachmentFile(file);
  file = await compressUploadPhoto(file);

  const file_base64 = await fileToBase64(file);
  const json = await apiPost("attachments/uploadJson", {
    target_collection: target.target_collection,
    target_id: target.target_id,
    target_public_id: target.target_public_id || "",
    original_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    file_base64,
  }, currentUser?.session_token || "");

  return json.attachment;
}
async function uploadDraftAttachmentApi(draftId, file, currentUser = null) {
  validateAttachmentFile(file);
  file = await compressUploadPhoto(file);
  const file_base64 = await fileToBase64(file);
  const json = await apiPost("attachments/uploadDraftJson", {
    draft_id: draftId,
    original_name: file.name,
    mime_type: file.type || "image/jpeg",
    size_bytes: file.size,
    file_base64,
  }, currentUser?.session_token || "");
  return json.attachment;
}
async function prepareWorkAttachments(items, currentUser) {
  const draftId = "work-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const ids = [];
  for (const item of items || []) {
    const attachment = await uploadDraftAttachmentApi(draftId, item.file, currentUser);
    ids.push(attachment._id);
  }
  return ids;
}
async function downloadAttachmentApi(attachment, currentUser = null) {
  const blob = await downloadAttachmentBlob(`${API_BASE}/api/attachments/download/${attachment._id}`, attachment.size_bytes, currentUser?.session_token || "");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.original_name || "attachment";
  link.click();
  URL.revokeObjectURL(url);
}
function sanitizeAccount(account) {
  if (!account) return null;
  const { password, password_hash, password_salt, ...safeAccount } = account;
  return safeAccount;
}
async function callAccountAuth(action, payload) {
  const response = await apiPost(`auth/${action}`, payload);
  const account = sanitizeAccount(response.account);
  if (account && response.session_token) account.session_token = response.session_token;
  if (account && response.pending) account.pending = true;
  if (account && response.message) account.server_message = response.message;
  return account;
}
function getStoredAccount() {
  try {
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    const raw = window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY);
    return raw ? sanitizeAccount(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function saveStoredAccount(account) {
  window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(sanitizeAccount(account)));
}
function clearStoredAccount() {
  window.sessionStorage.removeItem(ACCOUNT_STORAGE_KEY);
  window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
}
export { apiPost, callAccountAuth, callLabOps, clearStoredAccount, downloadAttachmentApi, getStoredAccount, prepareWorkAttachments, saveStoredAccount, uploadAttachmentApi, uploadDraftAttachmentApi };
