import { buildExportTable } from '../../shared/lib/export-columns.js';
import { downloadFile } from '../../shared/lib/table-export.js';
import { buildWorkbook, xlsxMime } from '../../shared/lib/xlsx-export.js';
import { chinaDate, selectReportData } from './report-data.js';
import { reportSummaryRows } from '../dashboard/dashboard-metrics.js';

// Control characters are intentionally removed from downloadable filenames.
// eslint-disable-next-line no-control-regex
const filenamePart = value => String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
const timestamp = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(value);

export function buildReportExport(data, filters = {}, now = new Date()) {
  const { student = '', studentName = student, teacher = '', teacherName = teacher, query = '', startDate = '', endDate = '', settlementStatus = '' } = filters;
  if (startDate && endDate && startDate > endDate) throw new Error('开始日期不能晚于结束日期，请调整后导出。');
  // Use the same selector as the report page, on the already authorized account dataset.
  const selected = selectReportData(data, { student, teacher, query, startDate, endDate, settlementStatus });
  const tests = selected.workRequests.filter(row => row.request_type === '测试');
  const repairs = selected.workRequests.filter(row => row.request_type === '维修');
  const processing = selected.workRequests.filter(row => row.request_type === '加工');
  const summary = reportSummaryRows(selected, chinaDate(now));
  summary.push(['私用/项目用物品待采购人审批',selected.stockOutRequests.filter(row=>row.status==='待采购人审批').length,'条'],['私用/项目用物品已同意待出库',selected.stockOutRequests.filter(row=>row.status==='已同意待出库').length,'条']);
  const context = { attachments: data.attachments || [], batches: selected.batches };
  const details = [
    ['测试明细', 'test', tests], ['加工明细', 'processing', processing], ['维修明细', 'repair', repairs], ['采购明细', 'purchases', selected.purchases],
    ['出入退库明细', 'stock', selected.stockTransactions], ['出库申请', 'stockRequests', selected.stockOutRequests], ['审批明细', 'reviews', selected.reviewLogs],
    ['库存批次', 'batches', selected.batches], ['材料目录', 'materials', selected.materials],
  ];
  const statuses = [];
  for (const [title, rows, field] of [['测试状态',tests,'status'], ['加工状态',processing,'status'], ['维修状态',repairs,'status'], ['采购状态',selected.purchases,'status']]) {
    const counts = new Map();
    for (const row of rows) { const key = row[field] === '已通过' && title !== '采购状态' ? '已通过（待确认完成）' : row[field] || '未填写'; counts.set(key, (counts.get(key) || 0) + 1); }
    for (const [label, count] of counts) statuses.push([title, label, count]);
  }
  const files = [
    { title:'筛选条件', headers:['学生姓名','教师姓名','搜索内容','开始日期','结束日期',...(filters.settlementStatus !== undefined ? ['工单状态（测试/加工/维修/采购）'] : []),'库存统计口径','费用统计口径','导出时间'], rows:[[student ? studentName : '全部', teacher ? teacherName : '全部', query.trim() || '不限', startDate || '不限开始', endDate || '不限结束',...(filters.settlementStatus !== undefined ? [settlementStatus || '全部'] : []), '相关批次的当前库存', '测试加工维修按已完成最终费用；采购已入库按最终金额，未入库及未确认最终金额的旧记录按预计金额', timestamp(now)]] },
    { title:'统计汇总', headers:['统计项目','数值','单位'], rows:summary },
    { title:'状态统计', headers:['统计类别','分类','记录数'], rows:statuses },
    ...details.map(([title, kind, rows]) => ({ ...buildExportTable(kind, rows, context), title })),
  ];
  const range = startDate || endDate ? `${startDate || '不限开始'}至${endDate || '不限结束'}` : '全部时间';
  return { tables:files, selected, basename:`数据报表_${filenamePart(student ? studentName : '全部学生')}_${filenamePart(teacher ? teacherName : '全部教师')}_${range}_${chinaDate(now)}` };
}

export function buildReportWorkbook(data, filters = {}, now = new Date()) {
  const result = buildReportExport(data, filters, now);
  return { ...result, bytes:buildWorkbook(result.tables, now), filename:result.basename + '.xlsx' };
}

export function downloadReport(data, filters) {
  const result = buildReportWorkbook(data, filters);
  downloadFile(result.filename, new Blob([result.bytes], { type:xlsxMime }));
  return result;
}
