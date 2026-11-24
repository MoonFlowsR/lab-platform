import { formatPublicNumber, publicNumberSearchText } from '../../shared/lib/public-number.js';
import { materialModelTerms } from '../inventory/material-model-search.js';

const numberKey = raw => formatPublicNumber(String(raw ?? '').normalize('NFKC').trim().toUpperCase());

export function stockBatchChoices(batches) {
  const options = [], searchTerms = new Map(), byNumber = new Map();
  for (const batch of batches) {
    if (batch.deleted_at) continue;
    const id = String(batch._id);
    const code = String(batch.batch_code || batch.public_id || '').trim();
    const number = formatPublicNumber(code);
    const detail = [
      batch.material_name, batch.spec && `规格 ${batch.spec}`, batch.storage_room,
      batch.purchase_purpose, `库存 ${batch.current_qty} ${batch.unit || ''}`.trim(),
    ].filter(Boolean).join(' · ');
    options.push({ value: id, label: number || '未登记批次号', detail });
    searchTerms.set(id, [...publicNumberSearchText(code).split(' '), ...materialModelTerms(batch.material_name, [batch.spec])].filter(Boolean));
    if (code) {
      const key = numberKey(code);
      // Ambiguous legacy codes can only be selected from their individual rows.
      byNumber.set(key, byNumber.has(key) ? null : id);
    }
  }
  return { options, searchTerms, resolveInput: input => byNumber.get(numberKey(input)) };
}
