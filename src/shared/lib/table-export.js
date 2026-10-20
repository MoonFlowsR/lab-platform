import { buildExportTable, downloadCsv, downloadFile } from './csv-export.js';

export async function downloadTable(kind, rows, context = {}, format = 'xlsx') {
  if (format === 'csv') return downloadCsv(kind, rows, context);
  const { buildWorkbook, xlsxMime } = await import('./xlsx-export.js');
  const table = buildExportTable(kind, rows, context);
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  downloadFile(`${table.title}_${date}.xlsx`, new Blob([buildWorkbook([table])], { type: xlsxMime }));
  return table.rows.length;
}
