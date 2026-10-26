import { createContext, useContext } from "react";
import Icon from "../shared/components/Icon.jsx";

export const WorkspaceSyncContext = createContext(null);

export default function WorkspaceSync({ className = "" }) {
  const context = useContext(WorkspaceSyncContext);
  if (!context) return null;
  const { syncing, syncStatus, onSync } = context;
  return (
    <div className={`workspace-statusbar platform-sync-status${className ? ` ${className}` : ""}`}>
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
      <span className="workspace-sync-state" title={`同步状态：${syncStatus}`}>
        <span className={`workspace-sync-dot${syncing ? " is-busy" : syncStatus === "同步完成" || syncStatus === "同步完成。" ? "" : " is-warning"}`} />
        <span>同步状态：{syncStatus}</span>
      </span>
      <strong className="platform-sync-guidance">
        请在状态为“同步完成”后操作
      </strong>
    </div>
  );
}
