export default function ItemPhotoFields({ photo, onPhotoChange, Field, FilePicker, styles }) {
  return <div style={{ ...styles.fullWidth, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
    <Field required label="物品特写照片"><FilePicker file={photo} onChange={onPhotoChange} helper="PNG、JPG/JPEG" /></Field>
  </div>;
}
