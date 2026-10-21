import { useId, useMemo, useState } from 'react';

export function newestRecords(rows) {
  const time = row => Date.parse(row.created_at || row.batches?.[0]?.created_at || '') || 0;
  return [...rows].sort((a, b) => time(b) - time(a) || Number(b._id || 0) - Number(a._id || 0));
}

function Chevron({ expanded = false }) {
  return <svg className={expanded ? 'is-expanded' : undefined} width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Shared by card lists, report details and account tables; counts always follow the filtered rows.
export function RecordVisibility({ total, expanded, onToggle, controlsId, preserveOrder = false, footer = false, unit = "条" }) {
  if (!total || footer && (expanded || total < 2)) return null;
  const remaining = total - 1;
  const buttonProps = { type: 'button', 'aria-expanded': total > 1 && expanded, 'aria-controls': controlsId, onClick: onToggle };
  if (footer) return <div className="platform-record-more"><button {...buttonProps}>还有 {remaining} {unit}记录，展开查看<Chevron /></button></div>;
  return <div className="platform-record-limit">
    <span>{total === 1 ? <>共 <strong>1</strong> {unit}</> : expanded ? <>已显示全部 <strong>{total}</strong> {unit}</> : <>当前显示 <strong>1</strong> {unit}，共 <strong>{total}</strong> {unit}</>}</span>
    {total > 1 && <button {...buttonProps} className={expanded ? 'is-expanded' : undefined}>{expanded ? '收起，仅看' + (preserveOrder ? '首' + unit : '最新1' + unit) : '展开其余 ' + remaining + ' ' + unit}<Chevron expanded={expanded} /></button>}
  </div>;
}

// Limit presentation only; statistics and exports continue to use the complete filtered data.
export default function RecentRecords({ rows = [], children, preserveOrder = false, unit = "条" }) {
  const [expanded, setExpanded] = useState(false);
  const controlsId = useId();
  const ordered = useMemo(() => preserveOrder ? rows : newestRecords(rows), [rows, preserveOrder]);
  const visibility = { total: rows.length, expanded, onToggle: () => setExpanded(value => !value), controlsId, preserveOrder, unit };
  return <>
    <RecordVisibility {...visibility} />
    <div id={controlsId}>{children(expanded ? ordered : ordered.slice(0, 1))}</div>
    <RecordVisibility {...visibility} footer />
  </>;
}
