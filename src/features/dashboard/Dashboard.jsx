import { containsQuery } from '../../app/formatters.js';
import { TaskCenter, TaskLink } from '../tasks/TaskCenter.jsx';
import { WORK_DEFINITIONS } from '../work/work-types.js';

export function Dashboard({ currentUser, center, query, onOpenTask, setActiveTab, batchCount }) {
  const matches = group => !query.trim() || containsQuery({ title: group.title }, query) || group.rows.some(row => containsQuery(row, query));
  const tracking = center.groups.filter(group => group.kind === 'tracking' && group.count && matches(group));
  const warnings = center.groups.filter(group => group.kind === 'warning' && matches(group));
  const reports = currentUser.account_type !== 'student';
  return <main className="platform-overview">
    <TaskCenter center={center} query={query} currentUser={currentUser} onOpen={onOpenTask} onReports={reports ? () => setActiveTab('reports') : null} />
    <div className="platform-overview-columns">
      <section className="platform-overview-section" aria-label="进度与入口">
        <h2>{currentUser.account_type === 'admin' ? '团队待处理进度' : currentUser.account_type === 'finance' ? '需跟进的信息' : '申请进度'}</h2>
        {tracking.length ? currentUser.account_type === 'admin' ? <div className="platform-team-progress">{[...WORK_DEFINITIONS.map(row => [row.module, row.name]), ['purchases','采购'], ['stock','出库']].map(([module,label]) => {
          const groups = tracking.filter(group => group.module === module);
          return groups.length ? <section key={module}><h3>{label}</h3><div>{groups.map(group => <TaskLink key={group.id} group={group} compact showAmount={false} label={group.title.replace(new RegExp('^' + label), '').replace(/^团队/, '')} onOpen={onOpenTask} />)}</div></section> : null;
        })}</div> : <div className="platform-overview-tracking">{tracking.map(group => <TaskLink key={group.id} group={group} compact onOpen={onOpenTask} />)}</div> : <p className="platform-overview-note">{query.trim() ? '没有匹配的进度提醒。' : currentUser.account_type === 'teacher' ? '已审核工单可在对应模块跟进。' : '当前没有需要跟进的进度提醒。'}</p>}
        <div className="platform-overview-shortcuts">{[...WORK_DEFINITIONS.map(row => [row.module, row.name]), ['purchases', '采购/入库'], ['stock', currentUser.account_type === 'student' ? '出/退库' : '出入退库']].filter(([, label]) => !query.trim() || containsQuery({ label }, query)).map(([module, label]) => <button type="button" key={module} onClick={() => setActiveTab(module)}>查看{label} →</button>)}</div>
      </section>
      <section className="platform-overview-section" aria-label="团队库存提醒"><h2>库存提醒 <small>· {batchCount} 个批次</small></h2>
        <div className="platform-overview-warnings">{warnings.map(group => <TaskLink key={group.id} group={group} compact onOpen={onOpenTask} />)}</div>
        <div className="platform-overview-shortcuts"><button type="button" onClick={() => setActiveTab('materials')}>查看全部库存 →</button></div>
      </section>
    </div>
  </main>;
}
