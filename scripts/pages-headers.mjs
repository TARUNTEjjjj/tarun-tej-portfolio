// Cloudflare Pages adds the headers in dist/_headers to every static response; the local preview servers do not.
// This reads the file by the rules Pages documents (https://developers.cloudflare.com/pages/configuration/headers/),
// so the checks can run the site under its production headers, the Content-Security-Policy among them.

const escapeRegExp = text => text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

// A rule's URL is a path or an https:// URL. It may hold one * (a greedy splat) and :placeholders, which match
// one path segment, or one label of the host name.
function urlPattern(url) {
  const source = url.split('*').map(escapeRegExp).join('(?<splat>.*)')
    .replace(/(?<=^https:\\\/\\\/[^/]*?):([A-Za-z]\w*)(?=\\)/g, '(?<$1>[^/.]+)')
    .replace(/:([A-Za-z]\w*)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${source}$`);
}

// Pages skips what it cannot use and only warns about it at deployment: a line it cannot read, a line over 2,000
// characters, rules after the 100th, and every rule for a URL but the last. A check should not let one pass.
export function parseHeaders(source) {
  const rules = [];
  let rule;
  for (const line of source.split('\n').map(line => line.trim())) {
    if (!line || line.startsWith('#')) continue;
    if (line.length > 2000) throw new Error(`_headers: "${line.slice(0, 40)}…" is longer than 2,000 characters.`);
    if (/^(\S+:\/\/|\/)/.test(line)) {
      if (!/^(\/|https:\/\/[^/]+(\/|$))/.test(line) || /^https:\/\/[^/]*:\d+(\/|$)/.test(line)) throw new Error(`_headers: "${line}" is not a path or an https:// URL without a port.`);
      const url = /^https:\/\/[^/]+$/.test(line) ? `${line}/` : line;
      if (rules.some(existing => existing.url === url)) throw new Error(`_headers: ${url} has more than one rule.`);
      if (rules.length === 100) throw new Error('_headers: Pages reads at most 100 rules.');
      rules.push(rule = { url, pattern: urlPattern(url), set: {}, unset: [] });
      continue;
    }
    if (!rule) throw new Error(`_headers: "${line}" comes before any path.`);
    const separator = line.indexOf(':');
    if (separator < 0 && /^! \S+$/.test(line)) { rule.unset.push(line.slice(2).toLowerCase()); continue; }
    const name = line.slice(0, Math.max(separator, 0)).trim().toLowerCase(), value = line.slice(separator + 1).trim();
    if (!name || !value || /\s/.test(name)) throw new Error(`_headers: "${line}" is not a "Name: value" header.`);
    rule.set[name] = rule.set[name] ? `${rule.set[name]}, ${value}` : value;
  }
  for (const { url, set, unset } of rules) if (!Object.keys(set).length && !unset.length) throw new Error(`_headers: ${url} has no headers.`);
  return rules;
}

// The headers of a response for the URL once Pages has applied every matching rule, in file order: a rule's value
// replaces what the server sent, a later matching rule adds to it, and "! Name" removes the header.
export function applyHeaders(rules, url, headers = {}) {
  const { hostname, pathname } = new URL(url);
  const result = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const added = new Set();
  for (const { url: ruleURL, pattern, set, unset } of rules) {
    const match = pattern.exec(ruleURL.startsWith('https://') ? `https://${hostname}${pathname}` : pathname);
    if (!match) continue;
    for (const name of unset) delete result[name];
    for (const [name, template] of Object.entries(set)) {
      const value = Object.entries(match.groups ?? {}).reduce((text, [key, part]) => text.replaceAll(`:${key}`, part), template);
      result[name] = added.has(name) && result[name] !== undefined ? `${result[name]}, ${value}` : value;
      added.add(name);
    }
  }
  return result;
}
