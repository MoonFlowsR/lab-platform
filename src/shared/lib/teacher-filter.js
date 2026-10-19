import { materialModelTerms } from '../../features/inventory/material-model-search.js';
import { publicNumberSearchText } from './public-number.js';

// Resolve existing procurement links; no extra user-entered ownership fields.
export function createTeacherContext({ purchases = [], batches = [], teachers = [] } = {}) {
  const index = rows => new Map(rows.flatMap(row => [row._id, row.public_id, row.batch_code].filter(Boolean).map(key => [String(key), row])));
  return { purchases: index(purchases), batches: index(batches), teachers: new Map(teachers.map(row => [row.username, row.display_name || row.username])) };
}

export function recordTeacherUsernames(row, module, context) {
  const reviewer = value => value?.review_teacher_username || value?.reviewed_username || '';
  const mentors = value => [value?.responsible_teacher_username,value?.guiding_teacher_username].filter(Boolean);
  if (!['stock', 'materials'].includes(module)) return [...new Set([reviewer(row),...mentors(row)].filter(Boolean))];
  const batch = module === 'materials' ? row : context.batches.get(String(row.batch_id || row.batch_code));
  const purchaseFor = value => context.purchases.get(String(value?.related_purchase_record_id || value?.related_purchase_id || ''));
  const associated = reviewer(row) || reviewer(batch) || reviewer(purchaseFor(row)) || reviewer(purchaseFor(batch));
  const inventoryMentors = batch?.student_profile_linked ? mentors(batch) : [...mentors(batch),...mentors(purchaseFor(row)),...mentors(purchaseFor(batch))];
  const operators = module === 'stock' ? [row.operator_username] : [row.inbound_by_username, row.created_by_username];
  return [...new Set([associated, ...(module === 'stock' ? mentors(row) : []),...inventoryMentors, ...operators.filter(username => context.teachers.has(username))].filter(Boolean))];
}

// Filtering uses direct participation, while the names below retain mentor context for display/search.
export function recordParticipantUsernames(row, module) {
  const fields = ['applicant_username', 'operator_username', 'purchaser_username', 'inbound_by_username', 'created_by_username', 'last_modified_username', 'reviewed_username', 'reviewer_username', 'approved_username', 'purchaser_approved_username', 'closed_by_username'];
  if (!['stock', 'materials'].includes(module)) fields.push('review_teacher_username');
  return [...new Set(fields.map(field => row[field]).filter(Boolean))];
}

export function recordMatchesTeacher(row, teacher = '', module) {
  return !teacher || recordParticipantUsernames(row, module).includes(teacher);
}

export function recordTeacherNames(row, module, context) {
  return recordTeacherUsernames(row, module, context).map(username => context.teachers.get(username) || username).join('、');
}

export const normalizeSearch = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ');

// Snapshot records are replaced by synchronization, never edited in place.
// Cache the rendered search text until that record object is replaced.
const searchTexts = new WeakMap();
const readableDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12: false });
const defaultDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hour12:false });
let previousQuery, previousTerm;
const searchTerm = query => {
  if (query !== previousQuery) { previousQuery = query; previousTerm = normalizeSearch(query); }
  return previousTerm;
};

