import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGE_FRAGMENT_SHADER,
  CAGE_VERTEX_SHADER,
  HALO_FRAGMENT_SHADER,
  HALO_VERTEX_SHADER,
  SCENE_MODES,
  STARFIELD_FRAGMENT_SHADER,
  STARFIELD_VERTEX_SHADER,
  baseCameraDistance,
  buildConstellationPoints,
  buildHarmonicCageSegments,
  buildModeOrbitPath,
  buildTorusKnotTubeData,
  computeCameraRig,
  createSeededRandom,
  cross3,
  dot3,
  evaluateSatellitePosition,
  getModeSpec,
  len3,
  torusKnotCurvature,
  torusKnotDerivatives,
  torusKnotFrame,
  torusKnotPoint,
} from '../dist/scene-math.js';

test('torus knot centerline closes exactly and satisfies analytical vs finite-difference derivatives', () => {
  const h = 1e-5;
  const rand = createSeededRandom(0x13572468);
  for (const mode of Object.values(SCENE_MODES)) {
    const start = torusKnotPoint(0, mode.p, mode.q);
    const end = torusKnotPoint(Math.PI * 2 * mode.p, mode.p, mode.q);
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Math.abs(start[axis] - end[axis]) < 1e-12, `${mode.name} knot must close seamlessly on axis ${axis}`);
    }

    for (let sample = 0; sample < 24; sample += 1) {
      const u = rand() * Math.PI * 2 * mode.p;
      const { d1, d2 } = torusKnotDerivatives(u, mode.p, mode.q);
      const pPlus = torusKnotPoint(u + h, mode.p, mode.q);
      const pMid = torusKnotPoint(u, mode.p, mode.q);
      const pMinus = torusKnotPoint(u - h, mode.p, mode.q);
      for (let axis = 0; axis < 3; axis += 1) {
        const fd1 = (pPlus[axis] - pMinus[axis]) / (2 * h);
        const fd2 = (pPlus[axis] - 2 * pMid[axis] + pMinus[axis]) / (h * h);
        assert.ok(Math.abs(d1[axis] - fd1) < 1e-6, `${mode.name} first derivative mismatch at u=${u}`);
        assert.ok(Math.abs(d2[axis] - fd2) < 1e-4, `${mode.name} second derivative mismatch at u=${u}`);
      }
      const kappa = torusKnotCurvature(u, mode.p, mode.q);
      assert.ok(Number.isFinite(kappa) && kappa > 0.1 && kappa < 20, `${mode.name} curvature bounded & positive: ${kappa}`);
    }
  }
});

test('torus knot extrusion frames (T, N, B) form right-handed orthonormal bases across all modes', () => {
  for (const mode of Object.values(SCENE_MODES)) {
    for (let step = 0; step < 36; step += 1) {
      const u = (step / 36) * Math.PI * 2 * mode.p;
      const { T, N, B } = torusKnotFrame(u, mode.p, mode.q);
      assert.ok(Math.abs(len3(T) - 1) < 1e-10);
      assert.ok(Math.abs(len3(N) - 1) < 1e-10);
      assert.ok(Math.abs(len3(B) - 1) < 1e-10);
      assert.ok(Math.abs(dot3(T, N)) < 1e-10, `${mode.name} T·N orthogonal`);
      assert.ok(Math.abs(dot3(T, B)) < 1e-10, `${mode.name} T·B orthogonal`);
      assert.ok(Math.abs(dot3(N, B)) < 1e-10, `${mode.name} N·B orthogonal`);
      const det = dot3(cross3(B, T), N);
      assert.ok(Math.abs(det - 1) < 1e-9, `${mode.name} handedness consistent (det=${det})`);
    }
  }
});

test('Fresnel halo tube and harmonic cage satisfy topological closure, unit outward normals, and draw budget bounds', () => {
  for (const mode of Object.values(SCENE_MODES)) {
    const tube = buildTorusKnotTubeData({
      p: mode.p,
      q: mode.q,
      radius: 1.03,
      tube: mode.tubeRadius + 0.052,
      tubularSegments: 96,
      radialSegments: 10,
    });
    // Must stay strictly below compact core index count (12,288) so core remains largestDraw.
    assert.ok(tube.indexCount < 12_288, `${mode.name} halo indexCount (${tube.indexCount}) stays under core draw budget`);
    assert.equal(tube.positions.length, tube.vertexCount * 3);
    assert.equal(tube.normals.length, tube.vertexCount * 3);
    assert.equal(tube.uvs.length, tube.vertexCount * 2);

    for (let i = 0; i < tube.vertexCount; i += 1) {
      const n = [tube.normals[i * 3], tube.normals[i * 3 + 1], tube.normals[i * 3 + 2]];
      assert.ok(Math.abs(len3(n) - 1) < 1e-5, 'Vertex normal is unit length');
      const u = tube.uvs[i * 2];
      const v = tube.uvs[i * 2 + 1];
      assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, 'UV coordinates bounded in [0,1]');
    }
    for (const idx of tube.indices) {
      assert.ok(idx < tube.vertexCount, 'Index inside vertex buffer');
    }

    const cage = buildHarmonicCageSegments({
      p: mode.p,
      q: mode.q,
      tube: mode.tubeRadius + 0.095,
      steps: 144,
      strands: mode.cageStrands,
      twists: mode.cageTwists,
    });
    assert.ok(cage.segmentCount > mode.cageStrands * 144);
    assert.equal(cage.positions.length, cage.segmentCount * 6);
    for (const p of cage.phases) assert.ok(p >= 0 && p <= 1, 'Cage phases bounded in [0, 1]');
    for (const v of cage.positions) assert.ok(Number.isFinite(v), 'Cage vertices are finite');
  }
});

