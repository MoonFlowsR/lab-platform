import { useMemo, useState } from 'react';

export function newestRecords(rows) {
  const time = row => Date.parse(row.created_at || row.batches?.[0]?.created_at || '') || 0;
  return [...rows].sort((a, b) => time(b) - time(a) || Number(b._id || 0) - Number(a._id || 0));
}

// Limit presentation only; statistics and exports continue to use the complete filtered data.
export default function RecentRecords({ rows = [], children, preserveOrder = false }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(() => preserveOrder ? rows : newestRecords(rows), [rows, preserveOrder]);
  return <>
    {rows.length > 1 && <div className="platform-record-limit"><span>{expanded ? `共 ${rows.length} 条` : `${preserveOrder ? "优先" : "最近"} 1 条 / 共 ${rows.length} 条`}</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? `仅显示${preserveOrder ? '优先' : '最近'}1条` : '查看全部'}</button></div>}
    {children(expanded ? ordered : ordered.slice(0, 1))}
  </>;
}
