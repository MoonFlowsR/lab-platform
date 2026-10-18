const uploadPaths = new Set(['/api/attachments/uploadjson', '/api/attachments/uploaddraftjson']);

module.exports = function createRequestJson(express) {
  function boundedParser(limit) {
    const parse = express.json({ limit });
    return (req, res, next) => parse(req, res, error => {
      if (!error) return next();
      if (error.type === 'entity.too.large') {
        return res.status(413).json({ ok: false, message: '请求内容过大，请减少数据或附件大小。' });
      }
      if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ ok: false, message: 'JSON 请求格式无效。' });
      }
      // Preserve body-parser's client errors without exposing the request contents.
      if (error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ ok: false, message: '请求内容无法解析。' });
      }
      return next(error);
    });
  }
  const ordinary = boundedParser('1mb');
  return {
    ordinary(req, res, next) {
      // Match Express's case-insensitive, optional-trailing-slash upload routes.
      const requestPath = String(req.path || '').toLowerCase().replace(/\/+$/, '');
      if (req.method === 'POST' && uploadPaths.has(requestPath)) return next();
      return ordinary(req, res, next);
    },
    // 20 MiB of decoded bytes need about 27 MiB of base64 plus JSON metadata.
    // Install this only after authMiddleware on the two JSON upload routes.
    attachment: boundedParser('28mb'),
  };
};
