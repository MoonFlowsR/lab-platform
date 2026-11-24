import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { apiPost } from '../../app/api.js';
import './login-reminder.css';

export const inventoryReminderTitle = '今天出入库了吗？';

export default function InventoryLoginReminder({ token, onRead, hasProfile }) {
  const dialog = useRef(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  async function acknowledge() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const receipt = await apiPost('inventory-reminder/ack', {}, token, { timeoutMs: 12000 });
      if (!receipt.acknowledged_at) throw new Error('未收到已读记录，请重试。');
    } catch (failure) {
      if (dialog.current) {
        setError(failure.retryable ? '暂时无法确认已读，请再点一次“已读”。' : failure.message);
        setBusy(false);
      }
      sending.current = false;
      return;
    }
    if (!dialog.current) return;
    if (hasProfile && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => flushSync(onRead));
    } else {
      onRead();
    }
  }

  return <main className="inventory-reminder-gate">
    <dialog ref={dialog} className="platform-dialog inventory-reminder-dialog" closedby="none"
      aria-labelledby="inventory-reminder-title" aria-describedby="inventory-reminder-description"
      onCancel={event => event.preventDefault()}>
      <h2 id="inventory-reminder-title" className="inventory-reminder-title">{inventoryReminderTitle}</h2>
      <p id="inventory-reminder-description"><span>物品用完及时出库，</span><span>采购到货及时入库</span></p>
      {error && <p role="alert" className="platform-dialog-error">{error}</p>}
      <div className="platform-dialog-actions"><button type="button" className="is-primary" autoFocus
        disabled={busy} onClick={acknowledge}>{busy ? '正在保存…' : '已读'}</button></div>
    </dialog>
  </main>;
}
