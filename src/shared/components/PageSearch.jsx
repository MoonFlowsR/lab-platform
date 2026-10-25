import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

export default function PageSearch({ value, onChange }) {
  const input = useRef(null);
  useEffect(() => {
    function shortcut(event) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector('[aria-modal="true"],dialog[open]')
      ) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <div className="platform-page-search">
      <Icon name="search" size={18} />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索页面内任意内容"
        aria-label="搜索记录"
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
