import { optionKey, uniqueOptions } from '../../shared/lib/dropdown-normalize.js';
import { chinaDate } from '../reports/report-data.js';

const historyKey = row => {
  const { applicant_username: student, request_type: type, work_content: name, external_unit: institution } = row;
  return student && type && optionKey(name) && optionKey(institution)
    ? JSON.stringify([student, type, optionKey(name), optionKey(institution)]) : '';
};

export function indexWorkHistory(rows = []) {
  const index = new Map();
  for (const row of rows) {
    const key = historyKey(row);
    if (!key || row.deleted_at || !Number.isFinite(Date.parse(row.created_at))) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  for (const group of index.values()) group.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || Number(b._id || 0) - Number(a._id || 0));
  return index;
}

// Six calendar months, starting at midnight in China; clamp month-end dates.
export function workHistoryStart(now = new Date()) {
  const [year, month, day] = chinaDate(now).split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 7, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const date = [first.getUTCFullYear(), String(first.getUTCMonth() + 1).padStart(2, '0'), String(Math.min(day, lastDay)).padStart(2, '0')].join('-');
  return Date.parse(date + 'T00:00:00+08:00');
}

export function recentSameWork(row, index, now = new Date()) {
  const currentTime = Date.parse(row.created_at), upper = Math.min(Number(now), Number.isFinite(currentTime) ? currentTime : Number(now));
  const lower = workHistoryStart(now);
  return (index.get(historyKey(row)) || []).filter(other => {
    if ((row._id != null && String(other._id) === String(row._id)) || (row.public_id && other.public_id === row.public_id)) return false;
    const time = Date.parse(other.created_at);
    return time >= lower && time <= upper && (time !== currentTime || !Number(row._id) || Number(other._id) < Number(row._id));
  });
}

export const workInstitutionOptions = (rows = [], type) => uniqueOptions(rows.filter(row => row.request_type === type && !row.deleted_at).map(row => row.external_unit));
export const matchesWorkInstitution = (row, institution = '') => !institution || optionKey(row.external_unit) === optionKey(institution);
