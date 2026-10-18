const crypto = require('node:crypto'), zlib = require('node:zlib'), { promisify } = require('node:util');
const gzip = promisify(zlib.gzip);
const rowKey = row => row && typeof row === 'object' ? String(row._id ?? row.id ?? row.username ?? '') : '';
function difference(previous, current) {
  const fields = {}, collections = {};
  for (const [key, value] of Object.entries(current)) {
    if (JSON.stringify(previous[key]) === JSON.stringify(value)) continue;
    const old = previous[key];
    if (Array.isArray(old) && Array.isArray(value) && [...old, ...value].every(row => rowKey(row)) && new Set(value.map(rowKey)).size === value.length && new Set(old.map(rowKey)).size === old.length) {
      const prior = new Map(old.map(row => [rowKey(row), JSON.stringify(row)]));
      const ids = new Set(value.map(rowKey));
      collections[key] = { upsert: value.filter(row => prior.get(rowKey(row)) !== JSON.stringify(row)), remove: old.filter(row => !ids.has(rowKey(row))).map(rowKey), order: value.map(rowKey) };
    } else fields[key] = value;
  }
  return {fields, collections, removeFields:Object.keys(previous).filter(key => !Object.hasOwn(current,key))};
}
async function send(req,res,body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.set({'Cache-Control':'private, no-store', Vary:'Accept-Encoding','Content-Type':'application/json; charset=utf-8'});
  const accepted = /(?:^|,)\s*gzip\s*(?:;\s*q=(?!0(?:\s*(?:,|$)|\.0+\s*(?:,|$)))[\d.]+)?\s*(?:,|$)/i.test(req.get('Accept-Encoding') || '');
  if (accepted && bytes.length >= 1024) { const compressed=await gzip(bytes,{level:zlib.constants.Z_BEST_SPEED});res.set('Content-Encoding','gzip');res.set('Content-Length',String(compressed.length));return res.end(compressed); }
  res.set('Content-Length',String(bytes.length));return res.end(bytes);
}
module.exports = function createSyncResponse({db,listAll}) {
  const epoch=crypto.randomUUID(), changes=db.prepare('SELECT total_changes() AS count');
  const cache=new Map(); let bytes=0;
  return async function respond(req,res,account,payload={}) {
    const version=epoch+':'+changes.get().count+':'+db.pragma('data_version',{simple:true});
    const key=account.username+':'+account.account_type+':'+(payload.delta===true?'delta':'full');
    const revision=version+':'+crypto.createHash('sha256').update(key).digest('hex').slice(0,16);
    if(payload.known_revision===revision)return send(req,res,{ok:true,unchanged:true,revision});
    let entry=cache.get(key),previous=entry;
    if(!entry||entry.revision!==revision){
      const data=listAll(account,{includeAudit:payload.delta!==true});
      entry={revision,data,size:Buffer.byteLength(JSON.stringify(data))};
      if(previous){bytes-=previous.size;cache.delete(key);}
      while(cache.size&&(cache.size>=8||bytes+entry.size>32*1024*1024)){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).size;cache.delete(oldest);}
      if(entry.size<=32*1024*1024){cache.set(key,entry);bytes+=entry.size;}
    }
    if(payload.delta===true&&previous&&previous.revision===payload.known_revision&&previous.revision!==entry.revision){
      const delta=difference(previous.data,entry.data);const body={ok:true,revision,base_revision:previous.revision,delta};
      if(Buffer.byteLength(JSON.stringify(body))<entry.size)return send(req,res,body);
    }
    return send(req,res,{ok:true,revision,data:entry.data});
  };
};
module.exports.difference=difference;
module.exports.send=send;
