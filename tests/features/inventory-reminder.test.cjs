const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createInventoryReminder } = require('../../server/features/inventory/login-reminder.cjs');

test('each student login can record exactly one receipt and its audit commits with it', () => {
  const db = new Database(':memory:');
  try {
    let audits = 0, failAudit = false;
    const reminder = createInventoryReminder({
      db, nowISO: () => new Date().toISOString(),
      addAudit() { if (failAudit) throw Error('audit unavailable'); audits++; },
    });
    const account = { _id: '1', username: 'student-a', display_name: '示例学生', account_type: 'student' };
    assert.equal(reminder.required(account, undefined), false);
    assert.equal(reminder.required(account, 'first'), true);
    failAudit = true;
    assert.throws(() => reminder.acknowledge({ account }, 'first'), /audit unavailable/);
    assert.equal(reminder.history().total, 0);
    assert.equal(reminder.required(account, 'first'), true);
    failAudit = false;
    const first = reminder.acknowledge({ account }, 'first');
    assert.equal(first.created, true);
    assert.deepEqual(reminder.acknowledge({ account }, 'first'), { ...first, created: false });
    assert.equal(reminder.required(account, 'first'), false);
    assert.equal(reminder.required(account, 'second'), true);
    assert.equal(audits, 1);
    assert.deepEqual(Object.keys(reminder.history().rows[0]).sort(), ['acknowledged_at', 'id', 'student_name', 'username']);
  } finally { db.close(); }
});

test('history preserves older pages when a new receipt arrives and can match a student or Beijing date', () => {
  const db = new Database(':memory:');
  try {
    const reminder = createInventoryReminder({ db, nowISO: () => '2026-11-24T16:30:00.000Z', addAudit() {} });
    const students = ['示例甲', '示例乙'].map((name, i) => ({ _id: String(i+1), username: 'student-'+i, display_name: name, account_type: 'student' }));
    for (let i = 0; i < 12; i++) reminder.acknowledge({ account: students[i % 2] }, 'session-' + i);
    assert.equal(reminder.history().rows.length, 1);
    assert.equal(reminder.history({ query: '示例乙' }).total, 6);
    assert.equal(reminder.history({ query: '2026-11-25' }).total, 12);
    const first = reminder.history({ expanded: true });
    assert.equal(first.has_more, true);
    const cursor = first.rows.at(-1).id;
    reminder.acknowledge({ account: students[0] }, 'later');
    const last = reminder.history({ expanded: true, before: cursor });
    assert.deepEqual(last.rows.map(row => row.id), [2,1]);
    assert.equal(last.has_more, false);
    assert.equal(last.total, 13);
  } finally { db.close(); }
});
