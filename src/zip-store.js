// Standard ZIP with UTF-8 filenames and stored entries, so CSV contents stay byte-for-byte intact.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function storeZip(files, createdAt = new Date()) {
  if (files.length > 65535) throw new Error('导出文件数量过多。');
  const entries = files.map(file => {
    const name = encoder.encode(file.filename), content = encoder.encode(file.csv);
    if (name.length > 65535 || content.length > 0xffffffff) throw new Error('导出文件过大。');
    return { name, content, crc: crc32(content) };
  });
  const localSize = entries.reduce((size, entry) => size + 30 + entry.name.length + entry.content.length, 0);
  const centralSize = entries.reduce((size, entry) => size + 46 + entry.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff) throw new Error('导出数据过大，请缩小时间范围。');
  const bytes = new Uint8Array(localSize + centralSize + 22), view = new DataView(bytes.buffer);
  const stamp = new Date(createdAt.getTime() + 8 * 60 * 60 * 1000);
  const dosDate = ((Math.max(1980, Math.min(2107, stamp.getUTCFullYear())) - 1980) << 9) | ((stamp.getUTCMonth() + 1) << 5) | stamp.getUTCDate();
  const dosTime = (stamp.getUTCHours() << 11) | (stamp.getUTCMinutes() << 5) | (stamp.getUTCSeconds() >> 1);
  const u16 = (offset, value) => view.setUint16(offset, value, true);
  const u32 = (offset, value) => view.setUint32(offset, value, true);
  let position = 0;
  for (const entry of entries) {
    entry.offset = position;
    u32(position, 0x04034b50); u16(position + 4, 20); u16(position + 6, 0x0800);
    u16(position + 10, dosTime); u16(position + 12, dosDate);
    u32(position + 14, entry.crc); u32(position + 18, entry.content.length); u32(position + 22, entry.content.length);
    u16(position + 26, entry.name.length);
    bytes.set(entry.name, position + 30); bytes.set(entry.content, position + 30 + entry.name.length);
    position += 30 + entry.name.length + entry.content.length;
  }
  for (const entry of entries) {
    u32(position, 0x02014b50); u16(position + 4, 20); u16(position + 6, 20); u16(position + 8, 0x0800);
    u16(position + 12, dosTime); u16(position + 14, dosDate); u32(position + 16, entry.crc); u32(position + 20, entry.content.length); u32(position + 24, entry.content.length);
    u16(position + 28, entry.name.length); u32(position + 42, entry.offset);
    bytes.set(entry.name, position + 46); position += 46 + entry.name.length;
  }
  u32(position, 0x06054b50); u16(position + 8, entries.length); u16(position + 10, entries.length);
  u32(position + 12, centralSize); u32(position + 16, localSize);
  return bytes;
}
