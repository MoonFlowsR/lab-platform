import { callLabOps, prepareWorkAttachments } from "../../app/api.js";
import { showAlert, showConfirm, showForm, showPrompt } from "../../shared/components/platform-dialog.jsx";
import { workFeeKey } from './work-types.js';
import { workOptions } from "./work-options.js";
import { styles } from "../../app/styles.js";
import { SearchableSelect } from "../../shared/components/ui.jsx";
import CustomOptionFields from "../../shared/components/CustomOptionFields.jsx";
import { workFee } from "./work-values.js";

export function createWorkActions({ currentUser, setMessage, loadAll, canReview, workRequests, units }) {
async function addWorkRequest(form, pendingAttachments = []) {
    try {
      const attachment_ids = await prepareWorkAttachments(pendingAttachments, currentUser);
      await callLabOps("submitWorkRequest", { ...form, attachment_ids }, currentUser);
      setMessage(`${form.request_type}申请已提交，等待教师审核。`);
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function withdrawWorkRequest(row) {
    if (!await showConfirm(`确定撤回这条${row.request_type || "测试/加工/维修"}申请吗？撤回后可以修改并重新提交。`, { title: '撤回申请确认', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }] })) return;
    try {
      await callLabOps("withdrawWorkRequest", { id: row._id }, currentUser);
      setMessage("申请已撤回，可修改后重新提交。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function resubmitWorkRequest(row, form, pendingAttachments = []) {
    try {
      const attachment_ids = await prepareWorkAttachments(pendingAttachments, currentUser);
      await callLabOps("resubmitWorkRequest", { id: row._id, patch: form, attachment_ids }, currentUser);
      setMessage("申请已修改并重新提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

async function reviewWorkRequest(row, nextStatus) {
    if (!canReview) return showAlert("只有被指定的审核教师可以审核测试/加工/维修申请。");
    const reviewerTeacherName = currentUser?.display_name || currentUser?.username || "";
    const needsNote = nextStatus === "已驳回";
    const input = await showPrompt(
      nextStatus === "已通过" ? "同意意见（可选，可留空）" : "请输入驳回意见（必填）",
      row.review_note || "",
      { title: `${row.request_type}申请审核`, multiline: true, field: { required: needsNote }, danger: needsNote, confirmText: needsNote ? '确认驳回' : '确认同意', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }, { label: '申请内容', value: row.work_content }, { label: '审批结果', value: nextStatus }] }
    );
    if (input === null) return;
    const note = input.trim();
    if (needsNote && !note) return showAlert("请填写审批意见。");
    try {
      await callLabOps("reviewWorkRequest", {
        id: row._id,
        next_status: nextStatus,
        review_note: note,
        reviewer_teacher_name: reviewerTeacherName,
      }, currentUser);
      setMessage("审核已更新。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function closeRejectedOrder(collection, row) {
    if (!await showConfirm('是否确认关闭并结束此工单？关闭后归入“已完成”，标记“已关闭”，无法在平台中撤销或重新提交。原审批和附件保留，不计完成费用或入库金额。', { title: '关闭工单确认', confirmText: '确认关闭并结束', danger: true, details: [{label:'申请编号',value:row.public_id},{label:'申请人',value:row.applicant_name || row.applicant_username},{label:'工单内容',value:row.work_content || row.material_name},{label:'当前状态',value:row.status},{label:'关闭结果',value:'已关闭，结束工单'}] })) return;
    try {
      await callLabOps('closeRejectedRequest', {collection, id:row._id, confirmed:true, expected_updated_at:row.updated_at}, currentUser);
      setMessage('工单已关闭，已归入已完成记录。');
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

async function completeWorkRequest(row) {
    const feeKey = workFeeKey(row.request_type);
    const options = workOptions(row.request_type, workRequests, units, row).billing;
    const values = await showForm({ title: '确认' + row.request_type + '工单完成', confirmText: '确认完成',
      message: '是否需要修改工作量、金额或计量单位？请核对后点击“确认完成”。修改会留痕，无需再次审核。',
      details: [{label:'申请编号',value:row.public_id},{label:'申请人',value:row.applicant_name || row.applicant_username},{label:'申请内容',value:row.work_content}],
      fields: [
        {name:'workload_quantity',label:'最终工作量',type:'number',required:true,min:0,value:row.workload_quantity},
        {name:'workload_unit',label:'计量单位',required:true,value:row.workload_unit,render:({value,onChange}) => <CustomOptionFields required label="" customLabel="其它计量单位" value={value} onChange={onChange} options={options} placeholder="选择计量单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={60} Field={({label,children}) => <div>{label && <div style={styles.fieldLabel}>{label}</div>}{children}</div>} SearchableSelect={SearchableSelect} styles={styles} />},
        {name:feeKey,label:'最终总' + row.request_type + '费 / 元',type:'number',required:true,min:0,value:workFee(row)},
        {name:'settlement_status',label:'订单状态',required:true,value:row.settlement_status || '',render:({value,onChange}) => <SearchableSelect required value={value} onChange={onChange} options={['已开票','已挂账']} placeholder="请选择" />},
        {name:'completion_note',label:'完成备注（可选）',wide:true,maxLength:2000,value:row.completion_note || '',placeholder:'可说明费用或工作量调整原因'},
      ],
      validate: values => !Number.isFinite(Number(values.workload_quantity)) || Number(values.workload_quantity) <= 0 ? '最终工作量必须大于 0。' : !String(values.workload_unit || '').trim() || ['其它','其他','__custom_option__'].includes(values.workload_unit) ? '请选择或填写计量单位。' : '',
    });
    if (values === null) return;
    try {
      await callLabOps('completeWorkRequest', {id:row._id, confirmed:true, expected_updated_at:row.updated_at,
        patch:{workload_quantity:Number(values.workload_quantity),workload_unit:values.workload_unit,[feeKey]:Number(values[feeKey])},settlement_status:values.settlement_status,completion_note:values.completion_note.trim()}, currentUser);
      setMessage(row.request_type + '工单已完成，费用按最终金额统计。');
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }
return { addWorkRequest, withdrawWorkRequest, resubmitWorkRequest, reviewWorkRequest, closeRejectedOrder, completeWorkRequest };
}
