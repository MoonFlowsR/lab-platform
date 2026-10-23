import { styles } from '../../app/styles.js';
import Icon from './Icon.jsx';

export default function ExportButton({ onExport, subject = '', disabled = false }) {
  return <button type="button" className="platform-export-button" style={styles.lightButton} disabled={disabled} onClick={() => onExport()} title="首行自带筛选，冻结表头"><Icon name="download" size={16} />导出{subject}Excel</button>;
}
