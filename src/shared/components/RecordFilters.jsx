import FilterPanel from './FilterPanel.jsx';
import { validDateRange } from '../lib/module-date.js';
import { studentFilterOptions } from '../lib/student-filter.js';

export default function RecordFilters({ module = "", extraSummary = "", extraFields = null, onResetSearch, teachers = [], teacher = "", onTeacherChange, showTeacherFilter = false, students, student, onStudentChange, range, onRangeChange, styles, Field, SearchableSelect, DateInput }) {
  const options = studentFilterOptions(students);
  const dateLabel = module === 'materials' ? '建库日期' : module === 'stock' ? '登记日期' : module === 'admin' ? '创建 / 操作日期' : '申请日期';
  const summary = [options.find(account => account.username === student)?.label || student || '全部学生', showTeacherFilter && (studentFilterOptions(teachers).find(account => account.username === teacher)?.label || teacher || '全部教师'), range.mode === 'custom' ? `${range.start || '不限'} 至 ${range.end || '不限'}` : '全部时间', extraSummary].filter(Boolean).join(' · ');
  return <FilterPanel summary={summary} label="学生与日期筛选" onReset={() => { onStudentChange(''); onTeacherChange?.(''); onRangeChange({}); onResetSearch?.(); }}>
    <div data-module={module} className={`platform-student-filter-grid${showTeacherFilter ? " has-teacher" : ""}${extraFields ? " has-extra" : ""}`} style={styles.formGrid}>
      <Field label="学生姓名"><SearchableSelect value={student} onChange={onStudentChange} clearOnInput={false} options={[{ value: '', label: '全部' }, ...options.map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择学生姓名" fixedOptions={['']} /></Field>
      {showTeacherFilter && <Field label="教师姓名"><SearchableSelect value={teacher} onChange={onTeacherChange} clearOnInput={false} options={[{ value: "", label: "全部" }, ...studentFilterOptions(teachers).map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择教师姓名" fixedOptions={[""]} /></Field>}
      <Field label={dateLabel}><SearchableSelect value={range.mode || 'all'} onChange={value => onRangeChange(value === 'all' ? {} : { ...range, mode: 'custom' })} clearOnInput={false} options={[{ value: 'all', label: '全部时间' }, { value: 'custom', label: '自定义日期范围' }]} placeholder="搜索或选择时间范围" fixedOptions={['all']} /></Field>
      {extraFields}
      {range.mode === 'custom' && <>
        <Field label="开始日期"><DateInput value={range.start || ''} min="" max="" onChange={value => onRangeChange({ ...range, start: value })} /></Field>
        <Field label="结束日期"><DateInput value={range.end || ''} min="" max="" onChange={value => onRangeChange({ ...range, end: value })} /></Field>
      </>}
    </div>
    {!validDateRange(range) && <p role="alert" style={styles.note}>开始日期不能晚于结束日期，请调整时间范围。</p>}
    {module === 'materials' && <p className="platform-filter-caption">按材料及批次建库日期筛选，显示当前余量。</p>}
  </FilterPanel>;
}
