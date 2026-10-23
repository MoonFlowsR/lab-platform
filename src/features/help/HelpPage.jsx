import { useCallback, useEffect, useMemo, useState } from 'react';
import { platformSettings } from '../../shared/lib/platform-settings.js';
import { usePageSearchHighlight } from '../../shared/hooks/page-search-highlight.js';
import { showConfirm } from '../../shared/components/platform-dialog.jsx';
import content from './content.json';
import { filterHelpSections, searchTerms, commentBranchMatches } from './help-search.js';
import './HelpPage.css';
import { CommentAudit, CommentComposer, CommentThread, HelpDialog, commentRequest } from './HelpComments.jsx';
import { liveCommentRoots, sectionAnnotations } from './help-annotations.js';
import { createStudentNameIndex, displayStudentAccount, displayStudentComment } from '../accounts/student-name-display.js';
import { HELP_VIEWS, helpRoleForAccount, findHelpSection, helpSectionsForView, legacyCommentSections } from './help-role-sections.js';

function initialHelpView(currentUser) {
  const role = helpRoleForAccount(currentUser?.account_type);
  let anchor = '';
  try { anchor = decodeURIComponent(window.location.hash.slice(1)); } catch { /* Ignore malformed links. */ }
  const exportsTarget = role === 'student' ? 'student-exports' : role === 'finance' ? 'finance-reimbursement' : `${role}-reports`;
  if (anchor === 'exports' && content.sections.some(section => section.id === exportsTarget)) anchor = exportsTarget;
  const section = findHelpSection(content.sections, anchor);
  return { role: section?.role || role, anchor, legacy: Boolean(section && !Object.hasOwn(section, 'role')) };
}

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

function selectedHelpText() {
  const selected = window.getSelection();
  if (!selected || selected.isCollapsed || selected.rangeCount !== 1) return null;
  const range = selected.getRangeAt(0);
  const element = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const start = element(range.startContainer), end = element(range.endContainer);
  const article = start?.closest('.help-article-content');
  if (!article?.isConnected || article !== end?.closest('.help-article-content')) return null;
  const block = start.closest('[data-help-block]');
  const quote = selected.toString().trim();
  return block && quote ? { section_id: article.dataset.sectionId, block_id: block.id, quote } : null;
}

