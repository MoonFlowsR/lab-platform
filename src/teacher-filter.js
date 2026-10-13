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

export function recordMatchesTeacher(row, teacher = '', module, context) {
  return !teacher || recordTeacherUsernames(row, module, context).includes(teacher);
}

export function recordTeacherNames(row, module, context) {
  return recordTeacherUsernames(row, module, context).map(username => context.teachers.get(username) || username).join('、');
}

export const normalizeSearch = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ');

// Index content, never JSON property names or private bookkeeping fields.
export function recordSearchText(row) {
  if (row.received_status && row.received_status !== '已入库') row = {...row,expiry_date:undefined};
  const hidden = /(?:^_id$|_id$|_ids$|_key$|_at$|_signature$|_fingerprint$|^_?collection$|^target_collection$|^target_type$|^account_type$|^applicant_account_type$|^operator_account_type$|^operator_role$|^session_token$|^password|^auth_version$|^storage_path$|^stored_name$|^source$|^before_json$|^after_json$)/;
  const values = value => Array.isArray(value) ? value.flatMap(values) : value && typeof value === 'object'
    ? Object.entries(value).filter(([key]) => !hidden.test(key) || ['public_id','target_public_id','related_purchase_id'].includes(key)).flatMap(([, item]) => values(item))
    : typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
  const source = values(row.account_type ? {...row,status:undefined,direction:undefined,teacher_name:undefined} : row).join(' ');
  const labels = { applicant_name: '申请人', review_teacher_name: '审核教师', responsible_teacher_name: '责任教师', guiding_teacher_name: '指导教师', graduation_year: '毕业年份', purchaser_name: '采购人', inbound_by_name:'入库人', reviewed_by: '审批人', reviewer_name:'审批人', reviewer_username:'审批人', operator_name: '操作人', material_name: '材料', name_cn:'材料名称', work_content: '名称', request_type:'类型', transaction_type:'类型', quantity:'数量', unit:'单位', purchase_category:'材料类别 采购类别', purchase_purpose:'使用目的', expiry_date:'有效期至', specification: '规格', spec: '规格', storage_room: '存放房间', storage_location:'地点 位置', storage_detail: '具体位置简述', associated_teacher_names: '关联教师', review_note: '审批意见', remark: '备注', closed_by_name: '关闭人' };
  const displayed = Object.entries(labels).filter(([key]) => row[key] != null && row[key] !== '').map(([key, label]) => `${label}：${row[key]}`);
  if (['测试','加工'].includes(row.request_type)) {
    displayed.push(`${row.request_type}单位：${row.external_unit || '-'}`,`机时/样品数量 工作量：${row.workload_quantity ?? '-'} ${row.workload_unit || ''}`,`预计总${row.request_type}费`);
    if (['已完成','已归档'].includes(row.status)) displayed.push(`最终总${row.request_type}费`);
  }
  for (const field of ['created_at', 'reviewed_at', 'completed_at', 'closed_at']) if (row[field]) {
    const date = new Date(row[field]);
    if (Number.isFinite(date.getTime())) {
      const readable = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12: false });
      displayed.push(date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12:false }),readable,readable.replaceAll('/','-'));
    }
  }
  for (const field of ['cost_test', 'cost_processing', 'estimated_price']) if (row[field] !== undefined && Number.isFinite(Number(row[field]))) displayed.push(`¥${Number(row[field]).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`);
  if (row.status === '已通过') displayed.push('已通过（待确认完成）');
  if (row.account_type) displayed.push(({student:'学生账号',teacher:'教师账号',admin:'管理员账号'})[row.account_type] || row.account_type);
  if (row.operator_role) displayed.push(({student:'学生账号',teacher:'教师账号',admin:'管理员账号',system:'系统维护'})[row.operator_role] || row.operator_role);
  if (row.account_type) displayed.push(({active:'启用中',pending:'待审核',disabled:'已停用'})[row.status] || row.status);
  if (row.account_type === 'student') displayed.push(row.student_profile ? `${row.student_profile.graduation_year}年毕业` : '待完善');
  return normalizeSearch(source + ' ' + source.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$1/$2/$3') + ' ' + displayed.join(' '));
}

export function recordMatchesSearch(row, query = '') {
  const term = normalizeSearch(query);
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
  const add = (collection, ids, text) => ids.filter(value => value != null && value !== '').forEach(id => {
    const key = `${collection}:${id}`;
    index.set(key, `${index.get(key) || ''} ${text}`);
  });
  logs.forEach(log => add(log.target_collection, [log.target_id, log.target_public_id], recordSearchText(log)));
  attachments.filter(file => !file.deleted_at).forEach(file => add(file.target_collection, [file.target_id, file.target_public_id], file.original_name || ''));
  return (row, collection, query) => recordMatchesSearch({...row, _search_text: `${index.get(`${collection}:${row._id}`) || ''} ${index.get(`${collection}:${row.public_id}`) || ''}`}, query);
}
