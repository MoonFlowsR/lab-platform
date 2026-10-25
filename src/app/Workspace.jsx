import { useEffect, useRef, useState } from "react";
import Icon from "../shared/components/Icon.jsx";
import PlatformTitle from "../shared/components/PlatformTitle.jsx";
import PersonName from "../shared/components/PersonName.jsx";
import { splitPersonName } from "../shared/lib/person-name.js";
import { accountTypeLabels, PLATFORM_TITLE } from "./config.js";
import "./workspace.css";

const roleHeadings = {
  student: "我的工作台",
  teacher: "审核工作台",
  finance: "财务工作台",
  admin: "团队工作台",
};

// Layout only: business scope, permissions and task selection stay in App/task-model.
export default function Workspace({
  account,
  tabs,
  activeTab,
  taskCenter,
  syncing,
  syncStatus,
  onNavigate,
  onOverview,
  onSync,
  onSettings,
  onLogout,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  const navRef = useRef(null);
  const menuButton = useRef(null);
  const currentTitle = tabs.find(([key]) => key === activeTab)?.[1] || "总览";
  const role = accountTypeLabels[account.account_type];
  const user = account.display_name || account.username;
  const avatarName = account.account_type === "student"
    ? splitPersonName(user).name
    : user.trim();
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow,
      opener = menuButton.current;
    document.body.style.overflow = "hidden";
    navRef.current?.querySelector('[aria-current="page"]')?.focus();
    const closeAtDesktop = () => {
      if (window.innerWidth >= 1100) setMenuOpen(false);
    };
    window.addEventListener("resize", closeAtDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", closeAtDesktop);
      opener?.focus();
    };
  }, [menuOpen]);
  function trapNavigation(event) {
    if (!menuOpen) return;
    if (event.key === "Escape") {
      setMenuOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...navRef.current.querySelectorAll("button,a[href]"),
    ].filter((node) => node.getClientRects().length);
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function navigate(key) {
    onNavigate(key);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  const status = (
    <div className={`workspace-statusbar platform-sync-status${desktop ? " is-in-toolbar" : ""}`}>
      <span
        className={`workspace-sync-dot${syncing ? " is-busy" : syncStatus === "同步完成" || syncStatus === "同步完成。" ? "" : " is-warning"}`}
      />
      <span title={`同步状态：${syncStatus}`}>同步状态：{syncStatus}</span>
      <strong className="platform-sync-guidance">
        请在状态为“同步完成”后操作
      </strong>
    </div>
  );
  return (
    <div className="platform-shell platform-workspace">
      <a className="platform-skip-link" href="#platform-content">
        跳转到页面内容
      </a>
      {menuOpen && (
        <div
          className="workspace-scrim"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        ref={navRef}
        className={`workspace-sidebar${menuOpen ? " is-open" : ""}`}
        id="workspace-navigation"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
        aria-label="模块导航"
        onKeyDown={trapNavigation}
      >
        <div className="workspace-brand">
          <span className="workspace-brand-mark">
            <Icon name="flask" size={25} />
          </span>
          <span className="workspace-brand-name">
            <PlatformTitle />
            <small>实验室协作平台</small>
          </span>
          <button
            type="button"
            className="workspace-nav-close"
            aria-label="关闭导航"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace-nav-caption">
          工作空间 <span>{role}</span>
        </div>
        <nav className="platform-nav" aria-label="主要模块">
          {tabs.map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => navigate(key)}
              aria-current={activeTab === key ? "page" : undefined}
              aria-label={label}
              title={
                taskCenter.byModule[key]
                  ? `查看本模块 ${taskCenter.byModule[key]} 条待办`
                  : label
              }
            >
              <Icon name={key} />
              <span>{label}</span>
              {taskCenter.byModule[key] > 0 && (
                <span className="platform-nav-task-count" aria-hidden="true">
                  {taskCenter.byModule[key]}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <span className="workspace-avatar" aria-hidden="true">
            {Array.from(avatarName).slice(-2).join("")}
          </span>
          <div>
            <strong><PersonName value={user} stacked mentorLabel={account.account_type === "student"} suffix={role} /></strong>
          </div>
        </div>
      </aside>
      <div className="workspace-body" inert={menuOpen || undefined}>
        <header className="workspace-topbar">
          <div className="workspace-context">
            <button
              ref={menuButton}
              type="button"
              className="workspace-menu-button"
              aria-label="打开模块导航"
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="workspace-context-icon">
              <Icon name={activeTab} />
            </span>
            <span>{currentTitle}</span>
          </div>
          {desktop && status}
          <div className="workspace-topbar-actions">
            <button
              type="button"
              className="workspace-tasks platform-task-entry"
              onClick={onOverview}
              aria-label={`我的待办，${taskCenter.total} 条`}
            >
              <Icon name="tasks" />
              <span>待办</span>
              <b>{taskCenter.total}</b>
            </button>
            <button
              type="button"
              className="workspace-tool"
              disabled={syncing}
              onClick={onSync}
              title="手动同步"
              aria-label={syncing ? "同步中…" : "手动同步"}
            >
              <Icon name="refresh" className={syncing ? "is-spinning" : ""} />
              <span>手动同步</span>
            </button>
            <a
              className="workspace-tool"
              href="/help"
              title="帮助文档"
              aria-label="帮助文档"
            >
              <Icon name="help" />
              <span>帮助文档</span>
            </a>
            <button
              type="button"
              className="workspace-tool"
              onClick={onSettings}
              title="账户设置"
              aria-label="账户设置"
            >
              <Icon name="settings" />
              <span>账户设置</span>
            </button>
            <span className="workspace-current-account" title={`${avatarName} · ${role}`} aria-label={`当前账号：${avatarName}，${role}`}>
              {avatarName}
            </span>
            <button
              type="button"
              className="workspace-tool workspace-logout"
              onClick={onLogout}
              title="退出登录"
              aria-label="退出登录"
            >
              <Icon name="logout" />
              <span>退出登录</span>
            </button>
          </div>
        </header>
        {!desktop && status}
        <div id="platform-content" className="workspace-content" tabIndex={-1}>
          {activeTab === "dashboard" && (
            <div className="workspace-welcome">
              <div>
                <h1>{roleHeadings[account.account_type] || "工作台"}</h1>
              </div>
              <time>
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                  timeZone: "Asia/Shanghai",
                }).format(new Date())}
              </time>
            </div>
          )}
          {children}
          <footer className="workspace-footer">
            <span>{PLATFORM_TITLE}</span>
            <a href="/help">
              使用帮助 <span aria-hidden="true">↗</span>
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
