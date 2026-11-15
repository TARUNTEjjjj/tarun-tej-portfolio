import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneRequiresConsent, projectKeyFromURL, projectURL } from '../dist/ui-state.js';

test('lightweight preferences defer optional 3D', () => {
  assert.equal(sceneRequiresConsent(), false);
  assert.equal(sceneRequiresConsent({ effectiveType: '4g' }), false);
  for (const preference of [{ reducedMotion: true }, { narrow: true }, { coarsePointer: true }, { saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) assert.equal(sceneRequiresConsent(preference), true);
});
test('touch screens wider than the narrow breakpoint still wait for 3D consent', () => {
  // A tablet, or a phone rotated to landscape, on a fast connection; iPadOS reports no connection details at all.
  assert.equal(sceneRequiresConsent({ narrow: false, coarsePointer: true, effectiveType: '4g' }), true);
  assert.equal(sceneRequiresConsent({ narrow: false, coarsePointer: true, saveData: undefined, effectiveType: undefined }), true);
  assert.equal(sceneRequiresConsent({ narrow: false, coarsePointer: false, effectiveType: '4g' }), false);
});
test('only declared identifiers can select a case study', () => {
  for (const key of ['storm', 'neural']) assert.equal(projectKeyFromURL('https://example.test/?project='+key, ['storm', 'neural']), key);
  for (const query of ['', '?project=__proto__', '?project=%3Cscript%3E', '?project=unknown']) assert.equal(projectKeyFromURL('https://example.test/'+query, ['storm', 'neural']), null);
});
test('opening and closing preserves other query parameters and section', () => {
  const initial = 'https://example.test/portfolio?theme=dark#work';
  const opened = projectURL(initial, 'neural');
  assert.equal(opened, '/portfolio?theme=dark&project=neural#work');
  assert.equal(projectURL(new URL(opened, initial).href, null), '/portfolio?theme=dark#work');
});
test('shared project URLs safely encode values inside the query', () => {
  assert.equal(projectURL('https://example.test/', 'a&b'), '/?project=a%26b');
  assert.equal(projectURL('https://example.test/?project=storm#contact', 'neural'), '/?project=neural#contact');
});
test('a page path that starts with // keeps project URLs on the page origin', () => {
  // history.pushState and replaceState reject another origin, so "//?project=…" would leave the case study unopenable.
  for (const page of ['http://127.0.0.1:4173//', 'http://127.0.0.1:4173///', 'http://127.0.0.1:4173//index.html', 'http://127.0.0.1:4173//?project=storm', 'https://example.test//evil.example?flag#a?b']) {
    for (const key of ['neural', null]) {
      const resolved = new URL(projectURL(page, key), page);
      assert.deepEqual([resolved.origin, resolved.pathname, resolved.searchParams.get('project')], [new URL(page).origin, new URL(page).pathname, key], `${page} with ${key}`);
    }
  }
});


test('project search composes category with literal, accent-insensitive terms', async () => {
  const { matchesProject } = await import('../dist/ui-state.js');
  const project = {text:'Neural résumé — Python and matrix operations',categories:'math ml'};
  assert.equal(matchesProject(project,{query:' PYTHON resume ',category:'ml'}),true);
  assert.equal(matchesProject(project,{query:'python absent'}),false);
  assert.equal(matchesProject(project,{query:'python',category:'web'}),false);
  assert.equal(matchesProject(project,{query:'  '}),true);
  for(const query of ['<script>','.*','[','__proto__']) assert.equal(matchesProject(project,{query}),false);
});
