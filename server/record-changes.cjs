module.exports = function createRecordChanges() {
  const clients = new Map();
  function connect(req, res) {
    res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'private, no-store', 'X-Accel-Buffering':'no' });
    res.flushHeaders(); res.write(': connected\n\n');
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25000);
    const cleanup = () => { clients.delete(res); clearInterval(heartbeat); };
    clients.set(res, { accountId:String(req.account?._id || req.account?.id || ''), cleanup });
    res.once('close', cleanup); res.once('error', cleanup);
  }
  function disconnectAccount(id) {
    for (const [res, client] of clients) if (client.accountId === String(id)) {
      client.cleanup();
      // Older pages understand records-changed and will refresh into the same 401 logout path.
      if (!res.destroyed && !res.writableEnded) res.end('event: records-changed\ndata: {}\n\nevent: session-expired\ndata: {}\n\n');
    }
  }
  return { connect, disconnectAccount, notify:() => { for (const res of clients.keys()) if (!res.destroyed && !res.writableEnded) res.write('event: records-changed\ndata: {}\n\n'); } };
};
