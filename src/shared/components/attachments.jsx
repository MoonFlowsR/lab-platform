import { useId, useRef, useState } from "react";
import { showAlert } from "./platform-dialog.jsx";
import { styles } from "../../app/styles.js";
import { formatDate, formatFileSize } from "../../app/formatters.js";
import RecordActions from "./RecordActions.jsx";
import { ALLOWED_ATTACHMENT_ACCEPT, validateAttachmentFile } from "../../app/attachment-validation.js";

function AttachmentPanel({ targetCollection, row, attachments = [], onUpload, onDownload, allowUpload = false }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return showAlert("请先选择附件文件。");
    setBusy(true);
    try {
      await onUpload({
        target_collection: targetCollection,
        target_id: row._id,
        target_public_id: row.public_id,
      }, file);
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  if (!attachments.length && !allowUpload) return null;
  return <div style={styles.attachmentBox}>
    <div style={styles.attachmentHeader}>
      <b>附件</b>
      <span style={styles.meta}>提交后的附件仅支持下载查看。</span>
    </div>
    {attachments.length === 0 ? <p style={styles.muted}>暂无附件。</p> : <div style={styles.attachmentList}>
      {attachments.map((a) => <div className="platform-attachment-item" key={a._id} style={styles.attachmentItem}>
        <div>
          <b>{a.original_name}</b>
          <div style={styles.meta}>{formatFileSize(a.size_bytes)} · 上传人：{a.uploaded_by_name || a.uploaded_by_username || "-"} · {formatDate(a.uploaded_at || a.created_at)}</div>
        </div>
        <div style={styles.buttonRowCompact}><button disabled={downloadingId !== null} style={styles.lightButton} onClick={async () => { setDownloadingId(a._id); try { await onDownload(a); } finally { setDownloadingId(null); } }}>{downloadingId === a._id ? "下载中..." : "下载"}</button></div>
      </div>)}
    </div>}
    {allowUpload && <div style={styles.attachmentUpload}>
      <FilePicker file={file} onChange={setFile} helper="选择附件后点击右侧按钮上传。" compact />
      <button style={styles.secondaryButton} type="button" disabled={busy} onClick={submit}>{busy ? "上传中..." : "上传附件"}</button>
    </div>}
  </div>;
}
function ExistingAttachmentsViewer({ attachments = [], onDownload, onDelete, allowDelete = false }) {
  return <div style={styles.draftAttachmentBox}>
    <p style={styles.meta}>{allowDelete ? "以下附件已绑定到本申请。撤回修改期间可下载核对，也可删除错误附件后重新上传。" : "以下附件已绑定到本申请，可下载核对。"}</p>
    <div style={styles.attachmentList}>
      {attachments.map((a) => <div className="platform-attachment-item" key={a._id} style={styles.attachmentItem}>
        <div>
          <b>{a.original_name}</b>
          <div style={styles.meta}>{formatFileSize(a.size_bytes)} · 已绑定 · 上传人：{a.uploaded_by_name || a.uploaded_by_username || "-"} · {formatDate(a.uploaded_at || a.created_at)}</div>
        </div>
        <RecordActions compact dangerous={allowDelete && <button type="button" style={styles.dangerButton} onClick={() => onDelete?.(a)}>删除</button>}>
          <button type="button" style={styles.lightButton} onClick={() => onDownload?.(a)}>下载核对</button>
        </RecordActions>
      </div>)}
    </div>
  </div>;
}
function PreSubmitAttachmentUploader({ attachments = [], onChange, helper }) {
  function addAttachment(file) {
    if (!file) return;
    try {
      validateAttachmentFile(file);
    } catch (error) {
      return showAlert(error.message || error);
    }
    const item = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      original_name: file.name,
      size_bytes: file.size,
      added_at: new Date().toISOString(),
    };
    onChange([item, ...attachments]);
  }

  function downloadLocal(item) {
    const url = URL.createObjectURL(item.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = item.original_name || "attachment";
    link.click();
    URL.revokeObjectURL(url);
  }

  function deleteLocal(item) {
    onChange(attachments.filter((x) => x.id !== item.id));
  }

  return <div style={styles.draftAttachmentBox}>
    <p style={styles.meta}>{helper}</p>
    <div style={styles.attachmentUpload}>
      <FilePicker file={null} onChange={addAttachment} helper="可继续添加多个附件。" compact />
    </div>
    {attachments.length === 0 ? <p style={styles.muted}>暂无待提交附件。</p> : <div style={styles.attachmentList}>
      {attachments.map((a) => <div className="platform-attachment-item" key={a.id} style={styles.attachmentItem}>
        <div>
          <b>{a.original_name}</b>
          <div style={styles.meta}>{formatFileSize(a.size_bytes)} · 待提交 · 提交前可下载核对或删除</div>
        </div>
        <RecordActions compact dangerous={<button type="button" style={styles.dangerButton} onClick={() => deleteLocal(a)}>删除</button>}>
          <button type="button" style={styles.lightButton} onClick={() => downloadLocal(a)}>下载核对</button>
        </RecordActions>
      </div>)}
    </div>}
  </div>;
}
function FilePicker({ file, onChange, helper, compact = false }) {
  const inputId = useId();
  const inputRef = useRef(null);

  function clearSelectedFile() {
    if (inputRef.current) inputRef.current.value = "";
    onChange(null);
  }

  return <div style={compact ? styles.filePickerCompact : styles.filePickerBox}>
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={ALLOWED_ATTACHMENT_ACCEPT}
      style={styles.hiddenFileInput}
      onClick={(e) => { e.currentTarget.value = ""; }}
      onChange={(e) => {
        const selectedFile = e.target.files?.[0] || null;
        onChange(selectedFile);
        e.target.value = "";
      }}
    />
    <label htmlFor={inputId} style={styles.fileChooseButton}>选择文件</label>
    <div style={styles.filePickerText}>
      <div style={styles.fileName}>{file ? file.name : "尚未选择文件"}</div>
      {file && <div style={styles.meta}>{formatFileSize(file.size)}</div>}
      {helper && <p style={styles.meta}>{helper}</p>}
    </div>
    {file && <button type="button" style={styles.lightButton} onClick={clearSelectedFile}>清除</button>}
  </div>;
}
export { AttachmentPanel, ExistingAttachmentsViewer, FilePicker, PreSubmitAttachmentUploader };
