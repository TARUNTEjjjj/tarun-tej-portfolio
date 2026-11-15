import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pdfLinks } from './pdf-links.mjs';

const link = target => `<< /A << /S /URI /Type /Action /URI ${target} >> /Subtype /Link /Type /Annot >>`;
const pdf = (...parts) => Buffer.concat(['%PDF-1.4\n', ...parts, '\n%%EOF\n'].map(part => Buffer.isBuffer(part) ? part : Buffer.from(part, 'latin1')));

test('reads link targets written plainly, with octal escapes, as hex or with escaped parentheses', () => {
  assert.deepEqual(pdfLinks(pdf(
    link('(mailto:someone@example.com)'), '\n',
    // How the résumé before 33619c9 wrote its links.
    link('(https\\072\\057\\057github\\056com\\057TARUNTEjjjj\\057axiom\\055sat)'), '\n',
    link(`<${Buffer.from('https://example.com/hex').toString('hex')}>`), '\n',
    link('(https://example.com/a\\(b\\)\\\\c)'),
  )), ['mailto:someone@example.com', 'https://github.com/TARUNTEjjjj/axiom-sat', 'https://example.com/hex', 'https://example.com/a(b)\\c']);
});

test('reads links kept in compressed object streams', () => {
  const objects = deflateSync(Buffer.from(link('(https://github.com/TARUNTEjjjj/stormsignal)')));
  assert.deepEqual(pdfLinks(pdf(`1 0 obj\n<< /Type /ObjStm /N 1 /First 0 /Filter /FlateDecode /Length ${objects.length} >>\nstream\r\n`, objects, '\r\nendstream\nendobj')),
    ['https://github.com/TARUNTEjjjj/stormsignal']);
});

test('a link it cannot read is an error, not a PDF without links', () => {
  for (const target of ['12 0 R', '(https://example.com/a(b)c)']) assert.throws(() => pdfLinks(pdf(link(target)), 'résumé.pdf'), /^Error: résumé\.pdf: only 0 of 1 link targets could be read\.$/);
});
