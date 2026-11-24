import { useEffect, useState } from 'react';
import { apiPost } from '../../app/api.js';
import PersonName from '../../shared/components/PersonName.jsx';

const title = '学生出入库提醒已读记录';
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export default function InventoryReminderHistory({ token, query, students = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [cursors, setCursors] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const before = cursors.at(-1) ?? null;
  const search = title.includes(query) ? '' : query;

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    let again = false;
    setResult(null);
    setError('');
    async function refresh() {
      if (document.hidden || controller.signal.aborted) return;
      if (loading) { again = true; return; }
      loading = true;
      try {
        do {
          again = false;
          const data = await apiPost('inventory-reminder/history', { expanded, before, query: search }, token,
            { signal: controller.signal, timeoutMs: 12000 });
          if (!controller.signal.aborted) { setResult(data); setError(''); }
        } while (again && !controller.signal.aborted);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message || '读取失败，请重试。');
      } finally { loading = false; }
    }
    const initial = setTimeout(refresh, search ? 180 : 0);
    const fallback = setInterval(refresh, 30000);
    window.addEventListener('inventory-reminder-read', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort(); clearTimeout(initial); clearInterval(fallback);
      window.removeEventListener('inventory-reminder-read', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, search, expanded, before]);

  if (search && result?.total === 0 && !error) return null;
  const rows = result?.rows || [];
  function toggle() { setExpanded(value => !value); setCursors([]); }
  return <section className="platform-overview-section inventory-reminder-history" aria-label={title}>
    <div className="inventory-reminder-heading">
      <h2>{title}</h2>
      {((result?.total || 0) > 1 || expanded) && <button type="button" aria-expanded={expanded} onClick={toggle}>
        {expanded ? '收起记录' : '查看全部（' + result.total + '）'}
      </button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p role="status">正在读取已读记录…</p>}
    {result && !rows.length && <p>暂无已读记录。</p>}
    {rows.length > 0 && <ul aria-label="已读学生与时间">{rows.map(row => {
      const student = students.find(person => person.username === row.username);
      return <li key={row.id}>
        <strong><PersonName value={student?.display_name || row.student_name || row.username} /></strong>
        <time dateTime={row.acknowledged_at}>{dateTime.format(new Date(row.acknowledged_at))}</time>
      </li>;
    })}</ul>}
    {expanded && (result?.has_more || cursors.length > 0) && <nav aria-label="已读记录翻页">
      <button type="button" disabled={!cursors.length || !result} onClick={() => setCursors(page => page.slice(0, -1))}>上一页</button>
      <span>第 {cursors.length + 1} 页</span>
      <button type="button" disabled={!result?.has_more} onClick={() => setCursors(page => [...page, rows.at(-1).id])}>下一页</button>
    </nav>}
  </section>;
}
