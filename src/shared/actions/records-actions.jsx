import { callLabOps } from "../../app/api.js";
import { showAlert, showConfirm } from "../components/platform-dialog.jsx";
import { downloadTable } from "../lib/table-export.js";

export function createRecordsActions({ attachments, setMessage, isAdmin, currentUser, loadAll }) {
async function exportModule(kind, rows, format = 'xlsx') {
  try {
    const count = await downloadTable(kind, rows, { attachments }, format);
    setMessage(`已导出 ${count} 条当前筛选数据，列标题均为中文。`);
  } catch (error) {
    setMessage(error.message || '导出失败，请重试。', { persistent: true });
  }
  }

async function deleteRecordPermanently(collection, row) {
    if (!isAdmin) return;
    try {
      const { preview } = await callLabOps("adminDeletePreview", { collection, id: row._id }, currentUser);
      const scope = Object.entries(preview.counts).map(([name, count]) => `${name} ${count} 条`).join("、");
      const confirmation = `永久删除“${preview.name || preview.title}”（${preview.public_id}）？

范围：${scope}。
${preview.note}

删除将直接清除当前数据库中的记录，所有用户均不可再查看，无法在平台中撤销。`;
      if (!await showConfirm(confirmation, { title: "永久删除确认", confirmText: "确认永久删除", danger: true })) return;
      await callLabOps("adminDeleteRecord", { collection, id: row._id, token: preview.token }, currentUser);
      setMessage("记录已从当前数据库永久删除，所有用户页面将自动同步。");
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

async function hideRecordForMe(collection, row) {
    const title = row.public_id || row.work_content || row.material_name || row.batch_code || "该记录";
    if (!await showConfirm(`确定从当前账号列表中删除“${title}”吗？\n\n这只会隐藏在你自己的账号里，不会删除数据库原始记录，也不会影响其他用户查看。`)) return;
    try {
      await callLabOps("hideRecordForMe", { collection, id: row._id, public_id: row.public_id || "" }, currentUser);
      setMessage("该记录已从当前账号列表中隐藏，不影响其他用户和数据库原始记录。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }
return { exportModule, deleteRecordPermanently, hideRecordForMe };
}
