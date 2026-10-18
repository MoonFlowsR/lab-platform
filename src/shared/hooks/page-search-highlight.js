import { useEffect } from 'react';
import { publicNumberHighlightTerms } from '../lib/public-number.js';

function rangeMatcher(terms) {
  const values = publicNumberHighlightTerms(terms);
  if (!values.length) return () => [];
  const escaped = values.sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'giu');
  return text => [...String(text).matchAll(pattern)].map(match => [match.index, match.index + match[0].length]);
}

export function matchRanges(text, terms) {
  return rangeMatcher(terms)(text);
}

const blockSelector = 'p,h1,h2,h3,h4,h5,h6,td,th,dt,dd,button,label,summary,option,li';
const ignoredSelector = 'script,style,svg,[aria-hidden="true"],.platform-search-overlay';

export function usePageSearchHighlight(query, selector = '.platform-shell, .platform-dialog-backdrop') {
  const key = JSON.stringify(Array.isArray(query) ? query : [query]);
  useEffect(() => {
    const terms = JSON.parse(key).map(value => String(value || '').trim()).filter(Boolean);
    if (!terms.length) return;
    const matches = rangeMatcher(terms);
    let frame = 0, disposed = false;
    const native = Boolean(window.CSS?.highlights && window.Highlight);
    const layer = native ? null : Object.assign(document.createElement('div'), { className: 'platform-search-overlay' });
    if (layer) { layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); }
    const fields = new Set(), roots = new Set();
    function refresh() {
      frame = 0;
      if (disposed) return;
      fields.forEach(field => field.removeAttribute('data-platform-search-match')); fields.clear();
      roots.forEach(root => root.removeAttribute('data-search-match-count')); roots.clear();
      const ranges = [];
      for (const root of document.querySelectorAll(selector)) {
        roots.add(root);
        const groups = [];
        let previousGroup;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
          if (!node.textContent.trim() || node.parentElement?.closest(ignoredSelector)) return NodeFilter.FILTER_REJECT;
          for (let closed = node.parentElement?.closest('details:not([open])'); closed; closed = closed.parentElement?.closest('details:not([open])')) {
            if (!closed.querySelector(':scope > summary')?.contains(node.parentElement)) return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        } });
        while (walker.nextNode()) {
          const node = walker.currentNode, group = node.parentElement.closest(blockSelector) || node.parentElement;
          if (group !== previousGroup) { groups.push([]); previousGroup = group; }
          groups[groups.length - 1].push(node);
        }
        let count = 0;
        for (const group of groups) {
          // Most text does not match. Check it before requesting browser layout.
          // Multiple text nodes may contain a hidden span between two visible
          // matching words, so retain the visibility check for those groups.
          if (group.length === 1 && !matches(group[0].textContent).length) continue;
          const nodes = group.filter(node => {
            const range = document.createRange(); range.selectNodeContents(node);
            return [...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
          });
          const text = nodes.map(node => node.textContent).join('');
          for (const [start, end] of matches(text)) {
            let offset = 0, startNode, endNode, startOffset, endOffset;
            for (const node of nodes) {
              const next = offset + node.textContent.length;
              if (!startNode && start < next) { startNode = node; startOffset = start - offset; }
              if (end <= next) { endNode = node; endOffset = end - offset; break; }
              offset = next;
            }
            if (startNode && endNode) { const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset); ranges.push(range); count++; }
          }
        }
        for (const field of root.querySelectorAll('input,textarea')) {
          if (['password', 'hidden', 'file'].includes(field.type) || field.getAttribute('aria-label') === '搜索记录' || field.closest('.help-search') || !matches(field.value).length || !field.getClientRects().length) continue;
          field.setAttribute('data-platform-search-match', 'true'); fields.add(field);
        }
        root.setAttribute('data-search-match-count', String(count));
      }
      if (native) window.CSS.highlights.set('platform-search', new window.Highlight(...ranges));
      else {
        const fragment = document.createDocumentFragment();
        for (const range of ranges) for (const rect of range.getClientRects()) {
          if (rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) {
            const highlight = document.createElement('i');
            Object.assign(highlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); fragment.append(highlight);
          }
        }
        layer.replaceChildren(fragment);
      }
    }
    const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(refresh); };
    const observer = new MutationObserver(records => { if (records.some(record => !record.target.closest?.('.platform-search-overlay'))) schedule(); });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    document.addEventListener('input', schedule, true);
    document.addEventListener('toggle', schedule, true);
    window.addEventListener('resize', schedule);
    // Native highlights move with their ranges when scrolling; only the overlay
    // fallback needs to recompute screen coordinates.
    if (!native) document.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('input', schedule, true); document.removeEventListener('toggle', schedule, true); if (!native) document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      if (native) window.CSS.highlights.delete('platform-search'); layer?.remove();
      fields.forEach(field => field.removeAttribute('data-platform-search-match')); roots.forEach(root => root.removeAttribute('data-search-match-count'));
    };
  }, [key, selector]);
}
