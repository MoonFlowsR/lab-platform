import { useState } from 'react';

export default function FilterPanel({ title = '记录筛选', summary = '全部记录', children, onReset, label = title }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="platform-filter-panel" aria-label={label}>
    <div className="platform-filter-panel-heading">
      <h2>{title}</h2><button className="platform-filter-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起筛选' : '展开筛选'}<span aria-hidden="true">{expanded ? ' −' : ' +'}</span></button>
      <button className="platform-filter-reset" type="button" onClick={onReset}>重置筛选</button>
    </div>
    <p className="platform-filter-summary">{summary}</p>
    <div className={'platform-filter-panel-body' + (expanded ? ' is-open' : '')}>{children}</div>
  </section>;
}
