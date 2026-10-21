import { money, containsQuery } from '../../app/formatters.js';
import './tasks.css';

export function TaskLink({ group, onOpen, compact = false, label = group.title, showAmount = true }) {
  return <button type="button" className={`platform-task-link${compact ? ' is-compact' : ''}`} data-task={group.id} onClick={() => onOpen(group.id)}>
    <span className="platform-task-name">{label}</span><strong>{group.count}<small>{group.kind === 'warning' ? ' 批' : ' 条'}</small></strong>
    {showAmount && group.amount != null && <span className="platform-task-amount">{money(group.amount)}</span>}
    <span className="platform-task-action">{group.action} <span aria-hidden="true">→</span></span>
  </button>;
}

export function TaskCenter({ center, currentUser, query = '', onOpen, onReports }) {
  const actions = center.groups.filter(group => group.kind === 'action' && group.count);
  const visible = actions.filter(group => !query.trim() || containsQuery({ title: group.title }, query) || group.rows.some(row => containsQuery(row, query)));
  const description = { student: '确认工单、到货入库，处理需要修改的申请。', teacher: '优先处理指定你审核的申请。', finance: '核对已完成工单的最终金额，登记报销。', admin: '处理账号事务，跟进团队业务进度。' }[currentUser.account_type];
  return <section className="platform-task-center" aria-label="我的待办">
    <div className="platform-task-heading"><div><h2>我的待办 <span data-testid="task-total">{center.total}</span></h2><p>{description}</p></div>{onReports && <button type="button" className="platform-task-report-link" onClick={onReports}>统计与导出 <span aria-hidden="true">→</span></button>}</div>
    <div className="platform-task-grid">{visible.map(group => <TaskLink key={group.id} group={group} onOpen={onOpen} />)}</div>
    {!visible.length && <p className="platform-task-empty">{actions.length ? '没有匹配的待办事项。' : '当前没有需要你处理的事项。'}</p>}
    <p className="platform-task-caption">数量随同步更新；点击直接处理对应记录。</p>
  </section>;
}

export function TaskFilterBanner({ task, onClear, onBack, query }) {
  return <section className="platform-task-filter" aria-label="当前待办筛选" tabIndex={-1} id="platform-task-results">
    <div><h2>{task.title} <span>{task.count} {task.kind === 'warning' ? '批' : '条'}</span></h2><p>{task.count ? query.trim() ? '下方显示此事项中符合搜索的记录。' : task.kind === 'action' ? '下方仅显示当前待办，可直接处理。' : '下方仅显示此类记录。' : task.kind === 'action' ? '此项待办已处理完毕。' : '当前已无此类记录。'}</p></div>
    <div><button type="button" onClick={onBack}>返回待办</button><button type="button" onClick={onClear}>查看本模块全部记录</button></div>
  </section>;
}
