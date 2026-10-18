// Match stored quotations while ignoring the whitespace added by selection in lists/tables.
export function liveCommentRoots(comments) {
  const byId = new Map(comments.map(row => [row.id, row])), live = new Set();
  for (const comment of comments.filter(row => !row.deleted_at)) {
    let row = comment;
    while (row && !live.has(row.id)) { live.add(row.id); row = byId.get(row.parent_id); }
  }
  return comments.filter(row => !row.parent_id && row.section_id !== 'general' && row.quote && live.has(row.id));
}

export function helpTextLeaves(section) {
  const leaves = [{ key: `${section.id}-title`, blockId: `${section.id}-title`, text: section.title }];
  section.blocks.forEach((block, index) => {
    const blockId = `${section.id}-${index}`;
    const add = (key, text) => leaves.push({ key, blockId, text: String(text || '') });
    if (block.type === 'steps') block.items.forEach((text, item) => add(`${blockId}-step-${item}`, text));
    else if (block.type === 'table') {
      block.headers.forEach((text, cell) => add(`${blockId}-h-${cell}`, text));
      block.rows.forEach((row, r) => row.forEach((text, c) => add(`${blockId}-r-${r}-${c}`, text)));
    } else add(blockId, block.text);
  });
  return leaves;
}

export function sectionAnnotations(section, roots) {
  const leaves = helpTextLeaves(section), blocks = new Map();
  let normalized = '';
  for (const leaf of leaves) {
    leaf.start = normalized.length; leaf.offsets = [];
    for (let index = 0; index < leaf.text.length; index++) if (!/\s/u.test(leaf.text[index])) {
      leaf.offsets.push(index); normalized += leaf.text[index];
    }
    leaf.end = normalized.length;
    const block = blocks.get(leaf.blockId) || { start: leaf.start, end: leaf.end };
    block.end = leaf.end; blocks.set(leaf.blockId, block);
  }
  const matches = [];
  for (const root of roots.filter(row => row.section_id === section.id)) {
    const quote = String(root.quote || '').replace(/\s/gu, '');
    if (!quote) continue;
    const block = blocks.get(root.block_id);
    let start = block ? normalized.indexOf(quote, block.start) : -1;
    if (!block || start < 0 || start >= block.end) start = normalized.indexOf(quote);
    if (start >= 0) matches.push({ start, end: start + quote.length, id: root.id });
  }
  const result = new Map();
  for (const leaf of leaves) {
    const ranges = matches.filter(row => row.start < leaf.end && row.end > leaf.start).map(row => ({
      start: leaf.offsets[Math.max(row.start, leaf.start) - leaf.start],
      end: leaf.offsets[Math.min(row.end, leaf.end) - leaf.start - 1] + 1,
      id: row.id,
    }));
    if (!ranges.length) continue;
    const cuts = [...new Set([0, leaf.text.length, ...ranges.flatMap(row => [row.start, row.end])])].sort((a, b) => a - b);
    const parts = [];
    for (let index = 0; index < cuts.length - 1; index++) {
      const start = cuts[index], end = cuts[index + 1];
      parts.push({ text: leaf.text.slice(start, end), commentIds: [...new Set(ranges.filter(row => row.start <= start && row.end >= end).map(row => row.id))] });
    }
    result.set(leaf.key, parts);
  }
  return result;
}
