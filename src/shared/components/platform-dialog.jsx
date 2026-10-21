import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import './platform-dialog.css';
import { formatPublicNumbers } from '../lib/public-number.js';

const queue = [], listeners = new Set();
let sequence = 0;
const notify = () => listeners.forEach(listener => listener());
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => queue[0] || null;
const requestDialog = options => new Promise(resolve => { queue.push({ ...options, id: ++sequence, resolve }); notify(); });
function finish(request, result) {
  if (queue[0] !== request) return;
  queue.shift(); request.resolve(result); notify();
}
export const showAlert = (message, options = {}) => requestDialog({ kind: 'alert', title: '提示', tone: 'error', message: String(message), ...options });
export const showConfirm = (message, options = {}) => requestDialog({ kind: 'confirm', title: '操作确认', message: String(message), danger: /删除|停用|重置/.test(String(message)), ...options });
export const showForm = options => requestDialog({ kind: 'form', ...options });
export async function showPrompt(message, defaultValue = '', options = {}) {
  const result = await showForm({ title: '填写信息', ...options, fields: [{ name: 'value', label: message, value: defaultValue, required: /必填/.test(message), multiline: options.multiline, ...options.field }] });
  return result === null ? null : result.value;
}

function DialogMessage({ message }) {
  return formatPublicNumbers(String(message || '')).split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line.split(/(必填|至少\s*6\s*位|永久删除|无法在平台中撤销|所有用户均不可再查看|123456|“[^”]+”|[A-Z]+-(?:\d{8}|\d{6})-\d+)/g).map((part, partIndex) => /^(必填|至少|永久删除|无法|所有用户|123456)/.test(part) ? <strong className="platform-dialog-critical" key={partIndex}>{part}</strong> : /^(“|[A-Z]+-\d)/.test(part) ? <strong key={partIndex}>{part}</strong> : part)}</p>);
}

function DialogContents({ request, dialogRef }) {
  const titleId = useId(), descriptionId = useId(), fields = request.fields || [];
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.name, String(field.value ?? '')])));
  const [error, setError] = useState('');
  const cancel = () => finish(request, request.kind === 'confirm' ? false : null);
  useEffect(() => {
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    const initialFocus = request.kind === 'form' ? dialog.querySelector('input,textarea') : dialog.querySelector(request.danger ? '[data-dialog-cancel]' : 'button[type="submit"]');
    initialFocus?.focus();
    return () => { if (dialog.open) dialog.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [request, dialogRef]);

  function submit(event) {
    event.preventDefault();
    for (const field of fields) {
      if (field.required && !values[field.name]?.trim()) { setError(`请填写${field.label.replace(/（.*?）/g, '').replace(/^(请输入|请填写)/, '').replace(/[：:]$/, '')}。`); return; }
      if (field.type === 'number' && values[field.name]?.trim()) {
        const number = Number(values[field.name]);
        if (!Number.isFinite(number) || (field.min !== undefined && number < field.min)) { setError(`${field.label}须为不小于 ${field.min ?? 0} 的数字。`); return; }
      }
    }
    const problem = request.validate?.(values);
    if (problem) { setError(problem); return; }
    finish(request, request.kind === 'form' ? values : true);
  }
  return <dialog ref={dialogRef} className="platform-dialog" aria-labelledby={titleId} aria-describedby={request.message ? descriptionId : undefined} onCancel={event => { event.preventDefault(); cancel(); }}>
    <form noValidate onSubmit={submit}>
      <div className="platform-dialog-header"><h2 id={titleId}>{request.title}</h2><button className="platform-dialog-close" type="button" aria-label="关闭弹窗" onClick={cancel}>×</button></div>
      {request.message && <div id={descriptionId} className={`platform-dialog-message${request.kind === 'alert' ? ` is-${request.tone}` : ''}`}><DialogMessage message={request.message} /></div>}
      {!!request.details?.length && <dl className="platform-dialog-details">{request.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd><strong>{formatPublicNumbers(detail.value) || '—'}</strong></dd></div>)}</dl>}
      {!!fields.length && <div className="platform-dialog-fields">{fields.map((field, index) => <label key={field.name} className={field.wide ? 'is-wide' : undefined}>
        <span><strong>{field.label.replace(/（必填）/g, '')}</strong>{field.required && <strong className="platform-dialog-critical">（必填）</strong>}</span>
        {field.render ? field.render({ value: values[field.name], onChange: value => { setValues(old => ({ ...old, [field.name]: value })); setError(''); } }) : field.multiline ? <textarea autoFocus={index === 0} required={field.required} rows={4} maxLength={field.maxLength || 2000} value={values[field.name]} onChange={event => { setValues(old => ({ ...old, [field.name]: event.target.value })); setError(''); }} placeholder={field.placeholder || '请填写'} /> : <input autoFocus={index === 0} required={field.required} type={field.type || 'text'} min={field.min} maxLength={field.maxLength} step={field.type === 'number' ? 'any' : undefined} autoComplete={field.autoComplete || 'off'} value={values[field.name]} onChange={event => { setValues(old => ({ ...old, [field.name]: event.target.value })); setError(''); }} placeholder={field.placeholder || '请填写'} />}
        {field.hint && <small>{field.hint}</small>}
      </label>)}</div>}
      {error && <p className="platform-dialog-error" role="alert">{error}</p>}
      <div className="platform-dialog-actions">
        {request.kind !== 'alert' && <button type="button" data-dialog-cancel autoFocus={request.kind === 'confirm' && request.danger} onClick={cancel}>取消</button>}
        <button type="submit" className={request.danger ? 'is-danger' : 'is-primary'} autoFocus={request.kind === 'alert' || (request.kind === 'confirm' && !request.danger)}>{request.confirmText || (request.kind === 'alert' ? '知道了' : '确认')}</button>
      </div>
    </form>
  </dialog>;
}

export default function PlatformDialogHost() {
  const request = useSyncExternalStore(subscribe, snapshot), dialogRef = useRef(null);
  return request ? <DialogContents key={request.id} request={request} dialogRef={dialogRef} /> : null;
}
