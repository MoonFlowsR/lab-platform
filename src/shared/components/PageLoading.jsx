import Icon from "./Icon.jsx";

export default function PageLoading({ message = "正在加载…", full = false }) {
  return (
    <div
      className={`platform-loading${full ? " is-full" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="platform-loading-mark">
        <Icon name="flask" size={28} />
      </span>
      <strong>{message}</strong>
      <div className="platform-loading-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
