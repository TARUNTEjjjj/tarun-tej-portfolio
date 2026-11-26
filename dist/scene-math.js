/**
 * Pure geometric, mathematical, and GLSL shader definitions for the hero 3D showcase.
 * Zero external or DOM dependencies so Node tests can verify mathematical invariants directly.
 */

export const SCENE_MODES = Object.freeze({
  build: Object.freeze({
    name: 'build',
    colorHex: '#8be9e4',
    secondaryHex: '#48b8c4',
    p: 2,
    q: 3,
    z: -0.18,
    tubeRadius: 0.25,
    cageStrands: 2,
    cageTwists: 6,
    satelliteCount: 3,
    orbitalStyle: 'gimbal',
  }),
  math: Object.freeze({
    name: 'math',
    colorHex: '#eac18a',
    secondaryHex: '#f6d8a8',
    p: 3,
    q: 4,
    z: 0.25,
    tubeRadius: 0.25,
    cageStrands: 2,
    cageTwists: 8,
    satelliteCount: 2,
    orbitalStyle: 'kepler',
  }),
  learn: Object.freeze({
    name: 'learn',
    colorHex: '#b2a0ff',
    secondaryHex: '#7be0d6',
    p: 2,
    q: 5,
    z: -0.38,
    tubeRadius: 0.205,
    cageStrands: 3,
    cageTwists: 10,
    satelliteCount: 4,
    orbitalStyle: 'lissajous',
  }),
});

