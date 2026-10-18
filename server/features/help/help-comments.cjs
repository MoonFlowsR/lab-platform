const help = require('../../../src/features/help/content.json');
const studentNameLabels = require('../accounts/student-name-labels.cjs');

module.exports = function installHelpComments({ app, db, authMiddleware, addAudit, nowISO, recordChanges }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS help_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES help_comments(id),
      section_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      quote TEXT NOT NULL,
      body TEXT NOT NULL,
      author_username TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      deleted_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_help_comments_section ON help_comments(section_id, id);
    CREATE INDEX IF NOT EXISTS idx_help_comments_parent ON help_comments(parent_id);
    CREATE TABLE IF NOT EXISTS help_comment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL REFERENCES help_comments(id),
      action TEXT NOT NULL,
      operator_username TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const clean = value => String(value ?? '').trim();
  const flatten = value => clean(value).replace(/\s+/gu, '');
  const commentRows = 'SELECT c.*, p.author_username AS reply_to_username FROM help_comments c LEFT JOIN help_comments p ON c.parent_id = p.id';
  const get = id => db.prepare(commentRows + ' WHERE c.id = ?').get(id);
  const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  function active(req, res, next) {
    if (req.account.status !== 'active') return res.status(403).json({ ok: false, message: '账号尚未启用，启用后才能评论。' });
    next();
  }
  function admin(req, res, next) {
    if (req.account.account_type !== 'admin') return res.status(403).json({ ok: false, message: '仅管理员可查看完整评论及操作记录。' });
    next();
  }
  function record(req, action, row, before = null) {
    db.prepare('INSERT INTO help_comment_events (comment_id,action,operator_username,operator_role,snapshot_json,created_at) VALUES (?,?,?,?,?,?)')
      .run(row.id, action, req.account.username, req.account.account_type, JSON.stringify(row), nowISO());
    addAudit(req, req.account, action, 'help_comments', row.id, before, row);
  }
  function handler(fn) {
    return (req, res) => { try { fn(req, res); } catch (error) { res.status(400).json({ ok: false, message: error.message }); } };
  }
  function publicRows() {
    const rows = db.prepare(commentRows + ' ORDER BY c.id').all();
    const byId = new Map(rows.map(row => [row.id, row])), visible = new Set();
    // Keep deleted ancestors as redacted placeholders while any descendant is live.
    for (const row of rows.filter(row => !row.deleted_at)) {
      let ancestor = row;
      while (ancestor && !visible.has(ancestor.id)) { visible.add(ancestor.id); ancestor = byId.get(ancestor.parent_id); }
    }
    return rows.filter(row => visible.has(row.id)).map(row => ({
      id: row.id, parent_id: row.parent_id, section_id: row.section_id, block_id: row.block_id,
      quote: row.quote, body: row.deleted_at ? '' : row.body, author_username: row.author_username,
      author_name: row.author_name, created_at: row.created_at, deleted_at: row.deleted_at, reply_to_username: row.reply_to_username,
    }));
  }
  app.get('/api/help-comments', authMiddleware, active, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, comments: publicRows(), ...(req.account ? { student_name_labels: studentNameLabels(db) } : {}) });
  });
  app.get('/api/help-comments/session', authMiddleware, active, (req, res) => res.json({ ok: true, account: req.account, student_name_labels: studentNameLabels(db) }));
  app.get('/api/help-comments/admin', authMiddleware, active, admin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, comments: db.prepare(commentRows + ' ORDER BY c.id').all(), student_name_labels: studentNameLabels(db) });
  });
  app.get('/api/help-comments/events', authMiddleware, active, admin, handler((req, res) => {
    const before = req.query.before ? Number(req.query.before) : Number.MAX_SAFE_INTEGER;
    if (!validId(before)) throw new Error('分页参数无效。');
    const rows = db.prepare('SELECT * FROM help_comment_events WHERE id < ? ORDER BY id DESC LIMIT 51').all(before);
    const events = rows.slice(0, 50).map(({ snapshot_json, ...row }) => ({ ...row, comment: JSON.parse(snapshot_json) }));
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, events, has_more: rows.length > 50, next_cursor: events.at(-1)?.id || null });
  }));
  app.post('/api/help-comments', authMiddleware, active, handler((req, res) => {
    const body = clean(req.body.body);
    if (!body || body.length > 2000) throw new Error('评论内容须为 1 至 2000 个字符。');
    const hasParent = req.body.parent_id != null && req.body.parent_id !== '';
    const row = db.transaction(() => {
      let parent = null, sectionId, blockId, quote;
      if (hasParent) {
        if (!validId(req.body.parent_id)) throw new Error('回复对象无效。');
        parent = get(Number(req.body.parent_id));
        if (!parent || parent.deleted_at) throw new Error('回复对象已删除或不存在，不能继续回复。');
        ({ section_id: sectionId, block_id: blockId, quote } = parent);
      } else if (req.body.kind === 'message') {
        sectionId = 'general'; blockId = ''; quote = '';
      } else {
        sectionId = clean(req.body.section_id); blockId = clean(req.body.block_id); quote = clean(req.body.quote);
        const section = help.sections.find(item => item.id === sectionId);
        if (!section || !quote || quote.length > 1000) throw new Error('请从帮助正文选择 1 至 1000 个字符。');
        const index = Number(blockId.slice(sectionId.length + 1));
        if (blockId !== `${sectionId}-title` && (blockId !== `${sectionId}-${index}` || !Number.isInteger(index) || index < 0 || index >= section.blocks.length)) throw new Error('评论位置无效，请重新选择正文。');
        const text = [section.title, ...section.blocks.flatMap(block => block.type === 'steps' ? block.items : block.type === 'table' ? [...block.headers, ...block.rows.flat()] : [block.text])].join('\n');
        if (!flatten(text).includes(flatten(quote))) throw new Error('所选文字已发生变化，请刷新帮助后重新选择。');
      }
      const inserted = db.prepare('INSERT INTO help_comments (parent_id,section_id,block_id,quote,body,author_username,author_name,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(parent?.id || null, sectionId, blockId, quote, body, req.account.username, req.account.display_name || req.account.username, nowISO());
      const result = get(Number(inserted.lastInsertRowid));
      record(req, sectionId === 'general' ? (parent ? 'replyHelpMessage' : 'createHelpMessage') : (parent ? 'replyHelpComment' : 'createHelpComment'), result);
      return result;
    })();
    recordChanges.notify();
    res.status(201).json({ ok: true, comment: row });
  }));
  app.delete('/api/help-comments/:id', authMiddleware, active, handler((req, res) => {
    if (!validId(req.params.id)) throw new Error('评论编号无效。');
    const row = db.transaction(() => {
      const before = get(Number(req.params.id));
      if (!before || before.deleted_at) throw new Error('评论已删除或不存在。');
      if (before.author_username !== req.account.username && req.account.account_type !== 'admin') throw new Error('只能删除本人发表的评论或回复。');
      db.prepare('UPDATE help_comments SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL').run(nowISO(), req.account.username, before.id);
      const after = get(before.id);
      record(req, before.section_id === 'general' ? 'deleteHelpMessage' : 'deleteHelpComment', after, before);
      return after;
    })();
    recordChanges.notify();
    res.json({ ok: true, id: row.id });
  }));
};
