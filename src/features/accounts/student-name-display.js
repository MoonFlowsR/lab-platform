const clean = value => String(value ?? '').trim();
function mentorSuffix(responsibleName, guidingName) {
  const responsible = clean(responsibleName), guiding = clean(guidingName);
  if (!responsible || !guiding) return '';
  return `（${responsible === guiding ? responsible : `${responsible}，${guiding}`}）`;
}
const identityFields = [
  ['applicant_name', 'applicant_username'], ['created_by_name', 'created_by_username'],
  ['purchaser_name', 'purchaser_username'], ['inbound_by_name', 'inbound_by_username', 'created_by_username'],
  ['operator_name', 'operator_username'], ['uploaded_by_name', 'uploaded_by_username'],
  ['reviewer_name', 'reviewer_username'], ['reviewed_by', 'reviewed_username'],
  ['approved_by', 'approved_username'], ['purchaser_approved_by', 'purchaser_approved_username'],
  ['completed_by', 'completed_username', 'completed_by_username', 'applicant_username'],
  ['closed_by_name', 'closed_by_username'], ['withdrawn_by', 'withdrawn_username', 'applicant_username'],
  ['resubmitted_by', 'resubmitted_username'], ['last_modified_by', 'last_modified_username'],
  ['last_information_modified_by', 'last_modified_username'],
];
const recordCollections = [
  'lab_work_requests', 'lab_review_logs', 'lab_materials', 'lab_material_batches',
  'lab_purchase_requests', 'lab_stock_transactions', 'lab_stock_out_requests',
  'lab_expense_records', 'lab_test_processing_units', 'lab_attachments',
];

export function createStudentNameIndex(rows = []) {
  const byUsername = new Map(), byName = new Map();
  for (const row of rows) {
    const username = clean(row.username);
    if (!username || (row.account_type && row.account_type !== 'student')) continue;
    const name = clean(row.display_name) || username;
    const value = { name, label: name + mentorSuffix(row.responsible_teacher_name, row.guiding_teacher_name) };
    byUsername.set(username, value);
    for (const alias of new Set([name, username])) byName.set(alias, byName.has(alias) ? null : value);
  }
  return { byUsername, byName };
}

export function studentNameLabel(name, username, index) {
  const identity = clean(username);
  // A missing historical account must not inherit another account's matching name.
  const value = identity ? index?.byUsername.get(identity) : index?.byName.get(clean(name));
  const originalName = clean(name);
  if (value && originalName && originalName !== value.name && originalName !== identity && !originalName.startsWith(value.name + '（')) return originalName;
  return value?.label || clean(name) || identity;
}

function accountDisplayName(account, index, assumeStudent = false) {
  if (!account || (!assumeStudent && account.account_type !== 'student')) return account?.display_name;
  const profile = account.student_profile;
  const entry = index?.byUsername.get(account.username);
  if (entry) return entry.label;
  let displayName = account.display_name || account.username;
  if (profile) {
    const responsible = clean(profile.responsible_teacher_name), guiding = clean(profile.guiding_teacher_name);
    const rawName = clean(account.display_name) || clean(account.username);
    const suffix = mentorSuffix(responsible, guiding);
    const oldSuffix = `（${responsible}，${guiding}）`;
    displayName = !suffix || rawName.endsWith(suffix) ? rawName
      : rawName.endsWith(oldSuffix) ? rawName.slice(0, -oldSuffix.length) + suffix : rawName + suffix;
  }
  return displayName;
}

export function displayStudentAccount(account, index) {
  const displayName = accountDisplayName(account, index);
  return !account || displayName === account.display_name ? account : { ...account, display_name: displayName };
}

function recordNameChanges(row, index) {
  const changes = [];
  for (const [nameField, ...usernameFields] of identityFields) {
    if (!(nameField in row)) continue;
    const username = usernameFields.map(field => row[field]).find(Boolean);
    const name = studentNameLabel(row[nameField], username, index);
    if (name !== row[nameField]) changes.push([nameField, name]);
  }
  return changes;
}

export function displayStudentComment(row, index) {
  const shown = { ...row,
    author_name: studentNameLabel(row.author_name || row.author_username, row.author_username, index),
    reply_to_name: studentNameLabel(row.reply_to_name || row.reply_to_username, row.reply_to_username, index),
  };
  if (row.deleted_by) shown.deleted_by_name = studentNameLabel(row.deleted_by, row.deleted_by, index);
  return shown;
}

export function sameRows(previous, next) {
  return previous.length === next.length && previous.every((row, position) => row === next[position]) ? previous : next;
}

export function createStudentNameDisplay() {
  let index = createStudentNameIndex(), labelSignature = '', labels = [];
  const collections = new Map(), rawCache = new WeakMap();
  function decorateRows(collection, rows, mode = '') {
    const previous = collections.get(collection) || new Map(), current = new Map();
    const shown = rows.map((row, position) => {
      const key = clean(row._id ?? row.id ?? row.username) || `#${position}`;
      let cached = rawCache.get(row);
      if (!cached) { cached = { text: JSON.stringify(row) }; rawCache.set(row, cached); }
      const changes = mode === 'account' || mode === 'student'
        ? [['display_name', accountDisplayName(row, index, mode === 'student')]].filter(([field, value]) => value !== row[field])
        : mode === 'audit' ? [['operator_name', studentNameLabel(row.operator_username, row.operator_username, index)]] : recordNameChanges(row, index);
      const displaySignature = JSON.stringify(changes);
      const prior = previous.get(key);
      const value = prior?.text === cached.text && prior.displaySignature === displaySignature ? prior.value : changes.length ? { ...row, ...Object.fromEntries(changes) } : row;
      current.set(key, { text: cached.text, displaySignature, value });
      return value;
    });
    collections.set(collection, current);
    return shown;
  }
  return data => {
    if (Array.isArray(data.lab_student_name_labels)) {
      const nextSignature = JSON.stringify(data.lab_student_name_labels);
      if (nextSignature !== labelSignature) { labels = data.lab_student_name_labels; index = createStudentNameIndex(labels); labelSignature = nextSignature; }
    }
    const shown = { ...data };
    for (const collection of recordCollections) if (Array.isArray(data[collection])) shown[collection] = decorateRows(collection, data[collection]);
    for (const collection of ['lab_student_accounts', 'accounts']) if (Array.isArray(data[collection])) {
      shown[collection] = decorateRows(collection, data[collection], collection === 'lab_student_accounts' ? 'student' : 'account');
    }
    if (data.current_account) shown.current_account = displayStudentAccount(data.current_account, index);
    if (Array.isArray(data.audit_logs)) shown.audit_logs = decorateRows('audit_logs', data.audit_logs, 'audit');
    return shown;
  };
}
