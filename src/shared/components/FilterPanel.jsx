import { useId, useState } from 'react';
import Icon from './Icon.jsx';

export default function FilterPanel({ title = '记录筛选', summary = '全部记录', children, onReset, label = title }) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  return <section className="platform-filter-panel" aria-label={label}>
    <div className="platform-filter-panel-heading">
      <h2><Icon name="filter" size={16} />{title}</h2>
      <p className="platform-filter-summary">{summary}</p>
      <button className="platform-filter-toggle" type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>{expanded ? '收起筛选' : '展开筛选'}<span aria-hidden="true">{expanded ? ' −' : ' +'}</span></button>
      <button className="platform-filter-reset" type="button" onClick={onReset}>重置筛选</button>
    </div>
    <div id={bodyId} className={'platform-filter-panel-body' + (expanded ? ' is-open' : '')}>{children}</div>
  </section>;
}