export function getModeSpec(name) {
  return Object.hasOwn(SCENE_MODES, name) ? SCENE_MODES[name] : SCENE_MODES.build;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function len3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize3(v) {
  const length = len3(v);
  if (length <= 1e-12) return [0, 0, 1];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Exact torus-knot centerline matching Three.js TorusKnotGeometry.
 * Parameter u in [0, 2 * Math.PI * p] traces one closed loop.
 */
export function torusKnotPoint(u, p, q, radius = 1.03) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  return [
    radius * (2 + cs) * 0.5 * cu,
    radius * (2 + cs) * 0.5 * su,
    radius * Math.sin(quOverP) * 0.5,
  ];
}

/**
 * Analytical first and second derivatives r'(u), r''(u) for exact tangent and curvature.
 */
export function torusKnotDerivatives(u, p, q, radius = 1.03) {
  const k = q / p;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cku = Math.cos(k * u);
  const sku = Math.sin(k * u);
  const halfR = 0.5 * radius;
  const rho = 2 + cku;
  const rho1 = -k * sku;
  const rho2 = -k * k * cku;

  const d1 = [
    halfR * (rho1 * cu - rho * su),
    halfR * (rho1 * su + rho * cu),
    halfR * k * cku,
  ];
  const d2 = [
    halfR * ((rho2 - rho) * cu - 2 * rho1 * su),
    halfR * ((rho2 - rho) * su + 2 * rho1 * cu),
    halfR * (-k * k * sku),
  ];
  return { d1, d2 };
}

/**
 * Exact differential-geometry curvature kappa(u) = ||r'(u) x r''(u)|| / ||r'(u)||^3.
 */
export function torusKnotCurvature(u, p, q, radius = 1.03) {
  const { d1, d2 } = torusKnotDerivatives(u, p, q, radius);
  const speed = len3(d1);
  if (speed <= 1e-12) return 0;
  return len3(cross3(d1, d2)) / (speed ** 3);
}

/**
 * Orthonormal frame { P, T, N, B } matching Three.js TorusKnotGeometry extrusion frame.
 */
export function torusKnotFrame(u, p, q, radius = 1.03) {
  const P = torusKnotPoint(u, p, q, radius);
  const P2 = torusKnotPoint(u + 0.01, p, q, radius);
  const rawT = [P2[0] - P[0], P2[1] - P[1], P2[2] - P[2]];
  const rawSum = [P2[0] + P[0], P2[1] + P[1], P2[2] + P[2]];
  const T = normalize3(rawT);
  const B = normalize3(cross3(rawT, rawSum));
  const N = normalize3(cross3(B, rawT));
  return { P, T, N, B };
}

/**
 * Generates an indexed parametric torus-knot tube mesh (for the custom GLSL Fresnel rim halo).
 * Intentionally keeps segment counts smaller than core so core remains the largest draw call.
 */
export function buildTorusKnotTubeData({
  p = 2,
  q = 3,
  radius = 1.03,
  tube = 0.3,
  tubularSegments = 88,
  radialSegments = 10,
} = {}) {
  const tSegs = Math.max(16, Math.floor(tubularSegments));
  const rSegs = Math.max(6, Math.floor(radialSegments));
  const vertexCount = (tSegs + 1) * (rSegs + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(tSegs * rSegs * 6);

  let vOffset = 0;
  let uvOffset = 0;
  for (let i = 0; i <= tSegs; i += 1) {
    const u = (i / tSegs) * p * Math.PI * 2;
    const { P, N, B } = torusKnotFrame(u, p, q, radius);
    for (let j = 0; j <= rSegs; j += 1) {
      const v = (j / rSegs) * Math.PI * 2;
      const cx = -tube * Math.cos(v);
      const cy = tube * Math.sin(v);
      const nx = cx * N[0] + cy * B[0];
      const ny = cx * N[1] + cy * B[1];
      const nz = cx * N[2] + cy * B[2];
      const nVec = normalize3([nx, ny, nz]);

      positions[vOffset] = P[0] + nx;
      positions[vOffset + 1] = P[1] + ny;
      positions[vOffset + 2] = P[2] + nz;
      normals[vOffset] = nVec[0];
      normals[vOffset + 1] = nVec[1];
      normals[vOffset + 2] = nVec[2];
      vOffset += 3;

      uvs[uvOffset] = i / tSegs;
      uvs[uvOffset + 1] = j / rSegs;
      uvOffset += 2;
    }
  }

  let idxOffset = 0;
  for (let j = 1; j <= tSegs; j += 1) {
    for (let i = 1; i <= rSegs; i += 1) {
      const a = (rSegs + 1) * (j - 1) + (i - 1);
      const b = (rSegs + 1) * j + (i - 1);
      const c = (rSegs + 1) * j + i;
      const d = (rSegs + 1) * (j - 1) + i;
      indices[idxOffset++] = a;
      indices[idxOffset++] = b;
      indices[idxOffset++] = d;
      indices[idxOffset++] = b;
      indices[idxOffset++] = c;
      indices[idxOffset++] = d;
    }
  }

  return { positions, normals, uvs, indices, vertexCount, indexCount: indices.length };
}

/**
 * Generates non-indexed line segments for a multi-strand counter-wound harmonic wireframe cage
 * plus cross-rung lattice connectors around the torus-knot spine.
 */
export function buildHarmonicCageSegments({
  p = 2,
  q = 3,
  radius = 1.03,
  tube = 0.345,
  steps = 168,
  strands = 2,
  twists = 6,
} = {}) {
  const segSteps = Math.max(24, Math.floor(steps));
  const strandCount = Math.max(2, Math.floor(strands));
  const rungStride = Math.max(4, Math.floor(segSteps / 28));

  // Precompute strand points along the closed knot loop.
  const rings = Array.from({ length: strandCount }, () => new Float32Array((segSteps + 1) * 3));
  for (let i = 0; i <= segSteps; i += 1) {
    const t = i / segSteps;
    const u = t * p * Math.PI * 2;
    const { P, N, B } = torusKnotFrame(u, p, q, radius);
    const harmonic = 1 + 0.08 * Math.sin(t * twists * Math.PI * 2);
    const r = tube * harmonic;
    for (let s = 0; s < strandCount; s += 1) {
      const direction = s % 2 === 0 ? 1 : -1;
      const phi = direction * t * twists * Math.PI * 2 + (s * Math.PI * 2) / strandCount;
      const cx = -r * Math.cos(phi);
      const cy = r * Math.sin(phi);
      const base = i * 3;
      rings[s][base] = P[0] + cx * N[0] + cy * B[0];
      rings[s][base + 1] = P[1] + cx * N[1] + cy * B[1];
      rings[s][base + 2] = P[2] + cx * N[2] + cy * B[2];
    }
  }

  const rungCount = Math.floor(segSteps / rungStride);
  const totalSegments = strandCount * segSteps + rungCount * strandCount;
  const positions = new Float32Array(totalSegments * 6);
  const phases = new Float32Array(totalSegments * 2);

  let pOff = 0;
  let phOff = 0;
  for (let s = 0; s < strandCount; s += 1) {
    const ring = rings[s];
    for (let i = 0; i < segSteps; i += 1) {
      const a = i * 3;
      const b = (i + 1) * 3;
      positions[pOff++] = ring[a];
      positions[pOff++] = ring[a + 1];
      positions[pOff++] = ring[a + 2];
      positions[pOff++] = ring[b];
      positions[pOff++] = ring[b + 1];
      positions[pOff++] = ring[b + 2];
      phases[phOff++] = i / segSteps;
      phases[phOff++] = (i + 1) / segSteps;
    }
  }

  for (let i = 0; i < segSteps; i += rungStride) {
    if (phOff + strandCount * 2 > phases.length) break;
    const idx = i * 3;
    const phase = i / segSteps;
    for (let s = 0; s < strandCount; s += 1) {
      const next = (s + 1) % strandCount;
      positions[pOff++] = rings[s][idx];
      positions[pOff++] = rings[s][idx + 1];
      positions[pOff++] = rings[s][idx + 2];
      positions[pOff++] = rings[next][idx];
      positions[pOff++] = rings[next][idx + 1];
      positions[pOff++] = rings[next][idx + 2];
      phases[phOff++] = phase;
      phases[phOff++] = (phase + 0.08) % 1;
    }
  }

  return {
    positions: positions.subarray(0, pOff),
    phases: phases.subarray(0, phOff),
    segmentCount: phOff / 2,
  };
}

/**
 * Deterministic PRNG (Mulberry32) so procedural constellation geometry is reproducible.
 */
export function createSeededRandom(seed = 0x54617275) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Procedural 3D orbital constellation starfield + faint nearest-neighbor filament edges.
 */
export function buildConstellationPoints({
  count = 180,
  innerRadius = 2.65,
  outerRadius = 5.6,
  seed = 0x54617275,
  maxLinkDistance = 1.45,
  maxLinks = 72,
} = {}) {
  const n = Math.max(12, Math.floor(count));
  const rand = createSeededRandom(seed);
  const positions = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);
  const speeds = new Float32Array(n);
  const tints = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    // Golden-angle spiral azimuth + anisotropic orbital elevation band.
    const golden = (i + 0.5) / n;
    const theta = i * 2.399963229728653 + (rand() - 0.5) * 0.25;
    const orbitalWeight = rand() < 0.65 ? 0.42 : 0.92;
    const zUnit = (rand() * 2 - 1) * orbitalWeight;
    const xyUnit = Math.sqrt(Math.max(0, 1 - zUnit * zUnit));
    const r = innerRadius + (outerRadius - innerRadius) * (0.25 + 0.75 * Math.cbrt(golden * 0.55 + rand() * 0.45));

    positions[i * 3] = r * xyUnit * Math.cos(theta);
    positions[i * 3 + 1] = r * zUnit;
    positions[i * 3 + 2] = r * xyUnit * Math.sin(theta) - 0.45;
    sizes[i] = 1.5 + rand() * 2.6;
    phases[i] = rand() * Math.PI * 2;
    speeds[i] = 0.75 + rand() * 1.55;
    tints[i] = rand();
  }

  const edgeList = [];
  const maxDistSq = maxLinkDistance * maxLinkDistance;
  for (let i = 0; i < n && edgeList.length < maxLinks * 6; i += 1) {
    const ax = positions[i * 3];
    const ay = positions[i * 3 + 1];
    const az = positions[i * 3 + 2];
    for (let j = i + 1; j < n; j += 1) {
      const dx = positions[j * 3] - ax;
      const dy = positions[j * 3 + 1] - ay;
      const dz = positions[j * 3 + 2] - az;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > 0.12 && dSq <= maxDistSq) {
        edgeList.push(ax, ay, az, positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
        break;
      }
    }
  }

  return {
    count: n,
    positions,
    sizes,
    phases,
    speeds,
    tints,
    filamentPositions: new Float32Array(edgeList),
  };
}

