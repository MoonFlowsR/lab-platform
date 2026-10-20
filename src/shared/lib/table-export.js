import { buildExportTable } from './export-columns.js';

export async function downloadTable(kind, rows, context = {}) {
  const { buildWorkbook, xlsxMime } = await import('./xlsx-export.js');
  const table = buildExportTable(kind, rows, context);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  downloadFile(`${table.title}_${date}.xlsx`, new Blob([buildWorkbook([table])], { type: xlsxMime }));
  return table.rows.length;
}

export function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
