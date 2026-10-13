import { useState } from 'react';

export function newestRecords(rows) {
  const time = row => Date.parse(row.created_at || row.batches?.[0]?.created_at || '') || 0;
  return [...rows].sort((a, b) => time(b) - time(a) || Number(b._id || 0) - Number(a._id || 0));
}

// Limit presentation only; statistics and exports continue to use the complete filtered data.
export default function RecentRecords({ rows = [], children }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = newestRecords(rows);
  return <>
    {rows.length > 3 && <div className="platform-record-limit"><span>{expanded ? `共 ${rows.length} 条` : `最近 3 条 / 共 ${rows.length} 条`}</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '仅显示最近3条' : '查看全部'}</button></div>}
    {children(expanded ? ordered : ordered.slice(0, 3))}
  </>;
}
