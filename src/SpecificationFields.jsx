import { useEffect, useState } from 'react';
import { uniqueOptions } from './dropdown-normalize.js';

export default function SpecificationFields({ value, onChange, options = [], Field, SearchableSelect, styles }) {
  const choices = uniqueOptions(options).filter(option => !['无', '其它', '其他'].includes(option));
  if (!choices.length) choices.push('无');
  const [custom, setCustom] = useState(() => Boolean(value && value !== '无' && !choices.includes(value)));
  useEffect(() => {
    if (!custom && value === '无' && !choices.includes('无')) onChange(choices.length === 1 ? choices[0] : '');
  }, [custom, value, choices, onChange]);
  return <>
    <Field required label="规格 / 型号"><SearchableSelect required clearOnInput={false}
      value={custom ? '__other_spec__' : value} options={[...choices, { value: '__other_spec__', label: '其它' }]} lastOptions={['__other_spec__']}
      placeholder="搜索或选择规格 / 型号" onChange={next => {
        setCustom(next === '__other_spec__'); onChange(next === '__other_spec__' ? '' : next);
      }} /></Field>
    {custom && <Field required label="其它规格 / 型号"><input required maxLength={200} style={styles.input}
      value={value} onChange={event => onChange(event.target.value)} placeholder="请填写具体规格 / 型号" /></Field>}
  </>;
}
