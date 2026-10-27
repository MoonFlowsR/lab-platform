const longTermValue = '长期';

export default function ExpiryDateField({ value, onChange, Field, DateInput, styles }) {
  return <div className="platform-expiry-field" style={{ display: 'grid', gap: 6, minWidth: 0 }}>
    <Field required label="有效期">{value === longTermValue
      ? <input required readOnly value={longTermValue} style={styles.input} />
      : <DateInput required value={value} onChange={onChange} />}</Field>
    <label style={{ ...styles.checkboxRow, alignItems: 'center', minHeight: 30, cursor: 'pointer' }}>
      <input type="checkbox" checked={value === longTermValue}
        style={{ width: 16, height: 16, minHeight: 16, margin: 0, accentColor: 'var(--accent)', flexShrink: 0 }}
        onChange={event => onChange(event.target.checked ? longTermValue : '')} />
      <span>长期有效</span>
    </label>
  </div>;
}
