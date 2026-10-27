import { platformSettings } from '../lib/platform-settings.js';
import { SavedOptionsContext } from '../lib/saved-options-context.js';
import { useContext, useState } from 'react';

export default function StorageFields({ form, onChange, Field, SearchableSelect, styles, compactDescription = false, groupRoom = false }) {
  const { storageRooms } = useContext(SavedOptionsContext);
  const [custom, setCustom] = useState(() => Boolean(form.storage_room && !storageRooms.includes(form.storage_room)));
  function set(patch) {
    const next = { ...form, ...patch };
    onChange({ ...patch, storage_location: [next.storage_room, next.storage_detail].filter(Boolean).join(" · ") });
  }
  const roomFields = <>
    <Field required label="存放房间"><SearchableSelect searchable={false} required clearOnInput={false}
      fixedOptions={platformSettings.rooms}
      lastOptions={['__other_room__']}
      value={custom ? '__other_room__' : form.storage_room} placeholder="选择存放房间或“其它”"
      options={[...storageRooms, { value: '__other_room__', label: '其它' }]} onChange={value => {
        setCustom(value === '__other_room__'); set({ storage_room: value === '__other_room__' ? '' : value });
      }} /></Field>
    {custom && <Field required label="其它存放房间"><input required maxLength={100} style={styles.input}
      value={form.storage_room} onChange={event => set({ storage_room: event.target.value })} placeholder="请填写存放房间" /></Field>}
  </>;
  const hint = '如柜号、上/下层、左右侧';
  const descriptionProps = { required: true, maxLength: 500, value: form.storage_detail || '', onChange: event => set({ storage_detail: event.target.value }), placeholder: hint, title: hint };
  return <>
    {groupRoom ? <div className="platform-initialization-cell">{roomFields}</div> : roomFields}
    <Field required wide={!groupRoom} label="具体位置简述">{compactDescription
      ? <input style={styles.input} {...descriptionProps} />
      : <textarea rows={3} style={{ ...styles.textarea, minHeight: 104, height: 104 }} {...descriptionProps} />}</Field>
  </>;
}
