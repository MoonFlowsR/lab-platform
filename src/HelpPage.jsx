import { useEffect, useMemo, useState } from 'react';
import { usePageSearchHighlight } from './page-search-highlight.js';
import { showConfirm } from './platform-dialog.jsx';
import content from './help-content.json';
import { filterHelpSections, searchTerms, commentBranchMatches } from './help-search.js';
import './HelpPage.css';
import { CommentAudit, CommentComposer, CommentThread, commentRequest } from './HelpComments.jsx';
import { liveCommentRoots, sectionAnnotations } from './help-annotations.js';

function Highlight({ text, terms }) {
  if (!terms.length) return text;
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  return String(text).split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part);
}

function AnnotatedText({ text, terms, parts, onFollow }) {
  if (!parts) return <Highlight text={text} terms={terms} />;
  return parts.map((part, index) => part.commentIds.length ? <a
    key={index} className="help-commented-text" href={`#comment-${part.commentIds[0]}`} draggable={false}
    data-comment-ids={part.commentIds.join(',')} title={part.commentIds.length > 1 ? `查看对应的 ${part.commentIds.length} 条评论` : '查看对应评论'}
    onClick={event => {
      event.preventDefault();
      if (window.getSelection() && !window.getSelection().isCollapsed) return;
      onFollow(part.commentIds);
    }}
  ><Highlight text={part.text} terms={terms} /></a> : <Highlight key={index} text={part.text} terms={terms} />);
}

