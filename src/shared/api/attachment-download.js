const CHUNK_SIZE = 1024 * 1024;

async function downloadError(response) {
  const error = await response.json().catch(() => ({}));
  const failure = new Error(error.message || (response.status === 502
    ? "附件下载服务暂时不可用（502），请确认平台本地服务和外网隧道正在运行。"
    : `附件下载失败：${response.status}`));
  failure.retryable = [502, 503, 504].includes(response.status);
  return failure;
}

// Keep each tunnel request small while preserving authentication and byte order.
export async function downloadAttachmentBlob(url, size, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const total = Number(size);
  if (!Number.isSafeInteger(total) || total <= 4 * CHUNK_SIZE) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw await downloadError(response);
    return response.blob();
  }

  async function readChunk(start) {
    const end = Math.min(total - 1, start + CHUNK_SIZE - 1);
    const response = await fetch(url, { headers: { ...headers, Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw await downloadError(response);
    // Older proxies may ignore Range. Only the first response may be a full file.
    if (start === 0 && response.status === 200) {
      const blob = await response.blob();
      if (blob.size !== total) throw new Error("附件下载不完整，请重试。");
      return { blob, complete: true };
    }
    if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end}/${total}`) {
      throw new Error("附件分段响应异常，请重试。");
    }
    const blob = await response.blob();
    if (blob.size !== end - start + 1) throw new Error("附件下载不完整，请重试。");
    return { blob, complete: false };
  }

  async function chunk(start) {
    for (let attempt = 0; ; attempt++) {
      try { return await readChunk(start); } catch (error) {
        const transient = error.retryable || ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
        if (!transient || attempt >= 2) throw error;
      }
    }
  }

  const first = await chunk(0);
  if (first.complete) return first.blob;
  const parts = [first.blob];
  for (let start = CHUNK_SIZE; start < total; start += 3 * CHUNK_SIZE) {
    const offsets = [start, start + CHUNK_SIZE, start + 2 * CHUNK_SIZE].filter(value => value < total);
    const group = await Promise.all(offsets.map(chunk));
    parts.push(...group.map(result => result.blob));
  }
  return new Blob(parts, { type: first.blob.type || "application/octet-stream" });
}
