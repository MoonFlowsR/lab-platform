import { toDateInputValue } from "../../app/formatters.js";
import { styles } from "../../app/styles.js";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { groupDropdownOptions } from "../lib/dropdown-order.js";
import { formatPublicNumbers } from "../lib/public-number.js";
import ExportButton from './ExportButton.jsx';

function DateInput({ value, onChange, required = false, min = "2000-01-01", max = "2099-12-31" }) {
  const currentValue = toDateInputValue(value);

  function openPicker(event) {
    // The native input receives the real tap; older mobile browsers use their default picker.
    if (typeof event.currentTarget.showPicker !== "function") return;
    try {
      event.currentTarget.showPicker();
      event.preventDefault(); // Avoid opening and immediately toggling the native indicator closed.
    }
    catch { /* Native click/focus still works if this browser restricts showPicker. */ }
  }

  return <div className="platform-date-control" style={styles.datePickerWrap}>
    <span
      className="platform-date-display"
      aria-hidden="true"
      style={{ ...styles.dateSelectButton, color: currentValue ? "#0f172a" : "#64748b" }}
    >
      {currentValue ? currentValue.replace(/-/g, "/") : "yyyy/mm/dd"}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
    </span>
    <input
      type="date"
      className="platform-date-input"
      value={currentValue}
      min={min}
      max={max}
      required={required}
      onClick={openPicker}
      onInput={(e) => onChange(e.currentTarget.value)}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>;
}
function Toolbar({ title, description, onExport }) {
  return <section style={styles.toolbar}><div><h2 style={styles.h2}>{title}</h2>{description && <p style={styles.muted}>{description}</p>}</div>{onExport && <ExportButton onExport={onExport} />}</section>;
}
function StatCard({ title, value, tone = "gray" }) {
  const toneStyle = { gray: { background: "#f8fafc", color: "#0f172a" }, blue: { background: "#eff6ff", color: "#1d4ed8" }, green: { background: "#ecfdf5", color: "#047857" }, orange: { background: "#fff7ed", color: "#c2410c" }, red: { background: "#fef2f2", color: "#b91c1c" }, purple: { background: "#f5f3ff", color: "#6d28d9" } }[tone];
  return <div style={{ ...styles.statCard, ...toneStyle }}><div style={styles.statTitle}>{title}</div><div style={styles.statValue}>{value}</div></div>;
}
const normalizeDropdownSearch = text => String(text ?? "").normalize("NFKC").trim().toLowerCase();
function SearchableSelect({ value, onChange, options = [], placeholder = "搜索或选择", required = false, disabled = false, allowCustom = false, clearOnInput = true, emptyText = "无相关内容", fixedOptions = [], lastOptions = [], searchTerms }) {
  const normalizedOptions = useMemo(() => options.map(item => {
    const option = typeof item === "object" ? { value: String(item.value), label: String(item.label) } : { value: String(item), label: String(item) };
    return { ...option, searchLabel: normalizeDropdownSearch(option.label), searchAliases: (searchTerms?.get(option.value) || []).map(term => ({text:term,normalized:normalizeDropdownSearch(term)})) };
  }), [options, searchTerms]);
  const selectedOption = normalizedOptions.find(item => item.value === String(value ?? ""));
  const valueLabel = selectedOption?.label || String(value || "");
  const [query, setQuery] = useState(valueLabel);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const typingRef = useRef(false);
  const menuId = useId();
  const hasSelection = Boolean(selectedOption);
  const fixedKey = JSON.stringify(fixedOptions), lastKey = JSON.stringify(lastOptions);
  const orderedOptions = useMemo(() => {
    const fixed = new Set(JSON.parse(fixedKey)), pinnedLast = new Set([...JSON.parse(lastKey), "其它", "其他", "其他（自行填写）"]);
    const groups = groupDropdownOptions(normalizedOptions.filter(item => !fixed.has(item.value) && !pinnedLast.has(item.value)));
    return [...normalizedOptions.filter(item => fixed.has(item.value)), ...groups.flatMap(group => group.items), ...normalizedOptions.filter(item => pinnedLast.has(item.value) && !fixed.has(item.value))];
  }, [normalizedOptions, fixedKey, lastKey]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !disabled && !allowCustom && !hasSelection ? "请从列表选择一项。" : "");
  }, [required, disabled, allowCustom, hasSelection]);

  useEffect(() => {
    if (typingRef.current) { typingRef.current = false; return; }
    setQuery(valueLabel); setSearching(false); setActiveIndex(-1);
  }, [valueLabel]);

  useEffect(() => {
    function handleOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) { setOpen(false); setSearching(false); }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const keyword = searching ? normalizeDropdownSearch(query) : "";
  const matchingTerm = item => keyword && !item.searchLabel.includes(keyword)
    ? item.searchAliases.find(term => term.normalized.includes(keyword))?.text
    : "";
  const displayedOptions = keyword
    ? orderedOptions.filter((item) => item.searchLabel.includes(keyword) || matchingTerm(item))
    : orderedOptions;

  function handleInput(nextQuery) {
    setQuery(nextQuery);
    setSearching(true); setActiveIndex(-1);
    if (allowCustom) {
      typingRef.current = nextQuery !== String(value ?? "");
      onChange(nextQuery);
    } else if (clearOnInput && String(value ?? "") !== "") {
      typingRef.current = true;
      onChange("");
    }
    setOpen(true);
  }

  function choose(item) {
    typingRef.current = false;
    setQuery(item.label);
    onChange(item.value);
    setSearching(false); setActiveIndex(-1); setOpen(false);
  }

  useEffect(() => {
    if (open && activeIndex >= 0) wrapRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  return <div className="platform-search-select" ref={wrapRef} style={styles.searchSelectWrap}>
    <input
      ref={inputRef}
      required={required}
      disabled={disabled}
      role="combobox"
      aria-expanded={open}
      aria-controls={menuId}
      aria-autocomplete="list"
      aria-activedescendant={open && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
      style={{ ...styles.input, paddingRight: 56 }}
      value={query}
      autoComplete="off"
      placeholder={placeholder}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
      onInput={() => { setSearching(true); setActiveIndex(-1); setOpen(true); }}
      onChange={(e) => handleInput(e.target.value)}
      onBlur={(event) => {
        if (wrapRef.current?.contains(event.relatedTarget)) return;
        typingRef.current = false;
        setQuery(valueLabel);
        setSearching(false); setActiveIndex(-1); setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setSearching(false); setQuery(valueLabel); setActiveIndex(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (displayedOptions.length) setActiveIndex(index => event.key === "ArrowDown" ? (index + 1) % displayedOptions.length : (index <= 0 ? displayedOptions.length : index) - 1);
        }
        if (event.key === "Enter" && open) {
          event.preventDefault();
          if (activeIndex >= 0 && displayedOptions[activeIndex]) choose(displayedOptions[activeIndex]);
          else if (displayedOptions.length === 1) choose(displayedOptions[0]);
          else if (allowCustom) setOpen(false);
        }
      }}
    />
    <button disabled={disabled} type="button" tabIndex={-1} aria-label="展开选项" style={styles.searchSelectArrow} onMouseDown={(e) => e.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen((prev) => !prev); setActiveIndex(-1); }}>▾</button>
    {open && !disabled && <div id={menuId} role="listbox" style={styles.searchSelectMenu}>
      {displayedOptions.length === 0 ? <div style={styles.searchSelectEmpty}>{keyword ? "无相关内容" : emptyText}</div> : displayedOptions.map((item, index) => <button
        key={item.value}
        id={`${menuId}-${index}`}
        role="option"
        aria-selected={item.value === String(value ?? "")}
        type="button"
        style={{ ...styles.searchSelectOption, ...((item.value === String(value ?? "") || index === activeIndex) ? styles.searchSelectOptionActive : {}) }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={event => { event.preventDefault(); event.stopPropagation(); choose(item); }}
      ><span>{item.label}</span>{matchingTerm(item) && <small style={{ display: "block", fontSize: 12, fontWeight: 400, color: "#64748b", marginTop: 3, lineHeight: 1.5, overflowWrap: "anywhere" }}>匹配：{matchingTerm(item)}</small>}</button>)}
    </div>}
  </div>;
}
function Field({ label, children, wide, required = false }) {
  return <label style={wide ? styles.fullWidth : undefined}>
    <div style={styles.fieldLabel}>{required && <span style={styles.requiredStar}>*</span>}{label}</div>
    {children}
  </label>;
}
function identityLabel(label) { return ["申请人", "审批人", "审核人", "采购人", "入库人", "操作人"].includes(label); }
const numberedValue = (label, value) => /编号|^批次$|批次号|流水号/.test(label) ? formatPublicNumbers(value) : value;
function Info({ label, value, strong, danger }) {
  strong = strong || identityLabel(label);
  return <div style={styles.info}><div style={styles.infoLabel}>{label}</div><div style={{ ...styles.infoValue, fontWeight: strong ? 800 : 500, color: danger ? "#dc2626" : identityLabel(label) ? "#1e40af" : "#0f172a" }}>{numberedValue(label, value) || "-"}</div></div>;
}
function Badge({ text }) {
  let style = styles.badge;
  const s = String(text || "");
  if (s.includes("待") || s.includes("未")) style = { ...style, background: "#fef3c7", color: "#92400e" };
  if (s.includes("通过") || s.includes("确认") || s.includes("完成") || s.includes("已实施")) style = { ...style, background: "#dcfce7", color: "#166534" };
  if (s.includes("驳回") || s.includes("高风险")) style = { ...style, background: "#fee2e2", color: "#991b1b" };
  if (s.includes("需修改") || s.includes("中风险")) style = { ...style, background: "#ffedd5", color: "#9a3412" };
  return <span style={style}>{text}</span>;
}
function DataTable({ columns, rows, mobileColumns, desktopColumns }) {
  const common = ["材料", "材料名称", "姓名", "用户名", "规格", "当前库存", "出入退库类型", "类型", "数量", "审批人", "审批结果", "申请状态", "状态", "操作时间", "操作"];
  const primary = (mobileColumns || columns.filter(label => common.includes(label) && label !== "操作").slice(0, 4));
  if (!primary.length) primary.push(columns[0]);
  const desktopPrimary = desktopColumns || (columns.length > 9 ? [...new Set([...primary, ...columns.filter(label => /^(时间|提交时间|建立时间|申请人|操作人|批次)$/.test(label))])].slice(0, 8) : columns);
  const shownDesktop = columns.map((label,index) => ({label,index})).filter(({label}) => desktopPrimary.includes(label) || label.endsWith('操作'));
  const hiddenDesktop = columns.map((label,index) => ({label,index})).filter(({index}) => !shownDesktop.some(cell => cell.index === index));
  const actionIndex = columns.findIndex(label => label.endsWith("操作"));
  const cells = (row, detailed) => columns.flatMap((label, index) => index !== actionIndex && primary.includes(label) !== detailed ? [<div key={label} data-label={label}><dt>{label}</dt><dd className={identityLabel(label) ? "platform-identity" : undefined}>{numberedValue(label, row[index]) ?? "—"}</dd></div>] : []);
  return <>
    <div className="platform-table-scroll platform-table-desktop" style={styles.tableWrap}><table className="platform-data-table" style={styles.table}><thead><tr>{shownDesktop.map(({label}) => <th key={label} style={styles.th}>{label}</th>)}{hiddenDesktop.length > 0 && <th style={styles.th}>明细</th>}</tr></thead><tbody>{rows.length === 0 ? <tr><td style={styles.td} colSpan={shownDesktop.length + Number(Boolean(hiddenDesktop.length))}>暂无数据</td></tr> : rows.map((row, i) => <tr key={i}>{shownDesktop.map(({label,index}) => <td key={label} className={identityLabel(label) ? "platform-identity" : undefined} style={styles.td} data-label={label}>{numberedValue(label, row[index])}</td>)}{hiddenDesktop.length > 0 && <td style={styles.td}><details className="platform-table-details"><summary>查看明细</summary><dl>{hiddenDesktop.map(({label,index}) => <div key={label}><dt>{label}</dt><dd className={identityLabel(label) ? "platform-identity" : undefined}>{numberedValue(label,row[index]) ?? '—'}</dd></div>)}</dl></details></td>}</tr>)}</tbody></table></div>
    <div className="platform-mobile-records">{rows.length === 0 ? <Empty text="暂无数据" /> : rows.map((row, i) => <article className="platform-mobile-record" key={i}><dl>{cells(row, false)}</dl>{columns.some(label => !primary.includes(label) && label !== "操作") && <details><summary>查看明细</summary><dl>{cells(row, true)}</dl></details>}{actionIndex >= 0 && row[actionIndex] && <div className="platform-mobile-actions">{row[actionIndex]}</div>}</article>)}</div>
  </>;
}
function MiniBars({ data }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  if (!entries.length) return <p style={styles.muted}>暂无数据。</p>;
  return <div>{entries.map(([key, value]) => <div key={key} style={{ marginBottom: 12 }}><div style={styles.barLabel}><span>{key}</span><span>{value}</span></div><div style={styles.barTrack}><div style={{ ...styles.barFill, width: `${Math.max(6, (value / max) * 100)}%` }} /></div></div>)}</div>;
}
function Empty({ text }) {
  return <div style={styles.empty}>{text}</div>;
}
export { Badge, DataTable, DateInput, Empty, Field, Info, MiniBars, SearchableSelect, StatCard, Toolbar };
