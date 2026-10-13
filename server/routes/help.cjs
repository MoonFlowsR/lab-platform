module.exports = function installHelp(context) {
const { addAudit, app, authMiddleware, db, nowISO, recordChanges } = context;
require('../help-comments.cjs')({ app, db, authMiddleware, addAudit, nowISO, recordChanges });
};
