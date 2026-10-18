import { searchTerms, textMatchesTerms, commentMatchesTerms, commentBranchMatches } from './help-search.js';
import { useEffect, useState } from 'react';
import { displayStudentComment, studentNameLabel } from '../accounts/student-name-display.js';

const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
const actions = { createHelpComment: '发表评论', replyHelpComment: '回复评论', deleteHelpComment: '删除评论', createHelpMessage: '发表留言', replyHelpMessage: '回复留言', deleteHelpMessage: '删除留言' };
const roles = { student: '学生', teacher: '教师', admin: '管理员' };

export async function commentRequest(path, token, options = {}) {
  const response = await fetch(`/api/help-comments${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const json = await response.json();
  if (!response.ok || !json.ok) throw new Error(json.message || '评论操作失败，请重试。');
  return json;
}

export function CommentComposer({ quote, parent, account, busy, onSubmit, onCancel, kind = 'comment' }) {
  const [body, setBody] = useState('');
  const message = kind === 'message';
  return <form className="help-comment-composer" onSubmit={async event => { event.preventDefault(); if (body.trim() && account && await onSubmit(body.trim()) !== false) setBody(''); }}>
    <h3>{parent ? `回复 ${parent.author_name || parent.author_username}` : message ? '直接留言' : '评论所选内容'}</h3>
    {parent ? <blockquote>{parent.body}</blockquote> : quote && <blockquote>{quote}</blockquote>}
    <label><strong>{message ? '留言内容' : '评论内容'}<span className="help-composer-required">（必填）</span></strong><textarea autoFocus required disabled={!account || busy} maxLength={2000} rows={4} value={body} onChange={event => setBody(event.target.value)} placeholder="填写问题或建议（不超过2000字）" /></label>
    {!account ? <p role="alert">请先注册账号并登录后{message ? '发表留言' : '发表评论'}。<a href="/?register=1">去注册</a> · <a href="/">去登录</a></p> : <p className="help-comment-note">发表人：{account.display_name || account.username}。留言、评论、回复和删除操作会留存记录，管理员可查看。</p>}
    <button type="submit" disabled={!account || busy || !body.trim()}>{busy ? '发表中…' : parent ? '发表回复' : message ? '发表留言' : '发表评论'}</button>
    {onCancel && <button type="button" onClick={onCancel} disabled={busy}>取消</button>}
  </form>;
}

export function CommentThread({ terms = [], root, childrenByParent, account, onReply, onDelete, onLocate, active }) {
  const canDelete = row => account && !row.deleted_at && (row.author_username === account.username || account.account_type === 'admin');
  const children = row => (childrenByParent.get(row.id) || []).filter(child => commentBranchMatches(child,childrenByParent,terms));
  const ownMatches = row => commentMatchesTerms(row,terms);
  const renderReply = (reply, parent, depth) => <div key={reply.id} id={`comment-${reply.id}`} className="help-comment-reply" style={{ paddingLeft: depth > 1 && depth < 4 ? 8 : 0 }}>
    <div className="help-comment-meta"><b>{reply.author_name || reply.author_username}</b><span className="help-reply-target">回复 <a href={`#comment-${parent.id}`}>{reply.reply_to_name || parent.author_name || reply.reply_to_username || parent.author_username}</a></span><time dateTime={reply.created_at}>{date(reply.created_at)}</time></div>
    <p className="help-comment-body" hidden={!ownMatches(reply)}>{reply.deleted_at ? '此回复已删除' : reply.body}</p>
    {ownMatches(reply) && account?.account_type === 'admin' && reply.deleted_at && <p className="help-comment-retained">原文：{reply.body || '请在操作记录中查看原文'} · 删除人：{reply.deleted_by_name || reply.deleted_by || '详见操作记录'}</p>}
    <div className="help-comment-actions">{!reply.deleted_at && <button type="button" onClick={() => onReply(reply)}>回复</button>}{canDelete(reply) && <button className="help-comment-delete" type="button" onClick={() => onDelete(reply)}>删除回复</button>}</div>
    {children(reply).map(child => renderReply(child, reply, depth + 1))}
  </div>;
  return <article className={`help-comment-thread${active ? ' is-active' : ''}`} id={`comment-${root.id}`} tabIndex={-1} aria-label={`${root.author_name || root.author_username} 的评论`}>
    {ownMatches(root) && root.quote ? <button className="help-comment-quote" type="button" onClick={() => onLocate(root)} title={root.quote}>{root.quote}</button> : <span className="help-message-tag">直接留言</span>}
    <div className="help-comment-meta"><b>{root.author_name || root.author_username}</b><time dateTime={root.created_at}>{date(root.created_at)}</time></div>
    <p className="help-comment-body" hidden={!ownMatches(root)}>{root.deleted_at ? (root.section_id === 'general' ? '此留言已删除' : '此评论已删除') : root.body}</p>
    {ownMatches(root) && account?.account_type === 'admin' && root.deleted_at && <p className="help-comment-retained">原文：{root.body || '请在操作记录中查看原文'} · 删除人：{root.deleted_by_name || root.deleted_by || '详见操作记录'}</p>}
    <div className="help-comment-actions">{!root.deleted_at && <button type="button" onClick={() => onReply(root)}>回复</button>}{canDelete(root) && <button className="help-comment-delete" type="button" onClick={() => onDelete(root)}>删除</button>}</div>
    {children(root).map(reply => renderReply(reply, root, 1))}
  </article>;
}

export function CommentAudit({ query = "", token, revision, sectionTitles, commentAuthors, studentNameIndex }) {
  const [events, setEvents] = useState([]), [cursor, setCursor] = useState(null), [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    commentRequest('/events', token).then(json => { if (alive) { setEvents(json.events); setCursor(json.next_cursor); setMore(json.has_more); setError(''); } }).catch(failure => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [token, revision]);
  async function loadMore() {
    setBusy(true);
    try { const json = await commentRequest(`/events?before=${cursor}`, token); setEvents(prev => [...prev, ...json.events]); setCursor(json.next_cursor); setMore(json.has_more); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const terms = searchTerms(query);
  const shownEvents = events.map(event => ({ ...event, operator_name: studentNameLabel(event.operator_username, event.operator_username, studentNameIndex), comment: displayStudentComment(event.comment, studentNameIndex) })).filter(event => textMatchesTerms([event.operator_name,event.operator_username,roles[event.operator_role] || event.operator_role,actions[event.action] || event.action,date(event.created_at),sectionTitles[event.comment.section_id],event.comment.author_name,event.comment.author_username,event.comment.reply_to_name,event.comment.reply_to_username,event.comment.quote,event.comment.body,event.comment_id,event.comment.deleted_by_name,event.comment.deleted_by].join(' '),terms));
  return <section className="help-comment-audit" id="comment-audit">
    <h2>评论操作记录（管理员）</h2><p>保留全部留言、正文评论、回复及删除记录，包括删除前原文。点击“加载更早记录”可继续查看历史。</p>
    {error && <p role="alert">{error}</p>}
    {!shownEvents.length && !error && <p>{terms.length ? "已加载记录中无相关内容，可继续加载更早记录。" : "暂无评论操作记录。"}</p>}
    {shownEvents.map(event => <article key={event.id} className="help-comment-event">
      <p><b>{event.operator_name || event.operator_username}</b> · {roles[event.operator_role] || event.operator_role} · {actions[event.action] || event.action} · {date(event.created_at)}</p>
      <p>{sectionTitles[event.comment.section_id] || event.comment.section_id} · {event.comment.parent_id ? '回复' : event.comment.section_id === 'general' ? '留言' : '评论'} #{event.comment_id} · 作者：{event.comment.author_name || event.comment.author_username}</p>
      {event.comment.parent_id && <p>回复对象：{event.comment.reply_to_name || event.comment.reply_to_username || commentAuthors[event.comment.parent_id] || `评论 #${event.comment.parent_id}`}</p>}
      {event.comment.quote && <blockquote>{event.comment.quote}</blockquote>}<p className="help-comment-body">{event.comment.body}</p>
      {event.comment.deleted_at && <p>删除时间：{date(event.comment.deleted_at)} · 删除人：{event.comment.deleted_by_name || event.comment.deleted_by}</p>}
    </article>)}
    {more && <button type="button" onClick={loadMore} disabled={busy}>{busy ? '加载中…' : '加载更早记录'}</button>}
  </section>;
}
