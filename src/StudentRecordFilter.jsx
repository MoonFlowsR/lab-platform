import { validDateRange } from './module-date.js';
import { studentFilterOptions } from './student-filter.js';

export default function StudentRecordFilter({ extraFields = null, onResetSearch, teachers = [], teacher = "", onTeacherChange, showTeacherFilter = false, students, student, onStudentChange, range, onRangeChange, styles, Field, SearchableSelect, DateInput }) {
  const options = studentFilterOptions(students);
  return <section className="platform-student-filter" style={styles.card} aria-label="学生与日期筛选">
    <div style={styles.cardHeader}>
      <h2 style={styles.h2}>记录筛选</h2>
      <button type="button" style={styles.lightButton} onClick={() => { onStudentChange(''); onTeacherChange?.(''); onRangeChange({}); onResetSearch?.(); }}>重置筛选</button>
    </div>
    <div className={`platform-student-filter-grid${showTeacherFilter ? " has-teacher" : ""}${extraFields ? " has-extra" : ""}`} style={styles.formGrid}>
      <Field label="学生姓名"><SearchableSelect value={student} onChange={onStudentChange} clearOnInput={false} options={[{ value: '', label: '全部' }, ...options.map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择学生姓名" fixedOptions={['']} /></Field>
      {showTeacherFilter && <Field label="教师姓名"><SearchableSelect value={teacher} onChange={onTeacherChange} clearOnInput={false} options={[{ value: "", label: "全部" }, ...studentFilterOptions(teachers).map(account => ({ value: account.username, label: account.label }))]} placeholder="搜索或选择教师姓名" fixedOptions={[""]} /></Field>}
      <Field label="时间范围"><SearchableSelect value={range.mode || 'all'} onChange={value => onRangeChange(value === 'all' ? {} : { ...range, mode: 'custom' })} clearOnInput={false} options={[{ value: 'all', label: '全部时间' }, { value: 'custom', label: '自定义日期范围' }]} placeholder="搜索或选择时间范围" fixedOptions={['all']} /></Field>
      {extraFields}
      {range.mode === 'custom' && <>
        <Field label="开始日期"><DateInput value={range.start || ''} min="" max="" onChange={value => onRangeChange({ ...range, start: value })} /></Field>
        <Field label="结束日期"><DateInput value={range.end || ''} min="" max="" onChange={value => onRangeChange({ ...range, end: value })} /></Field>
      </>}
    </div>
    {!validDateRange(range) && <p role="alert" style={styles.note}>开始日期不能晚于结束日期，请调整时间范围。</p>}
  </section>;
}
