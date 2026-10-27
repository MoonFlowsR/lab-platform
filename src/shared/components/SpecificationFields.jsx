import { useState } from 'react';
import { uniqueOptions } from '../lib/dropdown-normalize.js';

export default function SpecificationFields({ value, onChange, options = [], Field, SearchableSelect, styles }) {
  const choices = uniqueOptions(options).filter(option => !['无', '其它', '其他'].includes(option));
  if (!choices.length || value === '无') choices.push('无');
  const [custom, setCustom] = useState(() => Boolean(value && value !== '无' && !choices.includes(value)));
  return <>
    <Field required label="规格 / 型号"><SearchableSelect required clearOnInput={false}
      value={custom ? '__other_spec__' : value} options={[...choices, { value: '__other_spec__', label: '其它' }]} lastOptions={['__other_spec__']}
      placeholder="选择规格或搜索“其它”" onChange={next => {
        setCustom(next === '__other_spec__'); onChange(next === '__other_spec__' ? '' : next);
      }} /></Field>
    {custom && <Field required label="其它规格 / 型号"><input required maxLength={200} style={styles.input}
      value={value} onChange={event => onChange(event.target.value)} placeholder="请填写具体规格 / 型号" /></Field>}
  </>;
}
