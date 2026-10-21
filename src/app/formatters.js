import { isValidLoginId } from '../shared/lib/platform-settings.js';
import { materialKey, uniqueOptions } from "../shared/lib/dropdown-normalize.js";
import { recordMatchesSearch } from "../shared/lib/teacher-filter.js";

function uniqueNonEmpty(values) {
  return uniqueOptions(values);
}
function sortByCreatedAt(rows) {
  return [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return String(value);
  }
}
function toDateInputValue(value) {
  if (!value) return "";
  const text = String(value);
  const matched = text.match(/[0-9]{4}-[0-9]{2}-[0-9]{2}/);
  if (matched) return matched[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
function money(value) {
  return `¥${num(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}
function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function normalizeItemName(value) {
  return materialKey(value);
}
function containsQuery(row, query) { return recordMatchesSearch(row, query); }

export { containsQuery, formatDate, formatFileSize, isValidLoginId, money, normalizeItemName, num, sortByCreatedAt, toDateInputValue, uniqueNonEmpty };
