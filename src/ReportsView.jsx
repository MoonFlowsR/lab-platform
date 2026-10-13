import { Toolbar, Field, SearchableSelect, DateInput, DataTable } from './components/ui.jsx';
import { money, formatDate } from './app/formatters.js';
import { styles } from './app/styles.js';
import { useEffect, useState } from 'react';
import { newestRecords } from './RecentRecords.jsx';
import { completedWorkFee, isCompletedWork, workFee } from './work-values.js';
import { selectReportData } from './report-data.js';
import { downloadReportCsvs } from './report-export.js';
import { studentFilterOptions } from './student-filter.js';
import { reviewTeacherName } from './review-scope.js';
import { inventoryMetrics } from './dashboard-metrics.js';
import DashboardMetrics, { InventoryMetrics } from './DashboardMetrics.jsx';

export default function ReportsView({ data, onQueryChange, query = "", canFilterTeacher = false, teachers = [], students = [] }) {
  const [student, setStudent] = useState('');
  const [teacher, setTeacher] = useState('');
  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [detail, setDetail] = useState('tests');
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const studentOptions = studentFilterOptions(students);
  const selectedTeacher = teachers.find(account => account.username === teacher);
  const selectedStudent = studentOptions.find(account => account.username === student);
  const studentLabel = selectedStudent?.label || '全部学生';
  useEffect(() => { setExportMessage(''); }, [student, teacher, query, range, startDate, endDate]);
  useEffect(() => { setShowAllDetails(false); }, [student, teacher, query, range, startDate, endDate, detail]);
  const invalidRange = range === 'custom' && startDate && endDate && startDate > endDate;
  const selected = invalidRange ? { workRequests: [], purchases: [], stockTransactions: [], stockOutRequests: [], reviewLogs: [], batches: [] }
    : selectReportData(data, { student, teacher: canFilterTeacher ? teacher : "", query, startDate: range === 'custom' ? startDate : '', endDate: range === 'custom' ? endDate : '' });
  const { workRequests, purchases, stockTransactions, stockOutRequests, reviewLogs, batches } = selected;
  const tests = workRequests.filter(row => row.request_type === '测试');
  const processing = workRequests.filter(row => row.request_type === '加工');
  const scope = `${studentLabel}${teacher ? ` · ${selectedTeacher?.display_name || teacher}` : ""}${query.trim() ? ` · 搜索：${query.trim()}` : ""} · ${range === 'all' ? '全部时间' : `${startDate || '不限开始'} 至 ${endDate || '不限结束'}`}`;
  const tabs = [
    ['tests', '测试', tests], ['processing', '加工', processing], ['purchases', '采购/入库', purchases],
    ['stock', '出入退库', stockTransactions], ['stockRequests','出库申请',stockOutRequests], ['batches', '库存批次', batches], ['reviews', '审批记录', reviewLogs],
  ];
  const active = tabs.find(([key]) => key === detail);
  const orderedRows = newestRecords(active[2]);
  const pageRows = showAllDetails ? orderedRows : orderedRows.slice(0,3);
  const closureColumns = active[2].some(row => row.status === '已关闭') ? ['关闭人', '关闭时间'] : [];
  const closureCells = row => closureColumns.length ? [row.closed_by_name || row.closed_by_username || '—', row.closed_at ? formatDate(row.closed_at) : '—'] : [];
  const workRows = rows => rows.map(row => [row.public_id, row.work_content, row.applicant_name || row.applicant_username, reviewTeacherName(row), row.status === '已通过' ? '已通过（待确认完成）' : row.status,
    `${row.workload_quantity ?? '—'} ${row.workload_unit || ''}`, money(row.completion_original?.[row.request_type === '加工' ? 'cost_processing' : 'cost_test'] ?? workFee(row)),
    isCompletedWork(row) ? money(completedWorkFee(row)) : '—', row.completion_modified ? '有修改' : '—', formatDate(row.created_at), ...closureCells(row)]);
  function exportReport() {
    try {
      const result = downloadReportCsvs(data, { student, teacher: canFilterTeacher ? teacher : "", teacherName: selectedTeacher?.display_name || teacher, query, studentName: selectedStudent?.display_name || student, startDate: range === 'custom' ? startDate : '', endDate: range === 'custom' ? endDate : '' });
      setExportMessage(`已导出当前筛选下的全部数据，共 ${result.files.length} 个中文 CSV，已打包下载。`);
    } catch (error) { setExportMessage(error.message || '导出失败，请重试。'); }
  }
  return <main>
    <Toolbar title="数据报表" onExport={exportReport} />
    <section style={styles.card} aria-label="报表筛选">
      <div className="platform-report-filter-heading"><h2 style={styles.h2}>报表筛选</h2><button type="button" style={styles.lightButton} onClick={() => { setStudent(''); setTeacher(''); setRange('all'); setStartDate(''); setEndDate(''); onQueryChange?.(''); }}>重置筛选</button></div>
      <div className={`platform-student-filter-grid${canFilterTeacher ? " has-teacher" : ""}`} style={styles.formGrid}>
        <Field label="学生姓名"><SearchableSelect value={student} onChange={setStudent} clearOnInput={false} options={[{ value: '', label: '全部' }, ...studentOptions.map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择学生姓名" fixedOptions={['']} /></Field>
        {canFilterTeacher && <Field label="教师姓名"><SearchableSelect value={teacher} onChange={setTeacher} clearOnInput={false} options={[{ value: "", label: "全部" }, ...studentFilterOptions(teachers).map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择教师姓名" fixedOptions={[""]} /></Field>}
        <Field label="时间范围"><SearchableSelect value={range} onChange={setRange} clearOnInput={false} options={[{ value: 'all', label: '全部时间' }, { value: 'custom', label: '自定义日期范围' }]} placeholder="搜索或选择时间范围" fixedOptions={['all']} /></Field>
        {range === 'custom' && <><Field label="开始日期"><DateInput value={startDate} onChange={setStartDate} /></Field><Field label="结束日期"><DateInput value={endDate} onChange={setEndDate} /></Field></>}
      </div>
      {invalidRange && <p role="alert" style={{ ...styles.note, color: '#b91c1c', fontWeight: 700 }}>开始日期不能晚于结束日期，请调整时间范围。</p>}
      <p className="platform-metric-scope">当前统计：<strong>{scope}</strong></p>
      <details className="platform-report-basis"><summary>统计口径</summary><ul><li>测试、加工：按已完成工单最终金额统计。</li><li>采购：按申请预计金额统计，不代表实际支出。</li><li>日期范围包含起止当天。</li></ul><a href="/help#reports">完整统计说明</a></details>
      {exportMessage && <p role="status" style={styles.note}>{exportMessage}</p>}
    </section>
    <DashboardMetrics mode="report" workRequests={workRequests} purchases={purchases} money={money} />
    <div className="platform-report-operations">
      <section className="platform-flow-metrics" aria-label="出入退库与审批统计"><h2>操作记录</h2><dl>{['入库', '出库', '退库'].map(type => <div key={type}><dt>{type}</dt><dd>{stockTransactions.filter(row => row.transaction_type === type).length}<small> 条</small></dd></div>)}<div><dt>库存修正</dt><dd>{stockTransactions.filter(row => !['入库', '出库', '退库'].includes(row.transaction_type)).length}<small> 条</small></dd></div><div><dt>待采购人审批</dt><dd>{stockOutRequests.filter(row=>row.status==='待采购人审批').length}<small> 条</small></dd></div><div><dt>待完成出库</dt><dd>{stockOutRequests.filter(row=>row.status==='已同意待出库').length}<small> 条</small></dd></div><div><dt>审批</dt><dd>{reviewLogs.length}<small> 条</small></dd></div></dl></section>
      <InventoryMetrics inventory={inventoryMetrics(batches)} label="相关库存" />
    </div>
    <section style={styles.card}>
      <div className="platform-report-filter-heading"><h2 style={styles.h2}>业务明细</h2><small style={styles.muted}>导出包含全部分类，不受当前明细页签限制。</small></div>
      <div className="platform-report-tabs" role="tablist" aria-label="报表明细分类">{tabs.map(([key, label, rows]) => <button key={key} id={`report-tab-${key}`} type="button" role="tab" aria-selected={detail === key} aria-controls="report-detail-panel" onClick={() => setDetail(key)}>{label}<span>{rows.length}</span></button>)}</div>
      <div id="report-detail-panel" role="tabpanel" aria-labelledby={`report-tab-${detail}`}>
        <div className="platform-record-limit"><span>{active[1]} · 共 {active[2].length} 条{!showAllDetails && active[2].length > 3 ? ' · 最近3条' : ''}</span>{active[2].length > 3 && <button type="button" aria-expanded={showAllDetails} onClick={() => setShowAllDetails(!showAllDetails)}>{showAllDetails ? '仅显示最近3条' : '查看全部'}</button>}</div>
        {['tests', 'processing'].includes(detail) && <DataTable mobileColumns={['名称', '申请人', '状态', '最终费用（元）']} columns={['编号', '名称', '申请人', '审核教师', '状态', '工作量', '预计费用（元）', '最终费用（元）', '完结修改', '提交时间', ...closureColumns]} rows={workRows(pageRows)} />}
        {detail === 'purchases' && <DataTable mobileColumns={['物品', '申请人', '状态', '预计金额（元）']} columns={['编号', '物品', '申请人', '审核教师', '责任教师', '指导教师', '状态', '数量', '预计金额（元）', '使用目的', '有效期至', '提交时间', ...closureColumns]} rows={pageRows.map(row => [row.public_id, row.material_name, row.applicant_name || row.applicant_username, reviewTeacherName(row), row.responsible_teacher_name || '未填写',row.guiding_teacher_name || '未填写', row.status, `${row.quantity} ${row.unit || ''}`, money(row.estimated_price), row.purchase_purpose || '未标注', row.expiry_date || '—', formatDate(row.created_at), ...closureCells(row)])} />}
        {detail === 'stock' && <DataTable mobileColumns={['材料', '类型', '数量', '操作人']} columns={['类型', '材料', '批次', '数量', '操作人', '地点', '具体位置简述', '责任教师', '指导教师', '采购人审批 / 原同意备注', '用途/原因', '时间']} rows={pageRows.map(row => [row.transaction_type, row.material_name, row.batch_code, `${row.quantity} ${row.unit || ''}`, row.operator_name || row.operator_username, row.storage_room || row.storage_location || '—', row.storage_detail || '—',row.responsible_teacher_name || '未填写',row.guiding_teacher_name || '未填写', row.purchaser_approved_by ? row.purchaser_approved_by + ' · ' + formatDate(row.purchaser_approved_at) : row.consent_note || '—', row.usage_reason || row.modification_reason || '—', formatDate(row.created_at)])} />}
        {detail === 'stockRequests' && <DataTable mobileColumns={['材料','申请人','采购人','状态','数量']} columns={['编号','材料','批次','申请人','采购人','责任教师','指导教师','状态','数量','审批人','审批意见','审批时间','提交时间','完成出库时间']} rows={pageRows.map(row=>[row.public_id,row.material_name,row.batch_code,row.applicant_name,row.purchaser_name,row.responsible_teacher_name,row.guiding_teacher_name,row.status,row.quantity+' '+row.unit,row.reviewed_by || '—',row.review_note || '—',formatDate(row.reviewed_at),formatDate(row.created_at),formatDate(row.completed_at)])} />}
        {detail === 'batches' && <DataTable mobileColumns={['材料', '当前库存', '位置', '有效期至']} columns={['批次', '材料', '规格', '当前库存', '位置', '具体位置简述', '有效期至', '采购人', '入库人', '建立时间']} rows={pageRows.map(row => [row.batch_code || row.public_id, row.material_name, row.spec || '无', `${row.current_qty} ${row.unit || ''}`, row.storage_room || row.storage_location || '—', row.storage_detail || '—', row.expiry_date || '—', row.purchaser_name || row.purchaser_username || '—', row.inbound_by_name || row.created_by_name || row.inbound_by_username || row.created_by_username || '—', formatDate(row.created_at)])} />}
        {detail === 'reviews' && <DataTable mobileColumns={['申请编号', '审批人', '审批结果', '审批时间']} columns={['申请编号', '审批人', '审批结果', '审批意见', '审批时间']} rows={pageRows.map(row => [row.target_public_id, row.reviewer_name || row.reviewer_username, row.action, row.review_note || '未填写', formatDate(row.created_at)])} />}
      </div>
    </section>
  </main>;
}
