import { storeZip } from './zip-store.js';

// A data-only SpreadsheetML workbook: no formulas, macros or external links.
// Each worksheet starts at row 1 with a frozen, filterable header.
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = value => String(value ?? '')
  // XML 1.0 excludes control characters except tab, LF and CR.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .toWellFormed().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;');
const documentXml = body => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body;
function columnName(index) {
  let name = '';
  for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
}
function sheetName(value, used) {
  const base = String(value || '数据').replace(/[/\\?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || '数据';
  let name = base, index = 1;
  while (used.has(name.toLowerCase())) { const suffix = ` (${++index})`; name = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}
function cell(value, reference, header = false) {
  if (!header && typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e15) return `<c r="${reference}"><v>${value}</v></c>`;
  const text = String(value ?? '');
  if (text.length > 32767) throw new Error('单元格内容过长，请缩小导出范围或使用 CSV。');
  return `<c r="${reference}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}
function worksheet({ headers, rows }) {
  if (!headers.length || headers.length > 16384 || rows.length > 1048575) throw new Error('数据超过 Excel 单表范围，请缩小筛选范围。');
  if (rows.some(row => row.length !== headers.length)) throw new Error('导出列数与数据不一致。');
  const range = `A1:${columnName(headers.length - 1)}${rows.length + 1}`;
  const width = value => Math.max(...String(value ?? '').split(/\r?\n/).map(line => [...line].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0)));
  const columns = headers.map((header, index) => {
    const size = Math.max(width(header) + 4, ...rows.slice(0, 200).map(row => width(row[index]) + 2));
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(44, Math.max(14, size))}" customWidth="1"/>`;
  }).join('');
  const header = `<row r="1" ht="28" customHeight="1">${headers.map((value, index) => cell(value, `${columnName(index)}1`, true)).join('')}</row>`;
  const body = rows.map((row, index) => `<row r="${index + 2}">${row.map((value, col) => cell(value, `${columnName(col)}${index + 2}`)).join('')}</row>`).join('');
  return documentXml(`<worksheet xmlns="${main}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${columns}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="${range}"/></worksheet>`);
}
const styles = documentXml(`<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

export function buildWorkbook(tables, createdAt = new Date()) {
  if (!tables.length) throw new Error('没有可导出的工作表。');
  const used = new Set();
  const sheets = tables.map(table => ({ ...table, name: sheetName(table.name || table.title, used) }));
  const files = [
    { filename: '[Content_Types].xml', content: documentXml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { filename: '_rels/.rels', content: documentXml(`<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { filename: 'xl/workbook.xml', content: documentXml(`<workbook xmlns="${main}" xmlns:r="${office}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { filename: 'xl/_rels/workbook.xml.rels', content: documentXml(`<Relationships xmlns="${rels}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${office}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${office}/styles" Target="styles.xml"/></Relationships>`) },
    { filename: 'xl/styles.xml', content: styles },
    ...sheets.map((table, i) => ({ filename: `xl/worksheets/sheet${i + 1}.xml`, content: worksheet(table) })),
  ];
  return storeZip(files, createdAt);
}

export const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