test('procedural constellation starfield is deterministic, respects core exclusion radius, and bounds filament lengths', () => {
  const a = buildConstellationPoints({ count: 160, innerRadius: 2.65, outerRadius: 5.6, seed: 0x54617275, maxLinkDistance: 1.45 });
  const b = buildConstellationPoints({ count: 160, innerRadius: 2.65, outerRadius: 5.6, seed: 0x54617275, maxLinkDistance: 1.45 });
  assert.deepEqual(a, b, 'Same seed produces identical constellation geometry');

  for (let i = 0; i < a.count; i += 1) {
    const x = a.positions[i * 3];
    const y = a.positions[i * 3 + 1];
    const z = a.positions[i * 3 + 2] + 0.45;
    const r = Math.hypot(x, y, z);
    assert.ok(r >= 2.65 - 1e-5 && r <= 5.6 + 1e-5, `Star ${i} radius ${r} inside orbital band`);
    assert.ok(a.sizes[i] > 0 && a.speeds[i] > 0 && a.tints[i] >= 0 && a.tints[i] <= 1);
  }

  for (let i = 0; i < a.filamentPositions.length; i += 6) {
    const d = Math.hypot(
      a.filamentPositions[i + 3] - a.filamentPositions[i],
      a.filamentPositions[i + 4] - a.filamentPositions[i + 1],
      a.filamentPositions[i + 5] - a.filamentPositions[i + 2],
    );
    assert.ok(d > 0.1 && d <= 1.45 + 1e-5, `Filament distance ${d} within maxLinkDistance`);
  }
});

test('camera rig spherical bounds and mode-distinct orbital kinematics satisfy invariants across randomized inputs', () => {
  const neutral = computeCameraRig({ aspect: 1.4, fovDeg: 36 });
  assert.deepEqual(neutral.position, [0, 0, baseCameraDistance(36, 1.4)]);

  const rand = createSeededRandom(0x9e3779b9);
  for (let i = 0; i < 64; i += 1) {
    const aspect = 0.4 + rand() * 2.2;
    const fovDeg = 20 + rand() * 50;
    const scrollProgress = (rand() - 0.2) * 1.5;
    const orbitYaw = (rand() - 0.5) * 10;
    const orbitPitch = (rand() - 0.5) * 6;
    const pointerX = (rand() - 0.5) * 4;
    const pointerY = (rand() - 0.5) * 4;
    const rig = computeCameraRig({ aspect, fovDeg, scrollProgress, orbitYaw, orbitPitch, pointerX, pointerY });

    assert.ok(rig.pitch >= -0.95 && rig.pitch <= 0.95, 'Pitch stays clamped away from gimbal poles');
    const actualDist = len3(rig.position);
    assert.ok(Math.abs(actualDist - rig.distance) < 1e-9, 'Spherical radius equals rig.distance');
    assert.ok(rig.position.every(Number.isFinite) && rig.distance > 1);
  }

  const paths = ['gimbal', 'kepler', 'lissajous'].map(style => buildModeOrbitPath(style, { radius: 2.18, segments: 64 }));
  assert.notDeepEqual(paths[0], paths[1]);
  assert.notDeepEqual(paths[1], paths[2]);
  for (const style of ['gimbal', 'kepler', 'lissajous']) {
    const path = buildModeOrbitPath(style, { radius: 2.18, segments: 64 });
    const sat = evaluateSatellitePosition(style, (12 / 64) * Math.PI * 2, 2.18);
    assert.ok(Math.hypot(path[12 * 3] - sat[0], path[12 * 3 + 1] - sat[1], path[12 * 3 + 2] - sat[2]) < 1e-5);
  }
  assert.equal(getModeSpec('unknown').name, 'build');
});

test('GLSL vertex and fragment shaders maintain balanced syntax and Three.js built-in hygiene', () => {
  const pairs = [
    ['halo', HALO_VERTEX_SHADER, HALO_FRAGMENT_SHADER],
    ['cage', CAGE_VERTEX_SHADER, CAGE_FRAGMENT_SHADER],
    ['starfield', STARFIELD_VERTEX_SHADER, STARFIELD_FRAGMENT_SHADER],
  ];
  for (const [label, vert, frag] of pairs) {
    for (const [stage, src] of [['vertex', vert], ['fragment', frag]]) {
      assert.match(src, /void\s+main\s*\(\s*\)/, `${label} ${stage} shader defines main()`);
      const opens = (src.match(/\{/g) || []).length;
      const closes = (src.match(/\}/g) || []).length;
      assert.equal(opens, closes, `${label} ${stage} braces balanced`);
      assert.doesNotMatch(src, /\battribute\s+vec[23]\s+(?:position|normal|uv)\b/, `${label} ${stage} avoids built-in attribute redeclaration`);
      assert.doesNotMatch(src, /\buniform\s+mat[34]\s+(?:modelViewMatrix|projectionMatrix|normalMatrix)\b/, `${label} ${stage} avoids built-in matrix redeclaration`);
    }
    assert.match(vert, /gl_Position\s*=/, `${label} vertex shader writes gl_Position`);
    assert.match(frag, /gl_FragColor\s*=/, `${label} fragment shader writes gl_FragColor`);
  }
});
