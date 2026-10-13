module.exports = function installOperations(context) {
const { app, asyncHandler, authMiddleware } = context;
const handlers = Object.assign({}, require('../services/operations/records.cjs')(context), require('../services/operations/admin.cjs')(context), require('../services/operations/work.cjs')(context), require('../services/operations/stock.cjs')(context), require('../services/operations/inventory.cjs')(context), require('../services/operations/purchase.cjs')(context));
const orderedHandlers = [handlers.operation0, handlers.operation1, handlers.operation2, handlers.operation3, handlers.operation4, handlers.operation5, handlers.operation6, handlers.operation7, handlers.operation8, handlers.operation9, handlers.operation10, handlers.operation11, handlers.operation12, handlers.operation13, handlers.operation14, handlers.operation15, handlers.operation16, handlers.operation17, handlers.operation18, handlers.operation19, handlers.operation20, handlers.operation21, handlers.operation22, handlers.operation23, handlers.operation24, handlers.operation25];
app.post("/api/ops/:action", authMiddleware, asyncHandler(async (req, res) => {
  const action = req.params.action;
  const payload = { ...(req.body || {}) };
  delete payload.storage_photo_attachment_id;
  const account = req.account;

  for (const handler of orderedHandlers) {
    const result = handler(req, res, action, payload, account);
    if (result !== undefined) return result;
  }

  throw new Error("未知业务操作。");
}));
};
