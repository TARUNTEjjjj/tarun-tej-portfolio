// Browser-independent rules used by the interface and regression checks.
export function sceneRequiresConsent({ reducedMotion = false, narrow = false, saveData = false, effectiveType = '' } = {}) {
  return Boolean(reducedMotion || narrow || saveData || ['slow-2g', '2g'].includes(effectiveType));
}
export function projectKeyFromURL(value, allowedKeys) {
  const key = new URL(value).searchParams.get('project');
  return allowedKeys.includes(key) ? key : null;
}
export function projectURL(value, key) {
  const url = new URL(value);
  if (key) url.searchParams.set('project', key);
  else url.searchParams.delete('project');
  return url.pathname + url.search + url.hash;
}

/** Literal, accent-insensitive AND search; query text never becomes markup or a regex. */
export function matchesProject({ text = '', categories = '' }, { query = '', category = 'all' } = {}) {
  const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  if (category !== 'all' && !categories.split(/\s+/).includes(category)) return false;
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}
