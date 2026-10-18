import { collectionName, actionName } from './audit-labels.js';
import { reviewTeacherName } from './review-scope.js';
import { stockApprovalExemptionText } from '../../features/stock/stock-out-policy.js';
// Export only the data already visible to the signed-in account.
import { summarizeMaterials } from '../../features/inventory/material-summary.js';
import { workFee, isCompletedWork, completionChangesText } from '../../features/work/work-values.js';
import { formatPublicNumbers } from './public-number.js';
const text = value => value == null ? '' : String(value);
const numeric = value => value == null || value === '' ? '' : Number.isFinite(Number(value)) ? Number(value) : '';
const date = value => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(parsed);
};
const column = (title, get, optional = false) => ({ title, get: typeof get === 'string' ? row => row[get] : get, optional });
const numberColumn = (title, get, optional = false) => {
  const value = typeof get === 'string' ? row => row[get] : get;
  return column(title, (row, context) => formatPublicNumbers(value(row, context)), optional);
};
const closure = [column('关闭人', row => row.closed_by_name || row.closed_by_username, true), column('关闭时间', row => date(row.closed_at), true)];
const approval = [column('审批人', 'reviewed_by', true), column('审批时间', row => date(row.reviewed_at), true), column('审批意见', 'review_note', true)];
const attachments = (row, collection, context) => (context.attachments || []).filter(file => !file.deleted_at && String(file._id) !== String(row.storage_photo_attachment_id || "") && (
  (file.target_collection === collection && (String(file.target_id) === String(row._id) || (row.public_id && file.target_public_id === row.public_id))) ||
  (['lab_stock_transactions','lab_stock_out_requests'].includes(collection) && row.photo_attachment_id && String(file._id) === String(row.photo_attachment_id)) ||
  (collection === 'lab_material_batches' && row.inbound_photo_attachment_id && String(file._id) === String(row.inbound_photo_attachment_id))
)).map(file => file.original_name).filter(Boolean).join('；');
const workColumns = type => [
  numberColumn('申请编号', 'public_id'), column(type + '名称', 'work_content'), column('申请人', row => row.applicant_name || row.applicant_username),
  column('审核教师', reviewTeacherName), column('系统责任教师','responsible_teacher_name',true),column('实际指导教师','guiding_teacher_name',true),column('毕业年份','graduation_year',true), column(type + '渠道', 'external_unit'), column('工作量', row => numeric(row.workload_quantity)), column('计量单位', 'workload_unit'),
  column('预计总' + type + '费（元）', row => numeric(row.completion_original?.[type === '加工' ? 'cost_processing' : 'cost_test'] ?? workFee(row))),
  column('最终总' + type + '费（元）', row => isCompletedWork(row) ? workFee(row) : '', true),
  column('完结时修改', row => row.completion_modified ? '是' : '', true),
  column('完结修改明细', completionChangesText, true),
  column('申请状态', row => row.status === '已通过' ? '已通过（待确认完成）' : row.status), column('提交时间', row => date(row.created_at)), ...approval,...closure,
  column('完结人', row => row.completed_by || row.completed_username, true), column('完成时间', row => date(row.completed_at), true), column('完成备注', 'completion_note', true), column('备注', 'remark', true),
  column('附件文件名', (row, context) => attachments(row, 'lab_work_requests', context), true),
];
const profileColumns = [column('系统责任教师',row=>row.student_profile?.responsible_teacher_name,true),column('实际指导教师',row=>row.student_profile?.guiding_teacher_name,true),column('毕业年份',row=>row.student_profile?.graduation_year,true),column('个人资料状态',row=>row.account_type==='student' ? row.profile_required ? '待完善' : '已完善' : '',true)];
const role = value => ({student:'学生',teacher:'教师',admin:'管理员',system:'系统维护'})[value] || value;
const definitions = {
  test: { title: '测试申请', columns: workColumns('测试') },
  processing: { title: '加工申请', columns: workColumns('加工') },
  purchases: { title: '采购申请', columns: [
    numberColumn('申请编号','public_id'),column('采购物品','material_name'),column('采购类别','purchase_category'),column('规格型号','specification'),
    column('申请人', row => row.applicant_name || row.applicant_username),column('审核教师',reviewTeacherName),column('系统责任教师','responsible_teacher_name',true),column('实际指导教师','guiding_teacher_name',true),column('毕业年份','graduation_year',true),column('采购数量',row => numeric(row.quantity)),column('计量单位','unit'),
    column('采购渠道','preferred_supplier'),column('使用目的','purchase_purpose'),column('有效期',row => row.received_status === '已入库' ? row.expiry_date : '',true),column('预计金额（元）',row => numeric(row.estimated_price)),
    column('申请状态','status'),column('提交时间',row => date(row.created_at)),...approval,...closure,
    column('实际到货数量',row => numeric(row.actual_received_qty),true),column('到货计量单位','actual_received_unit',true),column('入库存放房间',row => row.storage_room || row.storage_location,true),column('入库具体位置简述','storage_detail',true),
    column('入库时间',row => date(row.completed_at),true),column('入库状态','received_status',true),column('安全事项','safety_notes',true),column('备注','remark',true),column('附件文件名',(row,context) => attachments(row,'lab_purchase_requests',context),true),
  ] },
  stock: { title: '出入退库记录', columns: [column('关联教师','associated_teacher_names',true),
    numberColumn('流水编号','public_id'),column('出入退库类型','transaction_type'),column('材料名称','material_name'),numberColumn('库存批次','batch_code'),
    column('数量',row => numeric(row.quantity)),column('计量单位','unit'),column('原计量单位','previous_unit',true),column('变更前库存',row => numeric(row.stock_before)),column('变更后库存',row => numeric(row.stock_after)),
    column('操作人',row => row.operator_name || row.operator_username),column('存放房间 / 地点',row => row.storage_room || row.storage_location),column('具体位置简述','storage_detail',true),column('使用目的','purchase_purpose',true),
    column('系统责任教师','responsible_teacher_name',true),column('实际指导教师','guiding_teacher_name',true),column('毕业年份','graduation_year',true),numberColumn('出库申请编号','stock_out_request_public_id',true),column('出库审批说明',stockApprovalExemptionText,true),column('采购人审批人','purchaser_approved_by',true),column('采购人同意时间',row=>date(row.purchaser_approved_at),true),column('采购人审批意见','purchaser_review_note',true),column('原同意备注','consent_note',true),column('用途或原因',row => row.usage_reason || row.modification_reason,true),column('记录时间',row => date(row.created_at)),
    column('附件文件名',(row,context) => attachments(row,'lab_stock_transactions',context),true),
  ] },
  stockRequests: { title: '出库申请', columns: [numberColumn('申请编号','public_id'),column('材料名称','material_name'),numberColumn('库存批次','batch_code'),column('申请人',row=>row.applicant_name || row.applicant_username),column('采购人',row=>row.purchaser_name || row.purchaser_username),column('系统责任教师','responsible_teacher_name'),column('实际指导教师','guiding_teacher_name'),column('毕业年份','graduation_year',true),column('申请数量',row=>numeric(row.quantity)),column('计量单位','unit'),column('申请状态','status'),column('存放房间','storage_room'),column('具体位置简述','storage_detail'),column('用途 / 备注','usage_reason',true),column('提交时间',row=>date(row.created_at)),column('出库审批说明',stockApprovalExemptionText,true),...approval,column('完成出库时间',row=>date(row.completed_at),true),numberColumn('关联出库流水','transaction_public_id',true),column('撤回时间',row=>date(row.withdrawn_at),true),column('物品照片文件名',(row,context)=>attachments(row,'lab_stock_out_requests',context),true)] },
  materials: { title: '材料汇总', columns: [column('材料名称',row => row.name_cn || row.name),numberColumn('所有批次编号',row => row.batch_codes.join('；')),column('存放位置',row => row.storage_locations.join('；')),column('跨批次各规格库存',row => row.stock_by_spec.map(item => `${item.spec} · ${item.storage_room || "未登记房间"}：${item.quantity} ${item.unit}`).join('；'))] },
  inventorySummary: { title: '库存汇总', columns: [column('材料名称','material_name'),column('规格','spec'),column('存放房间','storage_room'),column('库存合计',row => numeric(row.current_qty)),column('计量单位','unit'),column('批次数',row => row.batches.length),numberColumn('批次编号',row => row.batch_codes.join('；'))] },
  batches: { title: '库存批次', columns: [column('关联教师','associated_teacher_names',true),numberColumn('批次编号',row => row.batch_code || row.public_id),column('材料名称','material_name'),column('采购人',row => row.purchaser_name || row.purchaser_username),column('入库人',row => row.inbound_by_name || row.created_by_name || row.inbound_by_username || row.created_by_username),column('系统责任教师','responsible_teacher_name',true),column('实际指导教师','guiding_teacher_name',true),column('毕业年份','graduation_year',true),column('采购类别','purchase_category',true),column('规格','spec',true),column('渠道供应商','supplier',true),column('使用目的','purchase_purpose',true),column('当前库存',row => numeric(row.current_qty)),column('计量单位','unit'),column('存放房间',row => row.storage_room || row.storage_location),column('具体位置简述','storage_detail',true),column('有效期','expiry_date'),column('预警数量',row => numeric(row.min_qty)),column('建立时间',row => date(row.created_at)),column('安全事项','safety_notes',true),column('备注','remark',true),column('入库证明文件名',(row,context) => attachments(row,'lab_material_batches',context),true)] },
  reviews: { title: '审批明细', columns: [numberColumn('申请编号','target_public_id'),column('申请类型',row => collectionName(row.target_collection)),column('审批人',row => row.reviewer_name || row.reviewer_username),column('审批结果','action'),column('审批意见','review_note',true),column('审批时间',row => date(row.created_at))] },
  accounts: { title: '账号列表', columns: [column('用户名','username'),column('姓名','display_name'),column('账号类型',row => role(row.account_type)),column('账号状态',row => ({active:'启用',pending:'待审核',disabled:'停用'})[row.status] || row.status),...profileColumns,column('注册时间',row => date(row.created_at))] },
  audit: { title: '操作记录', columns: [column('操作时间',row => date(row.created_at)),column('操作人',row => row.operator_name || row.operator_username),column('账号类型',row => role(row.operator_role)),column('操作',row => actionName(row.action)),column('记录类型',row => collectionName(row.target_type)),column('操作对象',row => row.object_label || row.target_id)] },
};
export function buildCsv(kind, rows = [], context = {}) {
  if (kind === 'materials' && rows.some(row => !row.stock_by_spec)) rows = summarizeMaterials(rows, context.batches || []);
  const definition = definitions[kind];
  if (!definition) throw new Error('不支持的导出模块。');
  const values = rows.map(row => definition.columns.map(col => col.get(row, context) ?? ''));
  const selected = definition.columns.map((col,index) => ({...col,index})).filter(col => !col.optional || values.some(row => text(row[col.index]).trim() !== ''));
  return buildCsvTable(definition.title, selected.map(col => col.title), values.map(row => selected.map(col => row[col.index])));
}
export function buildCsvTable(title, headers, rows) {
  if (rows.some(row => row.length !== headers.length)) throw new Error('导出列数与数据不一致。');
  const escape = value => {
    let output = text(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(output)) output = "'" + output;
    return '"' + output.replaceAll('"','""') + '"';
  };
  const csv = '\uFEFF' + [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\r\n');
  const today = date(new Date()).slice(0,10);
  return { csv, headers, rowCount: rows.length, filename: `${title}_${today}.csv` };
}
export function downloadCsv(kind, rows, context = {}) {
  const result = buildCsv(kind, rows, context);
  const blob = new Blob([result.csv],{type:'text/csv;charset=utf-8;'});
  downloadFile(result.filename, blob);
  return result.rowCount;
}
export function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
