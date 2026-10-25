import { createTeacherContext, recordMatchesTeacher, recordTeacherNames, recordMatchesSearch, inventorySearchFlags } from '../../shared/lib/teacher-filter.js';
import { requestRecordVisible } from '../../shared/lib/review-scope.js';
const chineseDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const enrichedRows = new WeakMap();
export function chinaDate(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = chineseDay.formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function expiryWarnings(batches, today = chinaDate(), days = 30) {
  const day = value => Date.parse(`${value}T00:00:00Z`);
  return batches.filter(batch => Number(batch.current_qty) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(batch.expiry_date || ''))
    .map(batch => ({ ...batch, daysRemaining: Math.round((day(batch.expiry_date) - day(today)) / 86400000) }))
    .filter(batch => Number.isFinite(batch.daysRemaining) && batch.daysRemaining <= days)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function selectReportData(data, { student = '', teacher = '', query = '', startDate = '', endDate = '' } = {}) {
  const work = data.workRequests || [], purchases = data.purchases || [], stock = data.stockTransactions || [];
  const teacherContext = createTeacherContext(data);
  const teacherMatches = (row, module) => recordMatchesTeacher(row, teacher, module, teacherContext);
  const searchMatches = row => recordMatchesSearch(row, query);
  const today = chinaDate();
  const enrich = (row, module) => {
    const names = recordTeacherNames(row, module, teacherContext), flags = module === 'materials' ? inventorySearchFlags(row,today) : '';
    const cached = enrichedRows.get(row);
    if (cached?.module === module && cached.names === names && cached.flags === flags) return cached.value;
    const value = { ...row, associated_teacher_names: names, ...(module === 'materials' ? {_search_text: flags} : {}) };
    enrichedRows.set(row, {module,names,flags,value});
    return value;
  };
  const dateMatches = value => {
    if (!startDate && !endDate) return true;
    if (!value) return false;
    const day = chinaDate(value);
    return Boolean(day) && (!startDate || day >= startDate) && (!endDate || day <= endDate);
  };
  const ownRequest = row => (!student || row.applicant_username === student) && teacherMatches(row, 'requests');
  const workRequests = work.filter(row => requestRecordVisible(row) && ownRequest(row) && searchMatches(row) && dateMatches(row.created_at));
  const selectedPurchases = purchases.filter(row => requestRecordVisible(row) && ownRequest(row) && searchMatches(row) && dateMatches(row.created_at));
  const stockTransactions = stock.map(row => enrich(row, 'stock')).filter(row => (!student || row.operator_username === student) && teacherMatches(row, 'stock') && searchMatches(row) && dateMatches(row.created_at));
  const outRequests = data.stockOutRequests || [];
  const stockOutRequests = outRequests.filter(requestRecordVisible).map(row=>enrich(row,'stock')).filter(row=>(!student || row.applicant_username===student) && teacherMatches(row,'stock') && searchMatches(row) && dateMatches(row.created_at));
  const requestKeys = new Set([...work.filter(ownRequest), ...purchases.filter(ownRequest),...outRequests.filter(row=>(!student || row.applicant_username===student) && teacherMatches(row,'stock'))].flatMap(row => [String(row._id ?? ''), row.public_id]).filter(Boolean));
  const reviewLogs = (data.reviewLogs || []).filter(log => dateMatches(log.created_at) && (!(student || teacher) || requestKeys.has(String(log.target_id)) || requestKeys.has(log.target_public_id)) && (!query.trim() || searchMatches(log)));
  const batchIds = new Set([...stockTransactions.map(row => String(row.batch_id)), ...selectedPurchases.map(row => String(row.inbound_batch_id))]);
  const purchaseKeys = new Set(selectedPurchases.flatMap(row => [String(row._id), row.public_id]));
  const batches = (data.batches || []).map(row => enrich(row, 'materials')).filter(batch => {
    if (!teacherMatches(batch, 'materials') || !searchMatches(batch)) return false;
    const associated = batchIds.has(String(batch._id)) || purchaseKeys.has(String(batch.related_purchase_record_id)) || purchaseKeys.has(batch.related_purchase_id);
    return associated || (dateMatches(batch.created_at) && (!student || batch.created_by_username === student));
  });
  const materialIds = new Set([...batches, ...stockTransactions].map(row => String(row.material_id)));
  const materials = (data.materials || []).filter(material => searchMatches(material) && (materialIds.has(String(material._id)) || (!teacher && dateMatches(material.created_at) && (!student || material.created_by_username === student))));
  return { workRequests, purchases: selectedPurchases, stockTransactions, stockOutRequests, reviewLogs, batches, materials };
}
