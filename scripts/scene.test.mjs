import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// dist/scene.js runs here with the real three.js core. A stand-in for the GPU renderer records what each frame would
// show; the clock, requestAnimationFrame, observers and media queries are driven by the tests. The copy of scene.js
// sits next to a vendor/three.module.js that adds the stand-ins to the core.
const dist = join(import.meta.dirname, '../dist');
const work = mkdtempSync(join(tmpdir(), 'portfolio-scene-'));
after(() => rmSync(work, { recursive: true, force: true }));
mkdirSync(join(work, 'vendor'));
copyFileSync(join(dist, 'scene.js'), join(work, 'scene.js'));
writeFileSync(join(work, 'vendor/three.module.js'), `export * from ${JSON.stringify(pathToFileURL(join(dist, 'vendor/three.core.js')).href)};
export const { WebGLRenderer, PMREMGenerator } = globalThis.sceneTestDoubles;
`);

const screen = {};
let now = 0;
const callbacks = new Map();
let lastFrame = 0;
globalThis.requestAnimationFrame = callback => { callbacks.set(++lastFrame, callback); return lastFrame; };
globalThis.cancelAnimationFrame = id => callbacks.delete(id);
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
// Above the low-power limits, so the budget depends only on the window.
Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 8, deviceMemory: 8 }, configurable: true });
const queries = [];
function evaluate(media) {
  return media.split(',').some(part => {
    const [, feature, value] = /^\s*\(([\w-]+):\s*([\w.]+)\)\s*$/.exec(part) ?? [];
    if (feature === 'pointer') return value === (screen.coarse ? 'coarse' : 'fine');
    if (feature === 'max-width' && value.endsWith('px')) return screen.width <= parseFloat(value);
    if (feature === 'resolution' && value.endsWith('dppx')) return parseFloat(value) === screen.dpr;
    throw new Error(`The test cannot evaluate the media query ${media}`);
  });
}
globalThis.window = {
  get devicePixelRatio() { return screen.dpr; },
  matchMedia(media) { const list = Object.assign(new EventTarget(), { media, matches: evaluate(media) }); queries.push(list); return list; },
};
// Like a browser: update the screen, then fire change on every media query list whose result changed.
function change(update) {
  Object.assign(screen, update);
  for (const list of queries) {
    const matches = evaluate(list.media);
    if (matches !== list.matches) { list.matches = matches; list.dispatchEvent(new Event('change')); }
  }
}
globalThis.document = Object.defineProperty(new EventTarget(), 'hidden', { get: () => false });
const resizeObservers = [];
globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; resizeObservers.push(this); } observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };

const renderers = [];
class WebGLRenderer {
  constructor() {
    this.domElement = Object.assign(new EventTarget(), { style: {}, setAttribute() {}, remove() {} });
    this.context = 1;
    this.lost = false;
    this.showing = null;
    this.frames = 0;
    // three.js listens first: it keeps a lost context restorable and rebuilds its GL state when it returns.
    this.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; });
    this.domElement.addEventListener('webglcontextrestored', () => { this.lost = false; this.context += 1; });
    renderers.push(this);
  }
  setClearColor() {}
  // Assigning the canvas size clears it, as in WebGL.
  setPixelRatio(ratio) { this.ratio = ratio; this.showing = null; }
  setSize(width, height) { this.size = [width, height]; this.showing = null; }
  render(scene) {
    if (this.lost) return;
    let knot, bead, orbit;
    scene.traverse(object => {
      const type = object.geometry?.type;
      if (type === 'TorusKnotGeometry') knot = object; else if (type === 'SphereGeometry') bead = object; else if (type === 'TorusGeometry') orbit = object;
    });
    const [, rim] = scene.children.filter(object => object.isDirectionalLight);
    this.frames += 1;
    this.showing = {
      colours: { rim: rim.color.getHexString(), orbit: orbit.material.color.getHexString(), bead: bead.material.color.getHexString(), glow: bead.material.emissive.getHexString(), metal: knot.material.color.getHexString() },
      twist: knot.rotation.z,
      knot: [knot.geometry.parameters.tubularSegments, knot.geometry.parameters.radialSegments],
      ratio: this.ratio,
      environmentCurrent: scene.environment?.context === this.context,
    };
  }
  dispose() {}
}
class PMREMGenerator {
  constructor(renderer) { this.renderer = renderer; }
  fromScene() { return { texture: { context: this.renderer.context }, dispose() {} }; }
  dispose() {}
}
globalThis.sceneTestDoubles = { WebGLRenderer, PMREMGenerator };
const { initScene } = await import(pathToFileURL(join(work, 'scene.js')).href);

