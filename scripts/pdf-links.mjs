import { inflateSync } from 'node:zlib';

// The targets of a PDF's links (its /URI actions), so the checks can see where a published PDF points. ReportLab,
// which made the résumés, writes them as literal strings, plainly or with octal escapes (both occur in their
// history); hex strings and compressed object streams are read as well. A link this cannot read is an error.
const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\r\n': '', '\n': '', '\r': '' };
const literal = text => text.replace(/\\([0-7]{1,3}|\r\n|[\s\S])/g, (escape, code) =>
  /^[0-7]/.test(code) ? String.fromCharCode(parseInt(code, 8) & 255) : escapes[code] ?? code);

export function pdfLinks(pdf, name = 'PDF') {
  const text = Buffer.from(pdf).toString('latin1'), parts = [text];
  for (const [, data] of text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try { parts.push(inflateSync(Buffer.from(data, 'latin1')).toString('latin1')); } catch { /* Not Flate-compressed. */ }
  }
  return parts.flatMap(part => {
    const links = [...part.matchAll(/\/URI\s*(?:\(((?:\\[\s\S]|[^\\()])*)\)|<([\da-fA-F\s]*)>)/g)]
      .map(([, string, hex]) => string === undefined ? Buffer.from(hex.replace(/\s/g, ''), 'hex').toString('latin1') : literal(string));
    const actions = part.match(/\/S\s*\/URI\b/g)?.length ?? 0;
    if (links.length !== actions) throw new Error(`${name}: only ${links.length} of ${actions} link targets could be read.`);
    return links;
  });
}
