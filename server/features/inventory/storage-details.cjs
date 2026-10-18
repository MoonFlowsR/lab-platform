module.exports = function storageDetails(payload) {
  const room = String(payload.storage_room || '').trim();
  if (!room || ['其它', '__other_room__'].includes(room)) throw new Error('请选择存放房间，选择“其它”后请填写具体房间。');
  if (room.length > 100) throw new Error('存放房间过长。');
  const detail = String(payload.storage_detail || '').trim();
  if (!detail) throw new Error('请填写具体位置简述。');
  if (detail.length > 500) throw new Error('具体位置简述不能超过500字。');
  return { storage_room: room, storage_detail: detail, storage_location: [room, detail].filter(Boolean).join(' · ') };
};