/**
 * Generates closed 3D orbital curves for math (Kepler ellipse) and learn (Lissajous path).
 */
export function buildModeOrbitPath(style, { radius = 2.18, segments = 128 } = {}) {
  const count = Math.max(24, Math.floor(segments));
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    if (style === 'kepler') {
      const a = radius * 1.08;
      const b = radius * 0.84;
      points[i * 3] = a * Math.cos(t);
      points[i * 3 + 1] = b * Math.sin(t);
      points[i * 3 + 2] = 0.24 * Math.sin(t * 2);
    } else if (style === 'lissajous') {
      points[i * 3] = radius * Math.cos(t);
      points[i * 3 + 1] = radius * 0.88 * Math.sin(t);
      points[i * 3 + 2] = radius * 0.26 * Math.sin(t * 3);
    } else {
      points[i * 3] = radius * Math.cos(t);
      points[i * 3 + 1] = radius * Math.sin(t);
      points[i * 3 + 2] = 0;
    }
  }
  return points;
}

/**
 * Evaluates a satellite position along its mode-specific orbital path at angle t.
 */
export function evaluateSatellitePosition(style, t, radius = 2.18) {
  if (style === 'kepler') {
    return [
      radius * 1.08 * Math.cos(t),
      radius * 0.84 * Math.sin(t),
      0.24 * Math.sin(t * 2),
    ];
  }
  if (style === 'lissajous') {
    return [
      radius * Math.cos(t),
      radius * 0.88 * Math.sin(t),
      radius * 0.26 * Math.sin(t * 3),
    ];
  }
  return [radius * Math.cos(t), radius * Math.sin(t), 0];
}

/**
 * Computes base camera distance matching existing hero sculpture framing.
 */
