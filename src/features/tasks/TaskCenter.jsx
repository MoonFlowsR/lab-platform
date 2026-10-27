import { money, containsQuery } from "../../app/formatters.js";
import "./tasks.css";
import Icon from "../../shared/components/Icon.jsx";
import { useEffect } from "react";

export function TaskLink({
  group,
  onOpen,
  compact = false,
  label = group.title,
  showAmount = true,
}) {
  return (
    <button
      type="button"
      className={`platform-task-link${compact ? " is-compact" : ""}${showAmount && group.amount != null ? " has-amount" : ""}`}
      data-task={group.id}
      onClick={() => onOpen(group.id)}
    >
      <span className="platform-task-name">
        <Icon
          name={group.kind === "warning" ? "warning" : group.module}
          size={18}
        />
        {label}
      </span>
      <strong>
        {group.count}
        <small>{group.kind === "warning" ? " 批" : " 条"}</small>
      </strong>
      {showAmount && group.amount != null && (
        <span className="platform-task-amount">{money(group.amount)}</span>
      )}
      <span className="platform-task-action">
        {group.action}<Icon name="arrowUpRight" size={16} />
      </span>
    </button>
  );
}

export function TaskCenter({
  center,
  currentUser,
  query = "",
  onOpen,
  onReports,
}) {
  const actions = center.groups.filter(
    (group) => group.kind === "action" && group.count,
  );
  const visible = actions.filter(
    (group) =>
      !query.trim() ||
      containsQuery({ title: group.title }, query) ||
      group.rows.some((row) => containsQuery(row, query)),
  );
  const moduleNames = {
    test: "测试",
    processing: "加工",
    repair: "维修",
    purchases: "采购/入库",
    stock: "出/退库",
    admin: "账号管理",
  };
  const grouped = currentUser.account_type === "student" && visible.length > 6;
  const description = {
    student: "确认工单、到货入库，处理需要修改的申请。",
    teacher: "优先处理指定你审核的申请。",
    finance: "核对已完成工单的最终金额，登记报销。",
    admin: "处理账号事务，跟进团队业务进度。",
  }[currentUser.account_type];
  return (
    <section className="platform-task-center" aria-label="我的待办">
      <div className="platform-task-heading">
        <div>
          <h2>
            我的待办 <span data-testid="task-total">{center.total}</span>
          </h2>
          <p>{description}</p>
        </div>
        {onReports && (
          <button
            type="button"
            className="platform-task-report-link"
            onClick={onReports}
          >
            统计与导出<Icon name="arrowUpRight" size={16} />
          </button>
        )}
      </div>
      <div className={`platform-task-grid${grouped ? " is-grouped" : ""}`}>
        {grouped
          ? Object.entries(moduleNames).map(([module, name]) => {
              const groups = visible.filter((group) => group.module === module);
              return groups.length ? (
                <section className="platform-task-module" key={module}>
                  <h3>
                    <Icon name={module} size={18} />
                    {name}
                  </h3>
                  {groups.map((group) => (
                    <TaskLink
                      key={group.id}
                      group={group}
                      compact
                      label={group.title.replace(
                        new RegExp("^" + name.split("/")[0]),
                        "",
                      )}
                      onOpen={onOpen}
                    />
                  ))}
                </section>
              ) : null;
            })
          : visible.map((group) => (
              <TaskLink key={group.id} group={group} onOpen={onOpen} />
            ))}
      </div>
      {!visible.length && (
        <div className="platform-task-empty">
          <span>
            <Icon name={actions.length ? "search" : "check"} size={23} />
          </span>
          <p>
            {actions.length
              ? "没有匹配的待办事项。"
              : "当前没有需要你处理的事项。"}
          </p>
        </div>
      )}
    </section>
  );
}

export function TaskFilterBanner({ task, onClear, onBack, query }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById("platform-task-results");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [task.id]);
  const detail = !task.count
    ? task.kind === "action"
      ? "此项待办已处理完毕。"
      : "当前已无此类记录。"
    : query.trim()
      ? "下方显示此事项中符合搜索的记录。"
      : "";
  return (
    <section
      className="platform-task-filter"
      aria-label="当前待办筛选"
      tabIndex={-1}
      id="platform-task-results"
    >
      <div>
        <h2>
          {task.title}{" "}
          <span>
            {task.count} {task.kind === "warning" ? "批" : "条"}
          </span>
        </h2>
        {detail && <p>{detail}</p>}
      </div>
      <div>
        <button type="button" onClick={onBack}>
          <Icon name="arrowLeft" size={16} />返回待办
        </button>
        <button type="button" onClick={onClear}>
          查看本模块全部记录
        </button>
      </div>
    </section>
  );
}
