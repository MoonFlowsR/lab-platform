import { validDateRange } from '../lib/module-date.js';

export default function ModuleDateFilter({ module, range, onChange, SearchableSelect, DateInput }) {
  const active = Boolean(range.start || range.end);
  return <div className="platform-date-filter" aria-label="记录时间筛选">
    <label>{module === "materials" ? "建库日期" : module === "stock" ? "登记日期" : "申请日期"}<SearchableSelect value={range.mode || 'all'} onChange={value => onChange(value === 'all' ? {} : { ...range, mode: 'custom' })} clearOnInput={false} options={[{ value: 'all', label: '全部时间' }, { value: 'custom', label: '自定义日期' }]} placeholder="搜索或选择时间范围" fixedOptions={['all']} /></label>
    {range.mode === 'custom' && <>
      <label>开始日期<DateInput value={range.start || ''} min="" max="" onChange={value => onChange({ ...range, start: value })} /></label>
      <label>结束日期<DateInput value={range.end || ''} min="" max="" onChange={value => onChange({ ...range, end: value })} /></label>
      <button type="button" onClick={() => onChange({})}>重置时间</button>
    </>}
    {!validDateRange(range) && <p role="alert">开始日期不能晚于结束日期。</p>}
    {active && validDateRange(range) && <p className="platform-filter-caption">{module === 'materials' ? '按建库日期筛选，显示当前库存' : module === 'stock' ? '按出入退库记录时间筛选' : '按申请提交时间筛选'}，含起止当天。</p>}
  </div>;
}
