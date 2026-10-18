export function applyDelta(snapshot, delta) {
  const next = {...snapshot,...delta.fields};
  for (const key of delta.removeFields || []) delete next[key];
  for (const [key, patch] of Object.entries(delta.collections || {})) {
    const rows = new Map((snapshot[key] || []).map(row => [String(row._id ?? row.id ?? row.username),row]));
    for (const id of patch.remove) rows.delete(id);
    for (const row of patch.upsert) rows.set(String(row._id ?? row.id ?? row.username),row);
    next[key] = patch.order.map(id => rows.get(id)).filter(Boolean);
  }
  return next;
}
export function createSyncController({ fetchSnapshot, applySnapshot, onBusy = () => {}, onStart = () => {}, onSuccess = () => {}, onError = () => {} }) {
  let active = null, queued = false, queuedVisible = false, disposed = false, revision = '', snapshot = {};
  const controller = new AbortController();
  async function run(background) {
    onBusy(true);
    try {
      do {
        queued = false; queuedVisible = false;
        if (!background) onStart();
        try {
          const response = await fetchSnapshot({ known_revision: revision, signal: controller.signal });
          if (disposed) return;
          if (!response.unchanged) {
            if (response.delta && response.base_revision !== revision) throw new Error('同步版本已变化，请重试。');
            snapshot = response.delta ? applyDelta(snapshot,response.delta) : response.data || {};
            applySnapshot(snapshot);
          }
          revision = response.revision || '';
          onSuccess(background);
        } catch (error) { if (!disposed) onError(error); queued = false; }
        background = !queuedVisible;
      } while (queued && !disposed);
    } finally { active = null; if (!disposed) onBusy(false); }
  }
  return {
    request({ background = false, force = true } = {}) {
      if (disposed) return Promise.resolve();
      if (active) { if (force) { queued = true; queuedVisible ||= !background; } return active; }
      // Set the promise before callbacks can request another synchronization.
      active = Promise.resolve().then(() => run(background)); return active;
    },
    dispose() { disposed = true; queued = false; controller.abort(); },
  };
}
