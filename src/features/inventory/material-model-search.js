import { canonicalMaterialName, materialAliasTerms, materialKey, uniqueOptions } from '../../shared/lib/dropdown-normalize.js';

const clean = value => String(value ?? '').normalize('NFKC').trim();
const primaryName = value => {
  const name = String(value || '').trim();
  if (!/[）)]$/u.test(name)) return name;
  let depth = 0;
  for (let index = name.length - 1; index >= 0; index--) {
    if (/[）)]/u.test(name[index])) depth++;
    else if (/[（(]/u.test(name[index]) && --depth === 0) return name.slice(0, index).trim() || name;
  }
  return name;
};

// Model numbers remain in specifications. These terms only support old combined searches.
export function materialModelTerms(name, specifications = []) {
  const canonical = canonicalMaterialName(name);
  const primary = primaryName(canonical);
  if (!primary) return [];
  return uniqueOptions([...materialAliasTerms(canonical, specifications), ...specifications.flatMap(value => {
    const spec = clean(value);
    const mn = /^Mn\s*[-‐‑‒–—−]?\s*(\d+(?:\.\d+)?)(?=$|\s|[，,;；])/iu.exec(spec);
    const model = /^([a-z]{1,12}[-‐‑‒–—−]?\d+(?:\.\d+)?)(?=$|\s|[，,;；])/iu.exec(spec);
    if (mn) return [`${primary}${mn[1]}`, `${primary} Mn-${mn[1]}`];
    if (model) return [`${primary}（${model[1]}）`, `${primary}${model[1]}`];
    return [];
  })]);
}

export function materialSearchTerms(catalog = [], batches = []) {
  const grouped = new Map();
  const add = (name, specifications) => {
    if (!name) return;
    const normalized = materialKey(name);
    const item = grouped.get(normalized) || { names: new Set(), terms: [] };
    item.names.add(String(name)); item.names.add(canonicalMaterialName(name));
    item.terms.push(...materialModelTerms(name, specifications));
    grouped.set(normalized, item);
  };
  for (const row of catalog) add(row.name, row.specifications || []);
  for (const batch of batches) if (!batch.deleted_at) add(batch.material_name, [batch.spec]);
  return new Map([...grouped.values()].flatMap(item => [...item.names].map(name => [name, uniqueOptions(item.terms)])));
}
