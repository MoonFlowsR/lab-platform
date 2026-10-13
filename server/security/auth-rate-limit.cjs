const { isIP } = require('node:net');
const { createHash } = require('node:crypto');

// Failed authentication attempts only. Successful sign-ins and registrations do not consume a quota.
module.exports = function createAuthRateLimit({ clock = Date.now, windowMs = 5 * 60 * 1000, ipLimit = 60, accountLimit = 12, maxBuckets = 10000, trustedProxies = process.env.AUTH_TRUSTED_PROXY_IPS ?? '127.0.0.1,::1' } = {}) {
  const buckets = new Map();
  let nextSweep = 0;
  const normalizeIP = value => {
    let ip = String(value || '').trim().toLowerCase();
    if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
    if (!isIP(ip)) return '';
    return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
  };
  const configured = String(trustedProxies).split(',').map(ip => ip.trim()).filter(Boolean);
  if (configured.some(ip => !normalizeIP(ip))) throw new Error('AUTH_TRUSTED_PROXY_IPS 只接受明确的IP地址。');
  const trusted = new Set(configured.map(normalizeIP));
  const action = req => ({ '/api/auth/login':'login', '/api/auth/register':'register' })[String(req.path || '').toLowerCase().replace(/\/+$/, '')];
  function clientIP(req) {
    const peer = normalizeIP(req.socket?.remoteAddress) || 'unknown';
    if (!trusted.has(peer)) return peer;
    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    // The nearest trusted proxy must append or overwrite this header; never accept the client-supplied leftmost hop.
    return normalizeIP(forwarded.slice(forwarded.lastIndexOf(',') + 1)) || peer;
  }
  function reserve(key, limit, res, next) {
    const now = clock();
    if (now >= nextSweep) {
      for (const [id, bucket] of buckets) if (!bucket.pending && now >= bucket.expires) buckets.delete(id);
      nextSweep = now + 60000;
    }
    let bucket = buckets.get(key);
    if (bucket && now >= bucket.expires && !bucket.pending) { buckets.delete(key); bucket = null; }
    if (!bucket) {
      while (buckets.size >= maxBuckets) buckets.delete(buckets.keys().next().value);
      bucket = { failures:0, pending:0, expires:now + windowMs }; buckets.set(key, bucket);
    }
    if (bucket.failures + bucket.pending >= limit) {
      const seconds = Math.max(1, Math.ceil((bucket.expires - now) / 1000));
      res.setHeader('Retry-After', String(seconds));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(429).json({ ok:false, code:'AUTH_RATE_LIMITED', message:`尝试过于频繁，请在${seconds}秒后重试。` });
    }
    bucket.pending++;
    let settled = false;
    function settle(completed) {
      if (settled) return; settled = true; bucket.pending--;
      if (!completed || (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429)) bucket.failures++;
      if (!bucket.pending && !bucket.failures && buckets.get(key) === bucket) buckets.delete(key);
    }
    res.once('finish', () => settle(true));
    res.once('close', () => settle(false));
    return next();
  }
  function byIp(req, res, next) {
    if (req.method !== 'POST' || !action(req)) return next();
    return reserve('ip:' + clientIP(req), ipLimit, res, next);
  }
  function byAccount(req, res, next) {
    const route = action(req);
    if (!route) return next();
    const name = String(req.body?.username || '').slice(0, 128).trim().normalize('NFKC');
    const key = createHash('sha256').update(clientIP(req) + '\0' + name).digest('hex');
    return reserve('account:' + route + ':' + key, accountLimit, res, next);
  }
  return { byIp, byAccount };
};
