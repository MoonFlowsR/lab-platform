const crypto = require('node:crypto'), zlib = require('node:zlib'), { promisify } = require('node:util');
const gzip = promisify(zlib.gzip);
module.exports = function createSyncResponse({ db, listAll }) {
  const epoch = crypto.randomUUID(), changes = db.prepare('SELECT total_changes() AS count');
  const cache = new Map(); let cachedVersion = '', cachedBytes = 0;
  return async function respond(req, res, account, payload = {}) {
    const version = `${epoch}:${changes.get().count}:${db.pragma('data_version', { simple: true })}`;
    const key = `${account.username}:${account.account_type}`;
    const revision = `${version}:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    res.set({ 'Cache-Control': 'private, no-store', Vary: 'Accept-Encoding', 'Content-Type': 'application/json; charset=utf-8' });
    if (payload.known_revision === revision) return res.json({ ok: true, unchanged: true, revision });
    if (cachedVersion !== version) { cache.clear(); cachedBytes = 0; cachedVersion = version; }
    let entry = cache.get(key);
    if (!entry) {
      entry = { body: Buffer.from(JSON.stringify({ ok: true, revision, data: listAll(account) })) };
      while (cache.size && (cache.size >= 16 || cachedBytes + entry.body.length > 16 * 1024 * 1024)) { const oldest = cache.keys().next().value; cachedBytes -= cache.get(oldest).body.length; cache.delete(oldest); }
      if (entry.body.length <= 16 * 1024 * 1024) { cache.set(key, entry); cachedBytes += entry.body.length; }
    }
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;\s*q=(?!0(?:\s*(?:,|$)|\.0+\s*(?:,|$)))[\d.]+)?\s*(?:,|$)/i.test(req.get('Accept-Encoding') || '');
    if (acceptsGzip && entry.body.length >= 1024) {
      entry.compressed ||= gzip(entry.body, { level: zlib.constants.Z_BEST_SPEED });
      const compressed = await entry.compressed;
      res.set('Content-Encoding', 'gzip'); res.set('Content-Length', String(compressed.length)); return res.end(compressed);
    }
    res.set('Content-Length', String(entry.body.length)); return res.end(entry.body);
  };
};
