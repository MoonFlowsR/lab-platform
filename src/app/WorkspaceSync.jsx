import { createContext, useContext, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Icon from "../shared/components/Icon.jsx";

export const WorkspaceSyncContext = createContext(null);

const mobileQuery = "(max-width: 640px)";
function subscribeMobile(callback) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function isMobile() { return window.matchMedia(mobileQuery).matches; }

function SyncControl({ syncing, onSync }) {
  return (
    <button
      type="button"
      className="workspace-sync-control"
      disabled={syncing}
      onClick={onSync}
      title="手动同步"
      aria-label={syncing ? "同步中…" : "手动同步"}
    >
      <Icon name="refresh" className={syncing ? "is-spinning" : ""} />
    </button>
  );
}

export default function WorkspaceSync({ className = "" }) {
  const context = useContext(WorkspaceSyncContext);
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);
  if (!context) return null;
  const { syncing, syncStatus, onSync, syncControlTarget } = context;
  const statusText = String(syncStatus ?? "").trim();
  const dotState = syncing ? "busy" : /^同步完成[。.]?$/.test(statusText) ? "success" : statusText.includes("失败") ? "error" : "waiting";
  const displayStatus = mobile ? String(syncStatus ?? "").replace(/[。.]$/, "") : syncStatus;
  const control = <SyncControl syncing={syncing} onSync={onSync} />;
  const mobileTarget = mobile && syncControlTarget;
  return (
    <>
    {mobileTarget && createPortal(control, mobileTarget)}
    <div className={`workspace-statusbar platform-sync-status${className ? ` ${className}` : ""}`}>
      {!mobileTarget && control}
      <span className="workspace-sync-state" title={`同步状态：${syncStatus}`} aria-label={`同步状态：${syncStatus}`}>
        <span className={`workspace-sync-dot is-${dotState}`} aria-hidden="true" />
        <span><span className="workspace-sync-prefix">同步状态：</span>{displayStatus}</span>
      </span>
      <strong className="platform-sync-guidance">
        请等待同步完成后操作
      </strong>
    </div>
    </>
  );
}
