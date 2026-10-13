module.exports = function installHealth(context) {
const { app } = context;
app.get("/api/health", (req, res) => res.json({ ok: true, service: "lab-platform" }));
};
