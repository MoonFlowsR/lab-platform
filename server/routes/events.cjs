module.exports = function installEvents(context) {
const { app, authMiddleware, recordChanges } = context;
app.get("/api/events", authMiddleware, recordChanges.connect);
};
