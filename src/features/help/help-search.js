export function searchTerms(query) {
  return [...new Set(String(query || '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN').split(/\s+/u).filter(Boolean))];
}

export function sectionText(section) {
  return [section.title, ...section.blocks.filter(block => !block.hidden && block.type !== 'history').flatMap(block => block.type === 'steps' ? block.items : block.type === 'table' ? [...block.headers, ...block.rows.flat()] : [block.text])]
    .join('\n').normalize('NFKC').toLocaleLowerCase('zh-CN');
}

export function filterHelpSections(sections, query) {
  const terms = searchTerms(query);
  if (!terms.length) return sections;
  return sections.map(section => ({...section, searchMatches: section.blocks.map(block => {
    if (block.hidden || block.type === 'history') return null;
    if (block.type === 'steps') {
      const indices = block.items.map((text,index) => textMatchesTerms(text,terms) ? index : -1).filter(index => index >= 0);
      return indices.length ? {items:indices} : null;
    }
    if (block.type === 'table') {
      const indices = block.rows.map((row,index) => textMatchesTerms([...block.headers,...row].join(' '),terms) ? index : -1).filter(index => index >= 0);
      return indices.length ? {rows:indices} : null;
    }
    return textMatchesTerms(block.text,terms) ? {} : null;
  })})).filter(section => textMatchesTerms(section.title,terms) || section.searchMatches.some(Boolean));
}

export function textMatchesTerms(text, terms) {
  const normalized = String(text || '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  return terms.every(term => normalized.includes(term));
}

export function commentMatchesTerms(row, terms) {
  return textMatchesTerms([row.author_name,row.author_username,row.reply_to_name,row.reply_to_username,row.quote,row.body,
    row.created_at ? new Date(row.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : ''].join(' '),terms);
}

export function commentBranchMatches(row, childrenByParent, terms, seen = new Set()) {
  if (seen.has(row.id)) return false;
  seen.add(row.id);
  return commentMatchesTerms(row,terms) || (childrenByParent.get(row.id) || []).some(child => commentBranchMatches(child,childrenByParent,terms,seen));
}
