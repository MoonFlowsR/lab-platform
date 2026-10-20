import { styles } from '../../app/styles.js';

export default function ExportButton({ onExport, subject = '', disabled = false }) {
  return <button type="button" className="platform-export-button" style={styles.secondaryButton} disabled={disabled} onClick={() => onExport()} title="首行自带筛选，冻结表头">导出{subject}Excel</button>;
}
