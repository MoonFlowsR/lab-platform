import { materialKey } from '../../shared/lib/dropdown-normalize.js';

export function latestMaterialPurchase(name, history, excludeId = '') {
  const key = materialKey(name);
  if (!key) return null;
  return history.filter(row => !row.deleted_at && String(row._id) !== String(excludeId) && materialKey(row.material_name) === key)
    .sort((a, b) => (Date.parse(b.resubmitted_at || b.created_at) || 0) - (Date.parse(a.resubmitted_at || a.created_at) || 0) || Number(b._id) - Number(a._id))[0] || null;
}

export function purchaseFormFromHistory(defaults, name, previous) {
  const form = { ...defaults, material_name: name, repeat_purchase_confirmed: false };
  for (const key of ['specification', 'quantity', 'unit', 'preferred_supplier', 'purchase_purpose', 'estimated_price', 'safety_notes', 'remark']) {
    if (previous?.[key] != null) form[key] = previous[key];
  }
  if (!String(form.specification || '').trim()) form.specification = '无';
  return form;
}
