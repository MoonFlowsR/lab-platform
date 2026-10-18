const prefixes = 'TEST|PROC|PUR|OUT|IO|MAT|BATCH|UNIT|REV';
const shortDate = '\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])';
const longNumber = new RegExp(`^(${prefixes})-20(${shortDate})-(\\d+)$`, 'i');
const longNumbers = new RegExp(`\\b(${prefixes})-20(${shortDate})-(\\d+)\\b`, 'gi');
const shortNumbers = new RegExp(`\\b(${prefixes})-(${shortDate})-(\\d+)\\b`, 'gi');

export function formatPublicNumber(value) {
  return typeof value === 'string' ? value.replace(longNumber, '$1-$2-$3') : value;
}

export function formatPublicNumbers(value) {
  return typeof value === 'string' ? value.replace(longNumbers, '$1-$2-$3') : value;
}

export function publicNumberSearchText(value) {
  const original = String(value ?? '');
  const shortened = formatPublicNumbers(original);
  const expanded = original.replace(shortNumbers, '$1-20$2-$3');
  return [...new Set([original, shortened, expanded])].join(' ');
}

export function publicNumberHighlightTerms(query) {
  const values = Array.isArray(query) ? query : [query];
  const prefixDate = new RegExp(`\\b(${prefixes})-20(?=\\d{2,6}(?:-|$))`, 'gi');
  return [...new Set(values.flatMap(value => {
    const text = String(value || '').trim();
    return text ? [text, text.replace(prefixDate, '$1-')] : [];
  }))];
}
