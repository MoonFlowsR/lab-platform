import { useMemo, useState } from 'react';
import { version } from '../../../package.json';
import history from '../../config/release-history.json';
import Icon from '../../shared/components/Icon.jsx';
import PhraseText from '../../shared/components/PhraseText.jsx';
import { usePageSearchHighlight } from '../../shared/hooks/page-search-highlight.js';
import './updates.css';

const levels = { major: '大版本', minor: '中版本', patch: '小版本' };
const releases = history.releases || [];
const earlierEntries = history.legacyEntries || [];
const entries = [
  ...releases.map((entry, index) => ({ ...entry, id: `release-${entry.version}`, kind: 'release', sequence: index })),
  ...earlierEntries.map((entry, index) => ({ ...entry, id: `earlier-${index}`, kind: 'earlier', sequence: releases.length + earlierEntries.length - 1 - index })),
].map(entry => ({ ...entry, searchText: [entry.version && `v${entry.version}`, entry.date, entry.summary, ...(entry.changes || [])].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN') }));
const totalUpdates = (history.historicalUpdates || 0) + releases.length;
const latest = releases[0];

function dateLabel(date) {
  if (!date) return '早期更新 · 日期未记录';
  const [year, month, day] = date.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function UpdateEntry({ entry }) {
  const changes = [...new Set(entry.changes || [])].filter(change => change.trim() !== entry.summary.trim());
  return <article className="updates-entry" data-update-entry={entry.id} data-update-version={entry.version || ''} data-update-kind={entry.kind} data-update-search={entry.searchText}>
    {entry.version && <div className="updates-entry-meta"><strong>v{entry.version}</strong><span className={`updates-level is-${entry.level || 'patch'}`}>{levels[entry.level] || '更新'}</span></div>}
    <h3><PhraseText>{entry.summary}</PhraseText></h3>
    {changes.length > 0 && <ul>{changes.map((change, index) => <li key={index}><PhraseText>{change}</PhraseText></li>)}</ul>}
  </article>;
}

export default function UpdateHistory() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const terms = useMemo(() => [...new Set(query.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').split(/\s+/u).filter(Boolean))], [query]);
  usePageSearchHighlight(terms, '.updates-history');
  const filtered = useMemo(() => entries.filter(entry => terms.every(term => entry.searchText.includes(term))), [terms]);
  const groups = useMemo(() => {
    const byDate = new Map();
    const ordered = [...filtered].sort((a, b) => {
      const byDate = (b.date || '').localeCompare(a.date || '');
      return (sort === 'newest' ? 1 : -1) * (byDate || a.sequence - b.sequence);
    });
    for (const entry of ordered) {
      const date = entry.date || '';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(entry);
    }
    return [...byDate].map(([date, records]) => ({ date, records }));
  }, [filtered, sort]);

  return <section className="update-history" aria-label="更新日志" data-update-count={totalUpdates} data-current-version={version}>
      <div className="updates-heading"><h2>更新日志<span className="updates-heading-count">（{totalUpdates}）</span></h2><div className="updates-metadata"><span>当前版本 <strong>v{version}</strong></span></div></div>
      {latest && terms.length === 0 && <section className="updates-latest" aria-label="最新更新"><div className="updates-latest-meta"><span>最新更新</span><strong>v{latest.version}</strong><time dateTime={latest.date || undefined}>{dateLabel(latest.date)}</time></div><h3><PhraseText>{latest.summary}</PhraseText></h3></section>}
      <div className="updates-controls">
        <div role="search" className="updates-search"><Icon name="search" size={19} /><input type="search" aria-label="搜索更新" placeholder="搜索内容或版本号" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><Icon name="close" size={17} /></button>}</div>
        <label className="updates-sort"><span>排序</span><select aria-label="排序" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select><Icon name="chevron" size={16} /></label>
      </div>
      {history.historyNote && <p className="updates-note"><PhraseText>{history.historyNote}</PhraseText></p>}
      <div className="updates-search-status" role="status" aria-live="polite">{terms.length > 0 ? `找到 ${filtered.length} 条更新` : ''}</div>
      <section className="updates-history" aria-label="历次更新">
        {groups.length === 0 ? <p className="updates-empty">无相关内容</p> : groups.map(group => <details className="updates-date-group" key={`${sort}:${query}:${group.date}`} open={terms.length > 0} data-update-date={group.date}>
          <summary><Icon name="chevron" size={17} /><span className="updates-date-name">{group.date ? <time dateTime={group.date}>{dateLabel(group.date)}</time> : <><span>早期更新</span><span>日期未记录</span></>}</span><span className="updates-date-count">{group.records.length} 次更新</span></summary>
          <div className="updates-date-entries">{group.records.map(entry => <UpdateEntry key={entry.id} entry={entry} />)}</div>
        </details>)}
      </section>
  </section>;
}
