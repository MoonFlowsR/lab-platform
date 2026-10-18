import { recordInDateRange } from './module-date.js';

const auditDetails = new WeakMap();
const keyFor = (collection, id) => collection && id != null && id !== '' ? `${collection}:${id}` : '';
const ownershipFields = {
  accounts: ['username'], student_profiles: ['username'],
  lab_work_requests: ['applicant_username'], lab_purchase_requests: ['applicant_username'], lab_stock_out_requests: ['applicant_username'],
  lab_stock_transactions: ['operator_username'],
  lab_materials: ['created_by_username'], lab_material_batches: ['purchaser_username', 'created_by_username', 'inbound_by_username'],
};
const hasEventOwnership = (log, details) => details.snapshots.some(snapshot => snapshot && typeof snapshot === 'object'
  && (ownershipFields[log.target_type] || ['username', 'applicant_username', 'operator_username', 'created_by_username'])
    .some(field => typeof snapshot[field] === 'string' && snapshot[field]));

function identities(value, users = new Set(), targets = new Set()) {
  if (!value || typeof value !== 'object') return { users, targets };
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'username' || key.endsWith('_username')) && key !== 'last_modified_username' && typeof item === 'string' && item) users.add(item);
    if (item && typeof item === 'object') identities(item, users, targets);
  }
  for (const id of [value.target_id, value.target_public_id]) {
    const target = keyFor(value.target_collection, id);
    if (target) targets.add(target);
  }
  for (const id of [value.batch_id, value.batch_code]) {
    const target = keyFor('lab_material_batches', id);
    if (target) targets.add(target);
  }
  for (const id of [value.related_purchase_record_id, value.related_purchase_id]) {
    const target = keyFor('lab_purchase_requests', id);
    if (target) targets.add(target);
  }
  return { users, targets };
}

function detailsFor(log) {
  if (auditDetails.has(log)) return auditDetails.get(log);
  const snapshots = ['before_json', 'after_json'].map(field => {
    try { return JSON.parse(log[field] || 'null'); } catch { return null; }
  });
  const details = { ...identities(snapshots), snapshots };
  auditDetails.set(log, details);
  return details;
}

// Match real account identities and collection-qualified targets, including retained audit snapshots.
export function createAdminRecordFilter({ accounts = [], auditLogs = [], collections = {} } = {}, { student = '', teacher = '', range = {} } = {}) {
  const usersMatch = users => !student || users.has(student);
  const accountMatches = account => (!student || account.username === student) && (!teacher || account.username === teacher) && recordInDateRange(account, range);
  if (!student && !teacher) return { accountMatches, auditMatches: log => recordInDateRange(log, range) };

  const accountTargets = new Map(accounts.flatMap(account => [account.id, account._id].flatMap(id => ['accounts', 'student_profiles'].map(collection => [keyFor(collection, id), account.username])).filter(([key]) => key)));
  const teacherAuditMatches = (log, details) => {
    if (!teacher || log.operator_username === teacher) return true;
    if (!['accounts', 'student_profiles'].includes(log.target_type)) return false;
    // Managing this exact account is direct participation; its mentor profile is only display context.
    const usernames = details.snapshots.map(row => row?.username).filter(Boolean);
    return usernames.length ? usernames.includes(teacher) : accountTargets.get(keyFor(log.target_type, log.target_id)) === teacher;
  };

  const targets = new Map();
  const addTarget = (collection, ids, details, replace = true) => {
    const keys = ids.map(id => keyFor(collection, id)).filter(Boolean);
    if (!keys.length) return;
    const entry = { users: details.users, targets: details.targets };
    keys.forEach(key => { if (replace || !targets.has(key)) targets.set(key, entry); });
  };
  accounts.forEach(account => {
    const details = identities({ username: account.username });
    addTarget('accounts', [account.id, account._id], details);
    addTarget('student_profiles', [account.id, account._id], details);
  });
  Object.entries(collections).forEach(([collection, rows]) => rows.forEach(row => {
    // A transaction's batch code links to a batch; it never identifies the transaction itself.
    addTarget(collection, [row._id, row.public_id, ...(collection === 'lab_material_batches' ? [row.batch_code] : [])], identities(row));
  }));
  const newestLogs = [...auditLogs].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || Number(b.id || b._id) - Number(a.id || a._id));
  newestLogs.forEach(log => {
    const details = detailsFor(log);
    const accountKey = keyFor(log.target_type, log.target_id);
    if (accountKey && ['accounts', 'student_profiles'].includes(log.target_type) && !accountTargets.has(accountKey)) {
      const username = [...details.snapshots].reverse().find(row => row?.username)?.username;
      if (username) accountTargets.set(accountKey, username);
    }
    if (targets.has(keyFor(log.target_type, log.target_id))) return;
    const ids = [log.target_id, ...details.snapshots.flatMap(row => row && typeof row === 'object'
      ? [row._id, row.id, row.public_id, ...(log.target_type === 'lab_material_batches' ? [row.batch_code] : [])] : [])];
    const selfKeys = new Set(ids.map(id => keyFor(log.target_type, id)));
    const links = new Set([...details.targets].filter(target => !selfKeys.has(target)));
    if (!hasEventOwnership(log, details) && !links.size) return;
    // Retain one usable historical state for deleted targets, without pooling later event participants.
    addTarget(log.target_type, ids, { users: details.users, targets: links }, false);
  });

  const resolved = new Map();
  const targetUsers = key => {
    if (resolved.has(key)) return resolved.get(key);
    const pending = [key], visited = new Set(), users = new Set();
    for (let index = 0; index < pending.length; index++) {
      const target = pending[index];
      if (visited.has(target)) continue;
      visited.add(target);
      const entry = targets.get(target);
      if (!entry) continue;
      entry.users.forEach(username => users.add(username));
      entry.targets.forEach(link => pending.push(link));
    }
    resolved.set(key, users);
    return users;
  };
  const auditMatches = log => {
    if (!recordInDateRange(log, range)) return false;
    const details = detailsFor(log);
    if (!teacherAuditMatches(log, details)) return false;
    const users = new Set(details.users);
    if (log.operator_username) users.add(log.operator_username);
    // Complete business-event snapshots describe that event. Current ownership must not rewrite history.
    // Attachment/review links still identify the specific record affected by their event.
    const linkedEvent = ['lab_attachments', 'lab_review_logs', 'lab_user_hidden_records'].includes(log.target_type);
    const ownsTarget = hasEventOwnership(log, details);
    const links = new Set(!ownsTarget || linkedEvent ? details.targets : []);
    if (!ownsTarget) links.add(keyFor(log.target_type, log.target_id));
    links.forEach(key => targetUsers(key).forEach(username => users.add(username)));
    return usersMatch(users);
  };
  return { accountMatches, auditMatches };
}
