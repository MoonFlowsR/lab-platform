import { clientHeaders } from './client-platform.js';
export async function requestJson(url, data = {}, token = '', { signal, timeoutMs = 0, fetcher = fetch } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = timeoutMs ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
  try {
    const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...clientHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data), signal: controller.signal });
    if (!response.ok) {
      let details; try { details = await response.json(); } catch { /* Gateway responses can be HTML. */ }
      const error = new Error(details?.message || ([502, 503, 504].includes(response.status) ? `连接暂时中断（${response.status}），请稍后重试。` : `请求失败：${response.status}`));
      error.status = response.status; error.code = details?.code; error.retryable = [502, 503, 504].includes(response.status); throw error;
    }
    let result;
    try { result = await response.json(); } catch {
      const error = new Error('返回的数据不完整或被网络替换，请稍后重试。'); error.retryable = true; throw error;
    }
    if (!result?.ok) { const error = new Error(result?.message || '未收到有效的数据响应，请稍后重试。'); error.retryable = !result?.message; throw error; }
    return result;
  } catch (error) {
    if (timedOut) { const failure = new Error('连接超时，已有数据保留，将自动重试。'); failure.retryable = true; throw failure; }
    throw error;
  } finally { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
