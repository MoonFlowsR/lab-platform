export function createSyncController({ fetchSnapshot, applySnapshot, onBusy = () => {}, onStart = () => {}, onSuccess = () => {}, onError = () => {} }) {
  let active = null, queued = false, queuedVisible = false, disposed = false, revision = '';
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
          if (!response.unchanged) applySnapshot(response.data || {});
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
