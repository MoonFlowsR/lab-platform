import options from './dropdown-options.json' with { type: 'json' };

export const optionKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/gu, '');
const aliases = new Map(Object.entries(options.purchaseNameAliases || {}).map(([name, canonical]) => [optionKey(name), canonical]));
export const canonicalMaterialName = value => aliases.get(optionKey(value)) || String(value || '').trim();
export const materialKey = value => optionKey(canonicalMaterialName(value));
export function uniqueOptions(values) {
  const seen = new Set();
  return values.map(value => String(value || '').trim()).filter(value => {
    const key = optionKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function materialOptionMatches(name, query) {
  const key = optionKey(query);
  return optionKey(name).includes(key) || [...aliases].some(([alias, canonical]) => materialKey(name) === materialKey(canonical) && alias.includes(key));
}
