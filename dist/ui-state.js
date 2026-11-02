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
