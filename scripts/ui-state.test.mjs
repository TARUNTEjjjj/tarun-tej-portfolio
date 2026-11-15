import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneRequiresConsent, projectKeyFromURL, projectURL } from '../dist/ui-state.js';

test('lightweight preferences defer optional 3D', () => {
  assert.equal(sceneRequiresConsent(), false);
  assert.equal(sceneRequiresConsent({ effectiveType: '4g' }), false);
  for (const preference of [{ reducedMotion: true }, { narrow: true }, { saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) assert.equal(sceneRequiresConsent(preference), true);
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


test('project search composes category with literal, accent-insensitive terms', async () => {
  const { matchesProject } = await import('../dist/ui-state.js');
  const project = {text:'Neural résumé — Python and matrix operations',categories:'math ml'};
  assert.equal(matchesProject(project,{query:' PYTHON resume ',category:'ml'}),true);
  assert.equal(matchesProject(project,{query:'python absent'}),false);
  assert.equal(matchesProject(project,{query:'python',category:'web'}),false);
  assert.equal(matchesProject(project,{query:'  '}),true);
  for(const query of ['<script>','.*','[','__proto__']) assert.equal(matchesProject(project,{query}),false);
});
