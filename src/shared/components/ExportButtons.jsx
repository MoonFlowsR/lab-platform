import { styles } from '../../app/styles.js';

export default function ExportButtons({ onExport, subject = '', disabled = false }) {
  return <div className="platform-export-buttons">
    <button type="button" style={styles.secondaryButton} disabled={disabled} onClick={() => onExport('xlsx')} title="首行自带筛选，冻结表头">导出{subject}Excel</button>
    <button type="button" className="platform-export-csv" style={styles.lightButton} disabled={disabled} onClick={() => onExport('csv')} aria-label={`导出${subject}CSV`} title="CSV 纯文本格式">CSV</button>
  </div>;
}