export default function HelpPage({ currentUser }) {
  const [initialView] = useState(() => initialHelpView(currentUser));
  const [helpRole, setHelpRole] = useState(initialView.role);
  const [showLegacy, setShowLegacy] = useState(initialView.legacy);
  const [legacyAnchor, setLegacyAnchor] = useState(initialView.legacy ? initialView.anchor : '');
  const [tocOpen, setTocOpen] = useState(false);
  const [initialCommentId, setInitialCommentId] = useState(() => /^comment-\d+$/.test(initialView.anchor) ? Number(initialView.anchor.slice(8)) : null);
  const [query, setQuery] = useState('');
  const [rawAccount, setRawAccount] = useState(null), [rawComments, setComments] = useState([]);
  const [studentNames, setStudentNames] = useState([]);
  const studentNameIndex = useMemo(() => createStudentNameIndex(studentNames), [studentNames]);
  const account = useMemo(() => displayStudentAccount(rawAccount, studentNameIndex), [rawAccount, studentNameIndex]);
  const comments = useMemo(() => rawComments.map(row => displayStudentComment(row, studentNameIndex)), [rawComments, studentNameIndex]);
  const [commentsRequireLogin, setCommentsRequireLogin] = useState(false);
  const [selection, setSelection] = useState(null), [composer, setComposer] = useState(null);
  const [activeComment, setActiveComment] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [jump, setJump] = useState(initialView.anchor ? { id: initialView.anchor } : null), [commentTargets, setCommentTargets] = useState(null);
  const [history, setHistory] = useState(() => window.location.hash === '#comment-audit'), [revision, setRevision] = useState(0);
  const [auditCommentsLoaded, setAuditCommentsLoaded] = useState(false);
  const token = currentUser?.session_token || '';
  const isAdmin = account?.account_type === 'admin';
  const roleLabel = HELP_VIEWS.find(role => role.value === helpRole)?.label || '学生';
  const tocLabel = helpRole === 'maintenance' ? '平台维护目录' : `${roleLabel}操作目录`;
  const legacySections = useMemo(() => legacyCommentSections(content.sections, comments, legacyAnchor), [comments, legacyAnchor]);
  const legacyCommentCount = comments.filter(row => !row.parent_id && content.sections.some(section => section.id === row.section_id && !Object.hasOwn(section, 'role'))).length;
  const sections = useMemo(() => filterHelpSections([...helpSectionsForView(content.sections, helpRole), ...(showLegacy ? legacySections : [])], query), [helpRole, showLegacy, legacySections, query]);
  const terms = useMemo(() => searchTerms(query), [query]);
  usePageSearchHighlight(terms, ".help-page");
  const annotations = useMemo(() => {
    const roots = history && isAdmin ? comments.filter(row => !row.parent_id && row.quote) : liveCommentRoots(comments);
    return new Map(content.sections.map(section => [section.id, sectionAnnotations(section, roots)]));
  }, [comments, history, isAdmin]);
  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const row of comments) if (row.parent_id) { if (!map.has(row.parent_id)) map.set(row.parent_id, []); map.get(row.parent_id).push(row); }
    return map;
  }, [comments]);
  useEffect(() => {
    const previous = document.title;
    document.title = '平台使用帮助 · ' + platformSettings.title;
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    let alive = true; setRawAccount(null); setStudentNames([]);
    if (token) commentRequest('/session', token).then(json => { if (alive) { setRawAccount(json.account); setStudentNames(json.student_name_labels || []); } }).catch(() => {});
    return () => { alive = false; };
  }, [token]);
  useEffect(() => {
    let alive = true, anonymousDenied = false, activeRequest = null;
    if (!history || !isAdmin) setAuditCommentsLoaded(false);
    const load = async () => {
      if (!alive || anonymousDenied || activeRequest || document.hidden) return;
      const controller = new AbortController(); activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const json = await commentRequest(history && isAdmin ? '/admin' : '', token, { signal: controller.signal });
        if (alive) { setCommentsRequireLogin(false); setComments(json.comments); setStudentNames(json.student_name_labels || []); setError(''); if (history && isAdmin) setAuditCommentsLoaded(true); }
      } catch (failure) {
        if (!alive) return;
        if (!token && [401, 403].includes(failure.status)) { anonymousDenied = true; setCommentsRequireLogin(true); setComments([]); setError(''); }
        else setError(failure.name === 'AbortError' ? '读取讨论超时，请稍后重试。' : failure.message);
      } finally { clearTimeout(timeout); if (activeRequest === controller) activeRequest = null; }
    };
    load(); const interval = setInterval(load, 10000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(interval); document.removeEventListener('visibilitychange', load); activeRequest?.abort(); };
  }, [token, isAdmin, history, revision]);
  useEffect(() => {
    if (!jump || (jump.id === 'comment-audit' && !auditCommentsLoaded)) return;
    const target = document.getElementById(jump.id);
    const historicalQuote = target?.querySelector('details');
    if (historicalQuote) historicalQuote.open = true;
    for (const blockId of jump.historyBlocks || []) {
      const details = document.getElementById(blockId)?.querySelector('details');
      if (details) details.open = true;
    }
    target?.scrollIntoView({ block: jump.id === 'comment-audit' ? 'start' : 'center', behavior: 'auto' });
    if (jump.comment) target?.focus({ preventScroll: true });
    if (target && jump.id === 'comment-audit') setJump(null);
  }, [jump, query, helpRole, showLegacy, legacyAnchor, isAdmin, history, auditCommentsLoaded]);
  useEffect(() => {
    if (!initialCommentId) return;
    const byId = new Map(comments.map(row => [row.id, row]));
    const target = byId.get(initialCommentId);
    if (!target) return;
    let root = target;
    const seen = new Set();
    while (root.parent_id && byId.has(root.parent_id) && !seen.has(root.id)) { seen.add(root.id); root = byId.get(root.parent_id); }
    const section = findHelpSection(content.sections, root.block_id || root.section_id);
    if (section?.role) setHelpRole(section.role);
    else if (section) { setShowLegacy(true); setLegacyAnchor(root.block_id || section.id); }
    setActiveComment(root); setJump({ id: `comment-${target.id}`, comment: true }); setInitialCommentId(null);
  }, [initialCommentId, comments]);
  const captureSelection = useCallback(() => {
    const next = selectedHelpText();
    setSelection(previous => previous?.section_id === next?.section_id && previous?.block_id === next?.block_id && previous?.quote === next?.quote ? previous : next);
  }, []);
  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);
  function commentSelection() {
    const anchor = selectedHelpText();
    if (!anchor || anchor.quote.length > 1000) { captureSelection(); return; }
    setComposer({ anchor }); setError(''); clearSelection();
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
  function revealCommentSection(root) {
    const section = findHelpSection(content.sections, root.block_id || root.section_id);
    if (section?.role) { setHelpRole(section.role); setShowLegacy(false); setLegacyAnchor(''); }
    else if (section) { setShowLegacy(true); setLegacyAnchor(root.block_id || section.id); }
  }
  function chooseRole(role) {
    setHelpRole(role); setShowLegacy(false); setLegacyAnchor(''); setTocOpen(false); setQuery(''); setActiveComment(null); setCommentTargets(null); setJump(null); clearSelection();
    const first = helpSectionsForView(content.sections, role)[0];
    if (first) window.history.replaceState(null, '', `#${first.id}`);
  }
  function locate(root) {
    setQuery(''); revealCommentSection(root); setActiveComment(root);
    const section = findHelpSection(content.sections, root.section_id);
    const references = section ? sectionAnnotations(section, [root]) : new Map();
    const historyBlocks = section?.blocks.flatMap((block, index) => block.type === 'history' && references.has(`${section.id}-${index}`) ? [`${section.id}-${index}`] : []) || [];
    setJump({ id: root.block_id, historyBlocks });
  }
  function showComment(root) {
    revealCommentSection(root);
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
  const selectionError = selection?.quote.length > 1000 ? '请缩短所选内容，最多选择 1000 字。' : '';

  return <div className="help-page" id="help-top">
    <header className="help-header">
      <div><p className="help-brand">{platformSettings.title}</p><h1>平台使用帮助</h1><p className="help-subtitle">更新于 {content.updated}</p></div>
      <a className="help-return" href="/">返回平台</a>
    </header>
    <main className="help-main">
      <p className="help-navigation-guide">切换模块：电脑用左侧导航，手机用左上角菜单。</p>
      <section className="help-role-switch" aria-label="选择帮助类别">
        <span>查看说明</span><div>{HELP_VIEWS.map(role => <button key={role.value} type="button" aria-pressed={helpRole === role.value} onClick={() => chooseRole(role.value)}>{role.label}</button>)}</div>
        <a className="help-source-link" href="https://github.com/MoonFlowsR/lab-platform" target="_blank" rel="noopener noreferrer">平台代码已在Github开源 ↗</a>
      </section>
      <section className="help-search" aria-label="帮助搜索">
        <label htmlFor="help-search-input">搜索{roleLabel}帮助</label>
        <div className="help-search-row"><input id="help-search-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索当前说明" /><button type="button" onClick={() => setQuery('')} disabled={!query}>清除搜索</button></div>
        <p role="status" aria-live="polite" className={!terms.length ? 'help-search-status-idle' : undefined}>{terms.length ? `${sections.length} 个匹配章节 · 相关讨论见下方` : ''}</p>
      </section>
      <section className="help-comment-tools" aria-label="帮助评论">
        <span>选中正文可评论</span>
        <div className="help-comment-actions"><button type="button" onClick={openMessage}>直接留言</button><a href="#help-messages">查看留言（{messages.length}）</a><button type="button" onClick={() => setRevision(value => value + 1)}>刷新讨论</button>{(legacyCommentCount > 0 || showLegacy) && <button type="button" aria-pressed={showLegacy} onClick={() => { setShowLegacy(!showLegacy); setLegacyAnchor(''); setJump(null); }}>{showLegacy ? '收起历史正文评论' : `历史正文评论（${legacyCommentCount}）`}</button>}{isAdmin && <label><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />查看已删除评论与操作记录</label>}</div>
        {commentsRequireLogin && <p className="help-comment-note"><a href="/">登录</a>后查看留言和评论。</p>}
        {(selectionError || error) && !composer && <p className="help-composer-error" role="alert">{selectionError || error}</p>}
      </section>
      {selection && !composer && <div className="help-selection-bar" role="status" onPointerDown={event => event.preventDefault()}><span>已选 {selection.quote.length} 字</span><button type="button" disabled={selection.quote.length > 1000} onClick={commentSelection}>评论所选内容</button><button type="button" onClick={clearSelection}>取消选择</button></div>}
      {composer && <HelpDialog label={composer.parent ? '回复评论' : composer.kind === 'message' ? '直接留言' : '评论所选内容'} busy={busy} onClose={() => setComposer(null)}><CommentComposer key={composer.parent?.id || composer.kind || composer.anchor.quote} kind={composer.kind} quote={composer.anchor.quote} parent={composer.parent} account={account} busy={busy} onSubmit={publish} onCancel={() => setComposer(null)} />{error && <p className="help-composer-error" role="alert">{error}</p>}</HelpDialog>}
      {commentTargets && <HelpDialog label="选择对应评论" onClose={() => setCommentTargets(null)}>
        <h3>选择对应评论</h3><p>这段文字有多条评论，请选择要查看的一条。</p>
        <div className="help-comment-targets">{commentTargets.map(row => <button key={row.id} type="button" onClick={() => showComment(row)}><b>{row.author_name || row.author_username}</b><span>{row.deleted_at ? '原评论已删除，仍有后续回复' : row.body}</span></button>)}</div>
        <button type="button" onClick={() => setCommentTargets(null)}>关闭</button>
      </HelpDialog>}
      <div className="help-layout">
        <aside className="help-toc"><button className="help-toc-toggle" type="button" aria-expanded={tocOpen} aria-controls="help-toc-nav" onClick={() => setTocOpen(!tocOpen)}>{terms.length ? '搜索结果目录' : tocLabel}<span aria-hidden="true">{tocOpen ? '▴' : '▾'}</span></button><nav id="help-toc-nav" className={tocOpen ? 'is-open' : undefined} aria-label="帮助目录"><h2>{terms.length ? '搜索结果目录' : tocLabel}</h2>{sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={() => setTocOpen(false)}>{section.legacy ? `历史评论 · ${section.title}` : section.title}</a>)}<a href="#help-messages" onClick={() => setTocOpen(false)}>留言与讨论</a>{!sections.length && <p>暂无匹配章节</p>}</nav></aside>
        <div className="help-articles">
          {!sections.length && !messages.length && <section className="help-empty"><h2>没有找到相关内容</h2><p>试试更短的关键词，或清除搜索。</p><button type="button" onClick={() => setQuery('')}>查看全部帮助</button></section>}
          {sections.map(section => <div className={`help-section-row${roots.some(row => row.section_id === section.id) ? ' has-comments' : ' no-comments'}${roots.filter(row => !terms.length && row.section_id === section.id).length === 1 ? ' one-comment-rail' : ''}`} key={section.id}>
            <aside className="help-comment-rail help-comment-left" aria-label={`${section.title} 左侧评论`}>{roots.filter(row => !terms.length && row.section_id === section.id).filter((_, index) => index % 2 === 0).map(renderThread)}</aside>
            <section className="help-article" id={section.id}>
            {section.legacy && <p className="help-legacy-note">历史正文评论</p>}
            <div className="help-article-content" data-section-id={section.id} onMouseUp={captureSelection} onTouchEnd={captureSelection} onKeyUp={captureSelection}>
            <h2 data-help-block id={`${section.id}-title`} className={activeComment?.block_id === `${section.id}-title` ? 'help-block-is-active' : ''}>{highlight(section.title, section.id, `${section.id}-title`)}</h2>
            {section.blocks.map((block, index) => block.hidden || (section.searchMatches && !section.searchMatches[index]) || (block.type === 'paragraph' && !block.text) || (block.type === 'history' && !annotations.get(section.id)?.has(`${section.id}-${index}`) && !comments.some(row => !row.parent_id && row.block_id === `${section.id}-${index}`)) ? null : <div key={index} data-help-block id={`${section.id}-${index}`} className={activeComment?.block_id === `${section.id}-${index}` ? 'help-block-is-active' : ''}>{block.type === 'heading'
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
      {history && isAdmin && <CommentAudit query={query} token={token} revision={revision} studentNameIndex={studentNameIndex} commentAuthors={Object.fromEntries(comments.map(row => [row.id, row.author_name || row.author_username]))} sectionTitles={{ general: '直接留言', ...Object.fromEntries(content.sections.map(section => [section.id, section.title])) }} />}
    </main>
    <footer className="help-footer">忘记密码请联系管理员重置。</footer>
    <a className="help-top-floating" href="#help-top" aria-label="返回顶部">↑ 返回顶部</a>
  </div>;
}
