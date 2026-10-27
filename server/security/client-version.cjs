// An optional compatibility floor; this identifies old clients without granting permissions.
const message = '平台已更新，请刷新页面后重新登录。';

function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 50) return null;
  const text = value.trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text)) return null;
  const parts = text.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? { text, parts } : null;
}

module.exports = function createClientVersion({ minimum = process.env.PLATFORM_MIN_CLIENT_VERSION || '' } = {}) {
  const enabled = String(minimum).trim() !== '';
  const floor = parseVersion(minimum);
  if (enabled && !floor) throw new Error('PLATFORM_MIN_CLIENT_VERSION 须为三段数字版本号，例如 2.6.0。');
  function accepts(value) {
    if (!enabled) return true;
    const candidate = parseVersion(value);
    if (!candidate) return false;
    for (let index = 0; index < 3; index++) {
      if (candidate.parts[index] !== floor.parts[index]) return candidate.parts[index] > floor.parts[index];
    }
    return true;
  }
  function requestVersion(req) {
    return parseVersion(req.headers['x-platform-ui-version'])?.text;
  }
  function requireCurrent(req, res, next) {
    if (!accepts(requestVersion(req))) return res.status(409).json({ ok: false, code: 'CLIENT_UPDATE_REQUIRED', message });
    next();
  }
  return {
    minimum: floor?.text || '', accepts, requestVersion,
    requireCurrent,
    authentication(req, res, next) {
      if (!enabled || req.method !== 'POST' || !/^\/api\/auth\/(login|register)\/?$/i.test(req.path)) return next();
      return requireCurrent(req, res, next);
    },
    assertToken(token) {
      if (!accepts(token.client_version)) {
        const error = new Error(message);
        error.code = 'CLIENT_UPDATE_REQUIRED';
        throw error;
      }
    },
  };
};
module.exports.parseVersion = parseVersion;
