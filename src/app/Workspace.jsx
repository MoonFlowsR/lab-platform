import { useEffect, useRef, useState } from "react";
import Icon from "../shared/components/Icon.jsx";
import PlatformTitle from "../shared/components/PlatformTitle.jsx";
import ThemeSwitcher from "../shared/components/ThemeSwitcher.jsx";
import PersonName from "../shared/components/PersonName.jsx";
import { splitPersonName } from "../shared/lib/person-name.js";
import { accountTypeLabels, PLATFORM_TITLE } from "./config.js";
import WorkspaceSync, { WorkspaceSyncContext } from "./WorkspaceSync.jsx";
import packageInfo from "../../package.json" with { type: "json" };
import releaseHistory from "../config/release-history.json" with { type: "json" };
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
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [syncControlTarget, setSyncControlTarget] = useState(null);
  const navRef = useRef(null);
  const menuButton = useRef(null);
  const currentTitle = tabs.find(([key]) => key === activeTab)?.[1] || "总览";
  const role = accountTypeLabels[account.account_type];
  const user = account.display_name || account.username;
  const avatarName = account.account_type === "student"
    ? splitPersonName(user).name
    : user.trim();
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
  return (
    <WorkspaceSyncContext.Provider value={{ syncing, syncStatus, onSync, toolbarTarget, syncControlTarget }}>
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
          </span>
        </div>
        <div className="workspace-nav-caption">
          <span>工作空间</span><span className="workspace-nav-caption-role">{role}</span>
          <button type="button" className="workspace-nav-close" aria-label="关闭导航" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
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
        <div className="workspace-sidebar-bottom">
        <div className="workspace-sidebar-footer">
          <span className="workspace-avatar" aria-hidden="true">
            {Array.from(avatarName).slice(-2).join("")}
          </span>
          <div>
            <strong><PersonName value={user} stacked mentorLabel={account.account_type === "student"} suffix={role} /></strong>
          </div>
        </div>
        <small className="workspace-version" aria-label={`平台版本 ${packageInfo.version}，累计更新 ${releaseHistory.historicalUpdates + releaseHistory.releases.length} 次`}>
          <span>版本 v{packageInfo.version}</span>
          <span>累计更新 {releaseHistory.historicalUpdates + releaseHistory.releases.length} 次</span>
        </small>
        </div>
      </aside>
      <div className="workspace-body" inert={menuOpen || undefined}>
        <header className="workspace-topbar">
          <div className="workspace-topbar-primary">
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
            <div className="workspace-sync-slot" ref={setSyncControlTarget} />
            <span className="workspace-context-icon">
              <Icon name={activeTab} />
            </span>
            <span>{currentTitle}</span>
          </div>
          <WorkspaceSync className="is-in-topbar" />
          </div>
          <div className="workspace-topbar-actions">
            <ThemeSwitcher />
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
            <a
              className="workspace-tool"
              href="/help"
              title="帮助文档"
              aria-label="帮助文档"
            >
              <Icon name="help" />
              <span>帮助文档</span>
            </a>
            <span className="workspace-current-account" title={`${avatarName} · ${role}`} aria-label={`当前账号：${avatarName}，${role}`}>
              <span className="workspace-avatar workspace-current-avatar" aria-hidden="true">{Array.from(avatarName).slice(-2).join("")}</span>
              <strong>{avatarName}</strong>
            </span>
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
        <div id="platform-content" className="workspace-content" tabIndex={-1}>
          <div className="workspace-toolbar-host" ref={setToolbarTarget}>
            {activeTab === "dashboard" && (
              <div className="workspace-welcome">
                <div>
                  <h1>{roleHeadings[account.account_type] || "工作台"}</h1>
                  <time>
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                      timeZone: "Asia/Shanghai",
                    }).format(new Date())}
                  </time>
                </div>
              </div>
            )}
          </div>
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
    </WorkspaceSyncContext.Provider>
  );
}