export function baseCameraDistance(fovDeg = 36, aspect = 1) {
  const safeFov = clamp(fovDeg, 10, 120);
  const safeAspect = Math.max(aspect, 0.25);
  return 2.22 / Math.tan((safeFov * Math.PI) / 360) / Math.min(safeAspect, 1);
}

/**
 * Spherical camera rig combining base framing, scroll-linked elevation/azimuth parallax,
 * and interactive pointer orbit offset. At neutral inputs returns (0, 0, baseDist).
 */
export function computeCameraRig({
  aspect = 1,
  fovDeg = 36,
  scrollProgress = 0,
  orbitYaw = 0,
  orbitPitch = 0,
  pointerX = 0,
  pointerY = 0,
} = {}) {
  const scroll = clamp(scrollProgress, 0, 1);
  const px = clamp(pointerX, -1, 1);
  const py = clamp(pointerY, -1, 1);
  const yaw = clamp(orbitYaw, -Math.PI, Math.PI) + scroll * 0.36 + px * 0.08;
  const pitch = clamp(orbitPitch + scroll * 0.32 - py * 0.05, -0.95, 0.95);
  const baseDist = baseCameraDistance(fovDeg, aspect);
  const dist = baseDist * (1 - scroll * 0.06);

  const cosPitch = Math.cos(pitch);
  const x = dist * cosPitch * Math.sin(yaw);
  const y = dist * Math.sin(pitch);
  const z = dist * cosPitch * Math.cos(yaw);
  return { position: [x, y, z], distance: dist, yaw, pitch };
}

export const HALO_VERTEX_SHADER = `
uniform float uTime;
uniform float uActivity;
varying vec3 vNormalView;
varying vec3 vViewPos;
varying float vPhase;
void main() {
  float pulse = sin(uv.x * 18.8495559 - uTime * 1.35) * 0.01 * uActivity;
  vec3 displaced = position + normal * pulse;
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = -mvPosition.xyz;
  vNormalView = normalize(normalMatrix * normal);
  vPhase = uv.x + uv.y * 0.35;
  gl_Position = projectionMatrix * mvPosition;
}
`.trim();

export const HALO_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying vec3 vNormalView;
varying vec3 vViewPos;
varying float vPhase;
void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vViewPos);
  float ndotv = clamp(abs(dot(n, v)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.75);
  float film = vPhase * 2.0 + ndotv * 1.4 - uTime * 0.12;
  vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (film + vec3(0.0, 0.33, 0.67)));
  vec3 tint = mix(uColorA, uColorB, clamp(fresnel * 0.8 + 0.2 * sin(vPhase * 6.2831853), 0.0, 1.0));
  vec3 col = mix(tint, spectrum * tint + tint * 0.5, 0.38);
  float alpha = fresnel * uOpacity;
  gl_FragColor = vec4(col * alpha, alpha);
}
`.trim();

export const CAGE_VERTEX_SHADER = `
attribute float aPhase;
varying float vPhase;
varying float vDepth;
void main() {
  vPhase = aPhase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vDepth = clamp((-mvPosition.z - 4.0) / 8.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`.trim();

export const CAGE_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uActivity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vPhase;
varying float vDepth;
void main() {
  float wave = 0.5 + 0.5 * sin((vPhase * 6.0 - uTime * 0.55 * uActivity) * 6.2831853);
  float crest = pow(wave, 3.0);
  vec3 col = mix(uColorA, uColorB, crest * 0.65);
  float alpha = uOpacity * (0.28 + 0.72 * crest) * (1.0 - vDepth * 0.35);
  gl_FragColor = vec4(col, alpha);
}
`.trim();

export const STARFIELD_VERTEX_SHADER = `
attribute float aSize;
attribute float aPhase;
attribute float aSpeed;
attribute float aTint;
uniform float uTime;
uniform float uPixelRatio;
varying float vTwinkle;
varying float vTint;
void main() {
  float angle = uTime * 0.018 * (0.4 + aTint * 0.6);
  float c = cos(angle);
  float s = sin(angle);
  vec3 pos = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vTwinkle = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
  vTint = aTint;
  gl_PointSize = clamp(aSize * uPixelRatio * (5.2 / max(-mvPosition.z, 1.5)), 1.5, 9.0);
  gl_Position = projectionMatrix * mvPosition;
}
`.trim();

export const STARFIELD_FRAGMENT_SHADER = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vTwinkle;
varying float vTint;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  if (dist > 0.5) discard;
  float core = exp(-dist * dist * 24.0);
  float halo = smoothstep(0.5, 0.0, dist) * 0.45;
  float intensity = (core + halo) * vTwinkle * uOpacity;
  vec3 tint = mix(vec3(0.92, 0.96, 0.98), mix(uColorA, uColorB, vTint), 0.72);
  gl_FragColor = vec4(tint * intensity, intensity);
}
`.trim();
