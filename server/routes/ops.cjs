module.exports = function installOperations(context) {
  const { app, asyncHandler, authMiddleware } = context;
  const handlers = Object.assign({}, ...['records', 'admin', 'work', 'stock', 'inventory', 'purchase'].map(name => require('../services/operations/' + name + '.cjs')(context)));
  for (const action of ['reviewStockOutRequest', 'completeStockOutRequest', 'withdrawStockOutRequest']) handlers[action] = handlers.stockOutRequestAction;
  delete handlers.stockOutRequestAction;
  const handover = require("../features/stock/approval-handover.cjs")(context);
  handlers.adminTransferStockApprover = (req,res,action,payload,account) => handover(req,res,payload,account);
  const auditQuery = require("../queries/audit.cjs")(context);
  handlers.listAudit = (req,res,action,payload,account) => auditQuery(req,res,payload,account);
  app.post('/api/ops/:action', authMiddleware, asyncHandler(async (req, res) => {
    const action = req.params.action;
    const payload = { ...(req.body || {}) };
    delete payload.storage_photo_attachment_id;
    if (!Object.hasOwn(handlers, action)) throw new Error('未知业务操作。');
    return handlers[action](req, res, action, payload, req.account);
  }));
};
