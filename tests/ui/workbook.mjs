import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export function workbookParts(buffer) {
 const files=new Map();let offset=0;
 while(buffer.readUInt32LE(offset)===0x04034b50){const size=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+nameLength+extra;
  files.set(buffer.toString('utf8',offset+30,offset+30+nameLength),buffer.toString('utf8',start,start+size));offset=start+size;
 }
 assert.equal(buffer.readUInt32LE(offset),0x02014b50);return files;
}
export async function readWorkbookText(filename) {
 return [...workbookParts(await fs.readFile(filename))].filter(([name])=>name.startsWith('xl/worksheets/')).map(([,xml])=>xml).join('\n');
}
