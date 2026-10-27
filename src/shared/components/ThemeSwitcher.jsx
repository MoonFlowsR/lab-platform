import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { getThemePreference, setThemePreference, subscribeTheme } from "../lib/theme.js";
import "./ThemeSwitcher.css";

const choices = [
  { value: "light", label: "浅色模式", short: "浅色" },
  { value: "dark", label: "深色模式", short: "深色" },
  { value: "mixed", label: "混合模式", short: "混合" },
  { value: "system", label: "跟随系统", short: "跟随系统" },
];

function ThemeIcon({ mode }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {mode === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
      : mode === "dark" ? <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
        : mode === "mixed" ? <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></>
          : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}
  </svg>;
}

export default function ThemeSwitcher({ className = "" }) {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference);
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null), items = useRef([]), focusIndex = useRef(null);
  const menuId = useId();
  const current = choices.find(choice => choice.value === preference);
  useEffect(() => {
    if (!open) return;
    items.current[focusIndex.current ?? choices.findIndex(choice => choice.value === preference)]?.focus();
    focusIndex.current = null;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, preference]);
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function onMenuKey(event) {
    const index = items.current.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (index + 1) % choices.length
      : event.key === "ArrowUp" ? (index - 1 + choices.length) % choices.length
        : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : null;
    if (next !== null) { event.preventDefault(); items.current[next]?.focus(); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "Tab") close();
  }
  return <div className={`platform-theme-switcher ${className}`} ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <button type="button" className="platform-theme-trigger" ref={trigger} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={`显示方式：${current.label}`} title={`显示方式：${current.label}`} onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); focusIndex.current = event.key === "ArrowDown" ? 0 : choices.length - 1; setOpen(true);
        }
      }}>
      <ThemeIcon mode={preference} /><span className="platform-theme-current">{current.short}</span>
    </button>
    {open && <div className="platform-theme-menu" id={menuId} role="menu" aria-label="显示方式" onKeyDown={onMenuKey}>
      {choices.map((choice, index) => <button type="button" className="platform-theme-option" key={choice.value} role="menuitemradio" aria-checked={preference === choice.value}
        ref={node => { items.current[index] = node; }} tabIndex={-1} onClick={() => { setThemePreference(choice.value); close(true); }}>
        <ThemeIcon mode={choice.value} /><span>{choice.label}</span><span className="platform-theme-check" aria-hidden="true">{preference === choice.value ? "✓" : ""}</span>
      </button>)}
    </div>}
  </div>;
}
