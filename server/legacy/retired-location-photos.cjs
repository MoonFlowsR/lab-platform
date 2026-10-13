// Preserve old files for audit/backup while retiring their public feature.
module.exports = function retiredLocationPhotoIds(rows) {
  const itemIds = new Set(rows.flatMap(row => [row.photo_attachment_id, row.inbound_photo_attachment_id]).filter(Boolean).map(String));
  return new Set(rows.map(row => row.storage_photo_attachment_id).filter(id => id && !itemIds.has(String(id))).map(String));
};