export default function HelpPage({ currentUser }) {
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState(null), [comments, setComments] = useState([]);
  const [selection, setSelection] = useState(null), [composer, setComposer] = useState(null);
  const [activeComment, setActiveComment] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [jump, setJump] = useState(null), [commentTargets, setCommentTargets] = useState(null);
  const [history, setHistory] = useState(() => window.location.hash === '#comment-audit'), [revision, setRevision] = useState(0);
  const token = currentUser?.session_token || '';
  const isAdmin = account?.account_type === 'admin';
  const sections = useMemo(() => filterHelpSections(content.sections, query), [query]);
  const terms = useMemo(() => searchTerms(query), [query]);
  usePageSearchHighlight(terms, ".help-page");
  const annotations = useMemo(() => {
    const roots = liveCommentRoots(comments);
    return new Map(content.sections.map(section => [section.id, sectionAnnotations(section, roots)]));
  }, [comments]);
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const row of comments) if (row.parent_id) { if (!map.has(row.parent_id)) map.set(row.parent_id, []); map.get(row.parent_id).push(row); }
    return map;
  }, [comments]);
  useEffect(() => {
    const previous = document.title;
    document.title = '平台使用帮助 · 实验室管理平台';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    let alive = true; setAccount(null);
    if (token) commentRequest('/session', token).then(json => { if (alive) setAccount(json.account); }).catch(() => {});
    return () => { alive = false; };
  }, [token]);
  useEffect(() => {
    let alive = true;
    if (!token) { setComments([]); return; }
    const load = () => commentRequest(history && isAdmin ? '/admin' : '', token)
      .then(json => { if (alive) { setComments(json.comments); setError(''); } }).catch(failure => { if (alive) setError(failure.message); });
    load(); const interval = setInterval(load, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [token, isAdmin, history, revision]);
  useEffect(() => {
    if (!jump) return;
    const target = document.getElementById(jump.id);
    const historicalQuote = target?.querySelector('details');
    if (historicalQuote) historicalQuote.open = true;
    target?.scrollIntoView({ block: 'center', behavior: 'auto' });
    if (jump.comment) target?.focus({ preventScroll: true });
  }, [jump, query]);
  useEffect(() => {
    if (!commentTargets) return;
    const escape = event => { if (event.key === 'Escape') setCommentTargets(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [commentTargets]);
  function captureSelection() {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
    const range = selected.getRangeAt(0);
    const element = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const start = element(range.startContainer), end = element(range.endContainer);
    const article = start?.closest('.help-article-content');
    if (!article || article !== end?.closest('.help-article-content')) return;
    const block = start.closest('[data-help-block]');
    const quote = selected.toString().trim();
    if (block && quote) { setSelection({ section_id: article.dataset.sectionId, block_id: block.id, quote }); setError(quote.length > 1000 ? '请缩短所选内容，最多选择 1000 字。' : ''); }
  }
  function clearSelection() { window.getSelection()?.removeAllRanges(); setSelection(null); }
  async function publish(body) {
    setBusy(true); setError('');
    try {
      await commentRequest('', token, { method: 'POST', body: JSON.stringify(composer.parent ? { parent_id: composer.parent.id, body } : composer.kind === 'message' ? { kind: 'message', body } : { ...composer.anchor, body }) });
      setComposer(null); setSelection(null); setRevision(value => value + 1);
      return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  }
  async function remove(row) {
    if (!await showConfirm('删除这条留言或评论？页面将隐藏内容，管理员仍可查看原文与操作记录。其他用户的回复会保留。', { title: '删除评论确认', confirmText: '确认删除' })) return;
    try { await commentRequest(`/${row.id}`, token, { method: 'DELETE' }); setRevision(value => value + 1); setError(''); }
    catch (failure) { setError(failure.message); }
  }
  function locate(root) { setQuery(''); setActiveComment(root); setJump({ id: root.block_id }); }
  function showComment(root) {
    setQuery(''); setActiveComment(root); setCommentTargets(null); setSelection(null);
    setJump({ id: `comment-${root.id}`, comment: true });
  }
  function followComments(ids) {
    const targets = ids.map(id => comments.find(row => row.id === id)).filter(Boolean);
    if (targets.length === 1) showComment(targets[0]);
    else if (targets.length > 1) { setSelection(null); setCommentTargets(targets); }
  }
  const roots = comments.filter(row => !row.parent_id && commentBranchMatches(row, childrenByParent,terms));
  const messages = roots.filter(row => terms.length || row.section_id === 'general').slice().reverse();
  const openMessage = () => { setComposer({ kind: 'message', anchor: { quote: '' } }); setSelection(null); setError(''); };
  const renderThread = root => <CommentThread terms={terms} key={root.id} root={root} childrenByParent={childrenByParent} account={account} active={activeComment?.id === root.id} onLocate={locate} onDelete={remove} onReply={parent => { setComposer({ parent, anchor: parent }); setSelection(null); setError(''); }} />;
  const highlight = (text, sectionId, key) => <AnnotatedText text={text} terms={terms} parts={annotations.get(sectionId)?.get(key)} onFollow={followComments} />;

  return <div className="help-page" id="help-top">
    <header className="help-header">
      <div><p className="help-brand">实验室管理平台</p><h1>平台使用帮助</h1><p className="help-subtitle">学生、教师和管理员的操作说明 · 更新于 {content.updated}</p></div>
      <a className="help-return" href="/">返回平台</a>
    </header>
    <main className="help-main">
      <section className="help-search" aria-label="帮助搜索">
        <label htmlFor="help-search-input">搜索帮助</label>
        <div className="help-search-row"><input id="help-search-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入关键词，例如：入库、驳回、附件、导出" /><button type="button" onClick={() => setQuery('')} disabled={!query}>清除搜索</button></div>
        <p role="status" aria-live="polite">{terms.length ? `仅显示匹配的正文条目和讨论，相关章节 ${sections.length} 个。多个关键词可用空格分隔。` : '点击目录跳转到对应章节，或搜索操作名称和问题关键词。'}</p>
      </section>
      <section className="help-comment-tools" aria-label="帮助评论">
        <span>选中正文可评论，也可直接留言。</span>
        <div className="help-comment-actions"><button type="button" onClick={openMessage}>直接留言</button><a href="#help-messages">查看留言（{messages.length}）</a><button type="button" onClick={() => setRevision(value => value + 1)}>刷新讨论</button>{isAdmin && <label><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />查看已删除评论与操作记录</label>}</div>
        {error && !composer && <p className="help-composer-error" role="alert">{error}</p>}
      </section>
      {selection && !composer && <div className="help-selection-bar" role="status"><span>已选 {selection.quote.length} 字</span><button type="button" disabled={selection.quote.length > 1000} onClick={() => setComposer({ anchor: selection })}>评论所选内容</button><button type="button" onClick={clearSelection}>取消选择</button></div>}
      {composer && <div className="help-composer-overlay"><div role="dialog" aria-modal="true" aria-label={composer.parent ? '回复评论' : composer.kind === 'message' ? '直接留言' : '评论所选内容'}><CommentComposer key={composer.parent?.id || composer.kind || composer.anchor.quote} kind={composer.kind} quote={composer.anchor.quote} parent={composer.parent} account={account} busy={busy} onSubmit={publish} onCancel={() => setComposer(null)} />{error && <p className="help-composer-error" role="alert">{error}</p>}</div></div>}
      {commentTargets && <div className="help-composer-overlay"><div role="dialog" aria-modal="true" aria-label="选择对应评论">
        <h3>选择对应评论</h3><p>这段文字有多条评论，请选择要查看的一条。</p>
        <div className="help-comment-targets">{commentTargets.map((row, index) => <button autoFocus={index === 0} key={row.id} type="button" onClick={() => showComment(row)}><b>{row.author_username}</b><span>{row.deleted_at ? '原评论已删除，仍有后续回复' : row.body}</span></button>)}</div>
        <button type="button" onClick={() => setCommentTargets(null)}>关闭</button>
      </div></div>}
      <div className="help-layout">
        <aside className="help-toc"><nav aria-label="帮助目录"><h2>{terms.length ? '搜索结果目录' : '使用说明目录'}</h2><a href="#help-messages">留言与讨论</a>{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}{!sections.length && <p>暂无匹配章节</p>}</nav></aside>
        <div className="help-articles">
          {!sections.length && !messages.length && <section className="help-empty"><h2>没有找到相关内容</h2><p>请缩短关键词，或尝试“采购”“密码”“附件”等操作名称。清除搜索后可查看全部章节。</p><button type="button" onClick={() => setQuery('')}>查看全部帮助</button></section>}
          {sections.map(section => <div className={`help-section-row${roots.some(row => row.section_id === section.id) ? ' has-comments' : ' no-comments'}${roots.filter(row => !terms.length && row.section_id === section.id).length === 1 ? ' one-comment-rail' : ''}`} key={section.id}>
            <aside className="help-comment-rail help-comment-left" aria-label={`${section.title} 左侧评论`}>{roots.filter(row => !terms.length && row.section_id === section.id).filter((_, index) => index % 2 === 0).map(renderThread)}</aside>
            <section className="help-article" id={section.id}>
            <div className="help-article-content" data-section-id={section.id} onMouseUp={captureSelection} onTouchEnd={captureSelection} onKeyUp={captureSelection}>
            <h2 data-help-block id={`${section.id}-title`} className={activeComment?.block_id === `${section.id}-title` ? 'help-block-is-active' : ''}>{highlight(section.title, section.id, `${section.id}-title`)}</h2>
            {section.blocks.map((block, index) => (section.searchMatches && !section.searchMatches[index]) || (block.type === 'paragraph' && !block.text) || (block.type === 'history' && !comments.some(row => !row.parent_id && row.block_id === `${section.id}-${index}`)) ? null : <div key={index} data-help-block id={`${section.id}-${index}`} className={activeComment?.block_id === `${section.id}-${index}` ? 'help-block-is-active' : ''}>{block.type === 'heading'
              ? <h3>{highlight(block.text, section.id, `${section.id}-${index}`)}</h3>
              : block.type === 'steps' ? <ol key={index}>{block.items.map((step, stepIndex) => section.searchMatches && !section.searchMatches[index]?.items?.includes(stepIndex) ? null : <li key={stepIndex}>{highlight(step, section.id, `${section.id}-${index}-step-${stepIndex}`)}</li>)}</ol>
              : block.type === 'table' ? <div className="help-table-wrap" key={index}><table className={block.headers.length > 2 ? "help-wide-table" : undefined}><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex} scope="col">{highlight(cell, section.id, `${section.id}-${index}-h-${cellIndex}`)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => section.searchMatches && !section.searchMatches[index]?.rows?.includes(rowIndex) ? null : <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} data-label={block.headers[cellIndex]}>{highlight(cell, section.id, `${section.id}-${index}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>
              : block.type === 'history' ? <details className="help-history-quote"><summary>历史评论引用</summary><p>旧说明仅供评论回溯，请以当前规则为准。</p><p>{highlight(block.text, section.id, `${section.id}-${index}`)}</p></details>
              : <p>{block.emphasis ? <strong>{highlight(block.text, section.id, `${section.id}-${index}`)}</strong> : highlight(block.text, section.id, `${section.id}-${index}`)}</p>}</div>)}
            </div>
            </section>
            <aside className="help-comment-rail help-comment-right" aria-label={`${section.title} 右侧评论`}>{roots.filter(row => !terms.length && row.section_id === section.id).filter((_, index) => index % 2 === 1).map(renderThread)}</aside>
          </div>)}
        </div>
      </div>
      <section className="help-messages" id="help-messages" aria-label="留言与讨论">
        <div className="help-messages-heading"><h2>{terms.length ? "相关留言与评论" : "留言与讨论"}</h2><button type="button" onClick={openMessage}>直接留言</button></div>

        <div className="help-message-list" aria-label="已有留言">{messages.map(renderThread)}</div>
        {!messages.length && <p className="help-message-empty">{terms.length ? "无相关留言或评论。" : "暂无留言，欢迎提出问题或建议。"}</p>}
      </section>
      {history && isAdmin && <CommentAudit query={query} token={token} revision={revision} commentAuthors={Object.fromEntries(comments.map(row => [row.id, row.author_username]))} sectionTitles={{ general: '直接留言', ...Object.fromEntries(content.sections.map(section => [section.id, section.title])) }} />}
    </main>
    <footer className="help-footer">忘记密码请联系管理员重置。</footer>
    <a className="help-top-floating" href="#help-top" aria-label="返回顶部">↑ 返回顶部</a>
  </div>;
}