function advance(milliseconds) {
  for (let step = 0; step < Math.round(milliseconds * 60 / 1000); step += 1) {
    now += 1000 / 60;
    const due = [...callbacks.values()];
    callbacks.clear();
    due.forEach(callback => callback(now));
  }
}
const wide = { width: 878, height: 780 };
function start(options = {}, { size = wide, ...display } = {}) {
  Object.assign(screen, { width: 1440, coarse: false, dpr: 1 }, display);
  callbacks.clear();
  const box = { ...size };
  const classes = new Set();
  const container = {
    size: box, dataset: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: box.width, height: box.height }),
    appendChild() {}, addEventListener() {}, removeEventListener() {},
  };
  const sculpture = initScene(container, options);
  const renderer = renderers.at(-1);
  advance(100);
  return { container, sculpture, renderer, resized: () => resizeObservers.at(-1).callback([]) };
}

test('pausing during a theme change shows the chosen theme, not a blend', () => {
  const reference = start({ mode: 'math', paused: true });
  const chosen = reference.renderer.showing;
  reference.sculpture.destroy();
  const { sculpture, renderer } = start({ mode: 'build' });
  advance(1000);
  sculpture.setMode('math');
  advance(150);
  assert.notEqual(renderer.showing.colours.rim, chosen.colours.rim, 'The theme change is still easing in');
  // The pause button sits next to the theme buttons, so a quick second click lands here.
  sculpture.setPaused(true);
  advance(500);
  assert.deepEqual({ colours: renderer.showing.colours, twist: renderer.showing.twist }, { colours: chosen.colours, twist: chosen.twist });
  sculpture.destroy();
});

test('a resized canvas is drawn again before the frame is shown', () => {
  for (const paused of [false, true]) {
    const { container, sculpture, renderer, resized } = start({ paused });
    container.size.width = 700;
    // ResizeObserver callbacks run after the frame's animation callbacks, just before it is shown.
    resized();
    assert.deepEqual(renderer.size, [700, 780]);
    assert.notEqual(renderer.showing, null, `The ${paused ? 'paused' : 'moving'} sculpture is not blank for a frame after a resize`);
    sculpture.destroy();
  }
});

test('the render budget follows a widened window and a change of pixel density', () => {
  const look = ({ ratio, knot }) => ({ ratio, knot });
  const fresh = display => { const scene = start({}, display); const shown = look(scene.renderer.showing); scene.sculpture.destroy(); return shown; };
  const freshWide = fresh({ dpr: 2 });
  const freshWideAt1x = fresh({ dpr: 1 });
  const freshWideAt1_5x = fresh({ dpr: 1.5 });
  const freshNarrow = fresh({ width: 700, dpr: 2, size: { width: 700, height: 440 } });
  const { container, sculpture, renderer, resized } = start({}, { width: 700, dpr: 2, size: { width: 700, height: 440 } });
  assert.deepEqual(look(renderer.showing), freshNarrow);
  assert.notDeepEqual(freshNarrow, freshWide, 'A narrow window renders with the lighter budget');
  // Widening the window after enabling 3D: the media query changes, then the element is resized.
  Object.assign(container.size, wide);
  change({ width: 1440 });
  resized();
  advance(100);
  assert.deepEqual(look(renderer.showing), freshWide, 'A widened window renders like a fresh load');
  // Moving the window to a 1x screen, then to a 1.5x one: the CSS size stays the same, so no resize is reported.
  change({ dpr: 1 });
  advance(100);
  assert.deepEqual(look(renderer.showing), freshWideAt1x, 'A move to a 1x screen renders like a fresh load there');
  assert.notDeepEqual(freshWideAt1_5x, freshWideAt1x);
  change({ dpr: 1.5 });
  advance(100);
  assert.deepEqual(look(renderer.showing), freshWideAt1_5x, 'A second move, to a 1.5x screen, renders like a fresh load there');
  sculpture.destroy();
});

test('a restored WebGL context draws the sculpture again with a new environment map', () => {
  for (const paused of [false, true]) {
    const { container, sculpture, renderer } = start({ paused });
    const canvas = renderer.domElement;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    assert.deepEqual([container.dataset.sceneReady, container.classList.contains('scene-ready'), canvas.style.opacity], ['false', false, '0'], 'A lost context shows the CSS sculpture');
    const framesWhileLost = renderer.frames;
    advance(300);
    assert.equal(renderer.frames, framesWhileLost, 'Nothing is drawn while the context is lost');
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    advance(300);
    assert.ok(renderer.frames > framesWhileLost, `The ${paused ? 'paused' : 'moving'} sculpture is drawn again once the context is restored`);
    assert.deepEqual([container.dataset.sceneReady, container.classList.contains('scene-ready'), canvas.style.opacity], ['true', true, '']);
    assert.equal(renderer.showing.environmentCurrent, true, 'The environment map is rendered again on the restored context');
    sculpture.destroy();
  }
});
