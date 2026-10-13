const chinese = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
const english = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const labels = { zh: '中文', en: '英文', number: '数字 / 符号' };
const labelOf = option => typeof option === 'object' ? option.label : option;
function describe(label) {
  const text = String(label || '').normalize('NFKC').trim();
  const index = text.search(/[\p{Script=Han}A-Za-z]/u);
  if (index < 0) return { group: 'number', sort: text };
  return { group: /\p{Script=Han}/u.test(text[index]) ? 'zh' : 'en', sort: text.slice(index) };
}
export function groupDropdownOptions(options, getLabel = labelOf) {
  const groups = { zh: [], en: [], number: [] };
  for (const option of options) groups[describe(getLabel(option)).group].push(option);
  return Object.entries(groups).filter(([, items]) => items.length).map(([id, items]) => ({
    id, label: labels[id], items: [...items].sort((left, right) => {
      const collator = id === 'zh' ? chinese : english;
      return collator.compare(describe(getLabel(left)).sort, describe(getLabel(right)).sort)
        || collator.compare(String(getLabel(left)), String(getLabel(right)));
    }),
  }));
}
