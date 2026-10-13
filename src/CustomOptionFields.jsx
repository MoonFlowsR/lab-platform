import { useEffect, useState } from 'react';
import { uniqueOptions } from './dropdown-normalize.js';

const otherValue = '__custom_option__';

export default function CustomOptionFields({ value, onChange, options = [], label, customLabel, placeholder, customPlaceholder, required = false, maxLength = 200, Field, SearchableSelect, styles }) {
  const choices = uniqueOptions(options).filter(option => !['其它', '其他', otherValue].includes(option));
  const [custom, setCustom] = useState(() => Boolean(value && !choices.includes(value)));
  useEffect(() => {
    if (!custom && value && !choices.includes(value)) setCustom(true);
  }, [custom, value, choices]);
  return <div className="platform-initialization-cell">
    <Field required={required} label={label}><SearchableSelect required={required} clearOnInput={false}
      value={custom ? otherValue : value} onChange={next => {
        setCustom(next === otherValue); onChange(next === otherValue ? '' : next);
      }} options={[...choices, { value: otherValue, label: '其它' }]} lastOptions={[otherValue]} placeholder={placeholder} /></Field>
    {custom && <Field required={required} label={customLabel}><input required={required} maxLength={maxLength}
      style={styles.input} value={value} onChange={event => onChange(event.target.value)} placeholder={customPlaceholder} /></Field>}
  </div>;
}