// Index content, never JSON property names or private bookkeeping fields.
export function recordSearchText(row) {
  const original = row;
  if (searchTexts.has(original)) return searchTexts.get(original);
  if (row.received_status && row.received_status !== '已入库') row = {...row,expiry_date:undefined};
  const hidden = /(?:^_id$|_id$|_ids$|_key$|_at$|_signature$|_fingerprint$|^_?collection$|^target_collection$|^target_type$|^account_type$|^applicant_account_type$|^operator_account_type$|^operator_role$|^session_token$|^password|^auth_version$|^storage_path$|^stored_name$|^source$|^before_json$|^after_json$)/;
  const values = value => Array.isArray(value) ? value.flatMap(values) : value && typeof value === 'object'
    ? Object.entries(value).filter(([key]) => !hidden.test(key) || ['public_id','target_public_id','related_purchase_id'].includes(key)).flatMap(([, item]) => values(item))
    : typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
  const source = values(row.account_type ? {...row,status:undefined,direction:undefined,teacher_name:undefined} : row).join(' ');
  const labels = { applicant_name: '申请人', review_teacher_name: '审核教师', responsible_teacher_name: '系统责任教师', guiding_teacher_name: '实际指导教师', graduation_year: '毕业年份', purchaser_name: '采购人', inbound_by_name:'入库人', reviewed_by: '审批人', reviewer_name:'审批人', reviewer_username:'审批人', operator_name: '操作人', material_name: '材料', name_cn:'材料名称', work_content: '名称', request_type:'类型', transaction_type:'类型', quantity:'数量', unit:'单位', purchase_category:'材料类别 采购类别', purchase_purpose:'使用目的', expiry_date:'有效期', specification: '规格', spec: '规格', storage_room: '存放房间', storage_location:'地点 位置', storage_detail: '具体位置简述', associated_teacher_names: '关联教师', review_note: '审批意见', settlement_status: '订单状态', remark: '备注', closed_by_name: '关闭人' };
  const displayed = Object.entries(labels).filter(([key]) => row[key] != null && row[key] !== '').map(([key, label]) => `${label}：${row[key]}`);
  displayed.push(...materialModelTerms(row.material_name || row.name_cn || row.name,
    [row.spec, row.specification, ...(row.stock_by_spec || []).map(item => item.spec)]));
  if (row.preferred_supplier || row.supplier) displayed.push(`采购渠道：${row.preferred_supplier || row.supplier}`);
  if (row.safety_notes) displayed.push(`安全事项 安全注意事项：${row.safety_notes}`);
  if (row.workload_unit) displayed.push(`计量单位 计费方式：${row.workload_unit}`);
  if (['测试','加工','维修'].includes(row.request_type)) {
    displayed.push(`${row.request_type}渠道：${row.external_unit || '-'}`);
    displayed.push(`${row.request_type}单位：${row.external_unit || '-'}`,`机时/工作量 工作量：${row.workload_quantity ?? '-'} ${row.workload_unit || ''}`,`预计总${row.request_type}费`);
    if (['已完成','已归档'].includes(row.status)) displayed.push(`最终总${row.request_type}费`);
  }
  for (const field of ['created_at', 'reviewed_at', 'completed_at', 'closed_at']) if (row[field]) {
    const date = new Date(row[field]);
    if (Number.isFinite(date.getTime())) {
      const readable = readableDate.format(date);
      displayed.push(defaultDate.format(date),readable,readable.replaceAll('/','-'));
    }
  }
  for (const field of ['cost_test', 'cost_processing', 'cost_repair', 'estimated_price']) if (row[field] !== undefined && Number.isFinite(Number(row[field]))) displayed.push(`¥${Number(row[field]).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`);
  if (row.status === '已通过') displayed.push('已通过（待确认完成）');
  if (row.account_type) displayed.push(({student:'学生账号',teacher:'教师账号',admin:'管理员账号'})[row.account_type] || row.account_type);
  if (row.operator_role) displayed.push(({student:'学生账号',teacher:'教师账号',admin:'管理员账号',system:'系统维护'})[row.operator_role] || row.operator_role);
  if (row.account_type) displayed.push(({active:'启用中',pending:'待审核',disabled:'已停用'})[row.status] || row.status);
  if (row.account_type === 'student') displayed.push(row.student_profile ? `${row.student_profile.graduation_year}年毕业` : '待完善');
  const text = normalizeSearch(publicNumberSearchText(source + ' ' + source.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$1/$2/$3') + ' ' + displayed.join(' ')));
  searchTexts.set(original, text);
  return text;
}

export function recordMatchesSearch(row, query = '') {
  const term = searchTerm(query);
  return !term || recordSearchText(row).includes(term);
}

export function inventorySearchFlags(row, today) {
  const flags = Number(row.current_qty || 0) <= Number(row.min_qty || 0) ? ['低库存'] : [];
  if (Number(row.current_qty) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.expiry_date || '')) {
    const days = (Date.parse(row.expiry_date) - Date.parse(today)) / 86400000;
    if (days < 0) flags.push('已过期');
    else if (days <= 30) flags.push(days === 0 ? '今日到期 临期' : '临期');
  }
  return flags.join(' ');
}

export function requestSearchIndex(logs = [], attachments = []) {
  const index = new Map();
  const indexedRows = new WeakMap();
  const add = (collection, ids, text) => ids.filter(value => value != null && value !== '').forEach(id => {
    const key = `${collection}:${id}`;
    index.set(key, `${index.get(key) || ''} ${text}`);
  });
  logs.forEach(log => add(log.target_collection, [log.target_id, log.target_public_id], recordSearchText(log)));
  attachments.filter(file => !file.deleted_at).forEach(file => add(file.target_collection, [file.target_id, file.target_public_id], file.original_name || ''));
  return (row, collection, query) => {
    if (!searchTerm(query)) return true;
    let collections = indexedRows.get(row);
    if (!collections) { collections = new Map(); indexedRows.set(row, collections); }
    if (!collections.has(collection)) collections.set(collection, {...row, _search_text: `${index.get(`${collection}:${row._id}`) || ''} ${index.get(`${collection}:${row.public_id}`) || ''}`});
    return recordMatchesSearch(collections.get(collection), query);
  };
}
