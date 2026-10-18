const collections = ['lab_material_batches', 'lab_stock_transactions', 'lab_purchase_requests', 'lab_stock_out_requests'];
const photoFields = ['photo_attachment_id', 'inbound_photo_attachment_id', 'storage_photo_attachment_id'];
const stockTargets = new Set(['lab_material_batches', 'lab_stock_transactions', 'lab_stock_out_requests']);

// A purchase's inbound photo stays bound to its purchase; other saved evidence
// moves between transactions, batches, and approval requests. Check both actual
// photo references and stock bindings so stale draft metadata cannot permit deletion.
module.exports = function isStockEvidence(attachment, listRecords) {
  const attachmentId = String(attachment?._id || '');
  if (!attachmentId) return false;
  return collections.some(collection => listRecords(collection).some(row => {
    if (photoFields.some(field => row[field] && String(row[field]) === attachmentId)) return true;
    if (!stockTargets.has(collection) || attachment.target_collection !== collection) return false;
    return (attachment.target_id && String(attachment.target_id) === String(row._id)) ||
      (attachment.target_public_id && attachment.target_public_id === row.public_id);
  }));
};
