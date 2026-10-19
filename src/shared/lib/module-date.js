import { chinaDate } from '../../features/reports/report-data.js';
export const datedModules = ['test', 'processing', 'repair', 'purchases', 'stock', 'materials'];
export function validDateRange({ start = '', end = '' } = {}) { return !start || !end || start <= end; }
export function recordInDateRange(row, range = {}, field = 'created_at') {
  if (!validDateRange(range)) return false;
  if (!range.start && !range.end) return true;
  const value = row[field];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : value ? chinaDate(value) : '';
  return Boolean(date) && (!range.start || date >= range.start) && (!range.end || date <= range.end);
}
