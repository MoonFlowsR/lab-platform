import { Children } from 'react';
export default function RecordActions({ children, dangerous, compact = false }) {
  const regular = Children.toArray(children);
  if (!regular.length && !dangerous) return null;
  return <div className={`platform-record-actions${compact ? ' is-compact' : ''}`}>
    {regular.length > 0 && <div className="platform-regular-actions">{regular}</div>}
    {dangerous && <div className="platform-danger-actions" role="group" aria-label="删除或隐藏操作">{dangerous}</div>}
  </div>;
}
