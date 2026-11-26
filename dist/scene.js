import * as THREE from './vendor/three.module.js';
import {
  CAGE_FRAGMENT_SHADER,
  CAGE_VERTEX_SHADER,
  HALO_FRAGMENT_SHADER,
  HALO_VERTEX_SHADER,
  SCENE_MODES,
  STARFIELD_FRAGMENT_SHADER,
  STARFIELD_VERTEX_SHADER,
  buildConstellationPoints,
  buildHarmonicCageSegments,
  buildModeOrbitPath,
  buildTorusKnotTubeData,
  clamp,
  computeCameraRig,
  evaluateSatellitePosition,
} from './scene-math.js';

/**
 * A procedural, locally rendered 3D showcase: no external models or remote image requests.
 * initScene(element, { paused, mode }) -> { setMode('build'|'math'|'learn'), setPaused(boolean), destroy() }
 * The element receives .scene-ready only after a successful render. Its existing
 * CSS fallback remains available if WebGL cannot start, and while its context is lost.
 */
export function initScene(container, { paused = false, mode: initialMode = 'build' } = {}) {
  const noop = { setMode() {}, setPaused() {}, destroy() {} };
  if (!container) return noop;

  const compactQuery = window.matchMedia('(pointer: coarse), (max-width: 767px)');
  const limitedHardware = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  let compact = compactQuery.matches || limitedHardware;
  const frameInterval = 1000 / 30;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    container.dataset.sceneReady = 'false';
    return noop;
  }

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;
  Object.assign(canvas.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    touchAction: 'pan-y',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 45);
  camera.position.set(0, 0, 7.5);

  // Large studio panels create crisp metallic highlights without remote HDRIs.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x111316);
  const studioResources = [];
  function softbox(width, height, position, strength) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(strength) });
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    studioResources.push(geometry, material);
  }
  softbox(3.5, 7, [-4, 2, 4], 5);
  softbox(1.2, 6, [4, 1, 2], 7);
  softbox(6, 2, [0, 5, -1], 4);
  softbox(2, 4, [1, -2, -5], 1.5);
  let environment;
  function buildEnvironment() {
    environment = undefined;
    scene.environment = null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      environment = pmrem.fromScene(studio, 0.025, 0.1, 50);
      scene.environment = environment.texture;
    } catch {
      // Directional lights still keep the sculpture legible on restricted renderers.
    } finally {
      pmrem.dispose();
      studioResources.forEach(resource => resource.dispose());
    }
  }
  buildEnvironment();

  const key = new THREE.DirectionalLight(0xf6f4ef, 3.2);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8be9e4, 3);
  rim.position.set(3, 1, -3);
  scene.add(rim, new THREE.AmbientLight(0xcbd3de, 0.6));

  const sculpture = new THREE.Group();
  scene.add(sculpture);

  const modes = {
    build: {
      ...SCENE_MODES.build,
      color: new THREE.Color(SCENE_MODES.build.colorHex),
      secondary: new THREE.Color(SCENE_MODES.build.secondaryHex),
    },
    math: {
      ...SCENE_MODES.math,
      color: new THREE.Color(SCENE_MODES.math.colorHex),
      secondary: new THREE.Color(SCENE_MODES.math.secondaryHex),
    },
    learn: {
      ...SCENE_MODES.learn,
      color: new THREE.Color(SCENE_MODES.learn.colorHex),
      secondary: new THREE.Color(SCENE_MODES.learn.secondaryHex),
    },
  };

  let selectedMode = Object.hasOwn(modes, initialMode) ? initialMode : 'build';
  let mode = modes[selectedMode];
  const accent = mode.color.clone();
  const secondaryAccent = mode.secondary.clone();
  const tintedMetal = new THREE.Color();
  const baseMetal = new THREE.Color(0xd8e3e5);
  let userPaused = Boolean(paused);

  const coreGeometries = new Map();
  const haloGeometries = new Map();
  const cageGeometries = new Map();

  function coreGeometryFor(name) {
    if (!coreGeometries.has(name)) {
      const { p, q, tubeRadius } = modes[name];
      coreGeometries.set(name, new THREE.TorusKnotGeometry(
        1.03, tubeRadius, compact ? 128 : 256, compact ? 16 : 24, p, q,
      ));
    }
    return coreGeometries.get(name);
  }

  function haloGeometryFor(name) {
    if (!haloGeometries.has(name)) {
      const { p, q, tubeRadius } = modes[name];
      const data = buildTorusKnotTubeData({
        p,
        q,
        radius: 1.03,
        tube: tubeRadius + 0.052,
        tubularSegments: compact ? 64 : 96,
        radialSegments: 10,
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      haloGeometries.set(name, geometry);
    }
    return haloGeometries.get(name);
  }

  function cageGeometryFor(name) {
    if (!cageGeometries.has(name)) {
      const { p, q, tubeRadius, cageStrands, cageTwists } = modes[name];
      const data = buildHarmonicCageSegments({
        p,
        q,
        radius: 1.03,
        tube: tubeRadius + 0.095,
        steps: compact ? 108 : 180,
        strands: cageStrands,
        twists: cageTwists,
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('aPhase', new THREE.BufferAttribute(data.phases, 1));
      cageGeometries.set(name, geometry);
    }
    return cageGeometries.get(name);
  }

  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xd8e3e5,
    metalness: 0.94,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 0.26,
    iridescenceIOR: 1.32,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 360,
    envMapIntensity: 1.15,
  });
  const core = new THREE.Mesh(coreGeometryFor(selectedMode), metal);
  core.rotation.set(0.38, -0.28, mode.z);
  sculpture.add(core);

  // Custom GLSL Fresnel iridescent rim-halo concentric around the torus knot.
  const haloUniforms = {
    uTime: { value: 0 },
    uActivity: { value: userPaused ? 0 : 1 },
    uColorA: { value: accent.clone() },
    uColorB: { value: secondaryAccent.clone() },
    uOpacity: { value: 0.68 },
  };
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    vertexShader: HALO_VERTEX_SHADER,
    fragmentShader: HALO_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const haloMesh = new THREE.Mesh(haloGeometryFor(selectedMode), haloMaterial);
  core.add(haloMesh);

  // Dual harmonic wireframe cage using non-indexed LineSegments and custom wave shader.
  const cageUniforms = {
    uTime: { value: 0 },
    uActivity: { value: userPaused ? 0 : 1 },
    uColorA: { value: accent.clone() },
    uColorB: { value: secondaryAccent.clone() },
    uOpacity: { value: 0.42 },
  };
  const cageMaterial = new THREE.ShaderMaterial({
    uniforms: cageUniforms,
    vertexShader: CAGE_VERTEX_SHADER,
    fragmentShader: CAGE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cageLines = new THREE.LineSegments(cageGeometryFor(selectedMode), cageMaterial);
  core.add(cageLines);

  // Base twin orbital rings & primary beads (also verified by regression tests).
  const orbits = new THREE.Group();
  const orbitMaterial = new THREE.MeshBasicMaterial({
    color: mode.color, transparent: true, opacity: 0.32,
  });
  const orbitGeometry = new THREE.TorusGeometry(2.02, 0.004, 6, 180);
  const orbitA = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbitA.rotation.set(0.92, -0.22, 0.18);
  orbits.add(orbitA);
  const orbitB = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbitB.rotation.set(-0.65, 0.8, -0.25);
  orbitB.scale.setScalar(1.07);
  orbits.add(orbitB);
  sculpture.add(orbits);

  const beadGeometry = new THREE.SphereGeometry(0.035, 16, 12);
  const beadMaterial = new THREE.MeshStandardMaterial({
    color: mode.color, metalness: 0.5, roughness: 0.25,
    emissive: mode.color, emissiveIntensity: 0.35,
  });
  const beads = [];
  for (let i = 0; i < 3; i += 1) {
    const bead = new THREE.Mesh(beadGeometry, beadMaterial);
    const angle = i * Math.PI * 2 / 3 + 0.45;
    bead.position.set(Math.cos(angle) * 2.02, Math.sin(angle) * 2.02, 0);
    orbitA.add(bead);
    beads.push(bead);
  }

  // Mode-distinct 3D orbital rings and architectural satellites for build / math / learn.
  const disposableResources = [
    metal, haloMaterial, cageMaterial, orbitGeometry, orbitMaterial, beadGeometry, beadMaterial,
  ];
  const modeAssemblies = {};
  const modeBlend = { build: 0, math: 0, learn: 0 };
  modeBlend[selectedMode] = 1;

  function buildModeAssemblies() {
    // 1) BUILD: Precision gimbal ring with vernier tick marks + 3 CAD octahedron wireframe nodes.
    const buildGroup = new THREE.Group();
    buildGroup.rotation.set(0.45, 0.32, -0.15);
    const gimbalGeo = new THREE.RingGeometry(2.17, 2.185, 96);
    const gimbalMat = new THREE.MeshBasicMaterial({
      color: modes.build.color, side: THREE.DoubleSide, transparent: true, opacity: 0.38,
    });
    const gimbalRing = new THREE.Mesh(gimbalGeo, gimbalMat);
    buildGroup.add(gimbalRing);

    const tickPositions = new Float32Array(36 * 6);
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      const innerR = i % 3 === 0 ? 2.11 : 2.14;
      const outerR = 2.185;
      tickPositions[i * 6] = Math.cos(a) * innerR;
      tickPositions[i * 6 + 1] = Math.sin(a) * innerR;
      tickPositions[i * 6 + 2] = 0;
      tickPositions[i * 6 + 3] = Math.cos(a) * outerR;
      tickPositions[i * 6 + 4] = Math.sin(a) * outerR;
      tickPositions[i * 6 + 5] = 0;
    }
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPositions, 3));
    const tickMat = new THREE.LineBasicMaterial({ color: modes.build.color, transparent: true, opacity: 0.45 });
    buildGroup.add(new THREE.LineSegments(tickGeo, tickMat));

    const satOctaGeo = new THREE.OctahedronGeometry(0.068, 0);
    const satOctaEdges = new THREE.EdgesGeometry(satOctaGeo);
    const satOctaMat = new THREE.MeshStandardMaterial({
      color: modes.build.color, metalness: 0.75, roughness: 0.25, transparent: true, opacity: 0.85,
    });
    const satWireMat = new THREE.LineBasicMaterial({ color: 0xe6fbfa, transparent: true, opacity: 0.75 });
    const buildSatellites = [];
    for (let i = 0; i < 3; i += 1) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(satOctaGeo, satOctaMat);
      mesh.add(new THREE.LineSegments(satOctaEdges, satWireMat));
      pivot.add(mesh);
      buildGroup.add(pivot);
      buildSatellites.push({ pivot, mesh, phase: (i * Math.PI * 2) / 3 });
    }
    sculpture.add(buildGroup);
    disposableResources.push(gimbalGeo, gimbalMat, tickGeo, tickMat, satOctaGeo, satOctaEdges, satOctaMat, satWireMat);
    modeAssemblies.build = { group: buildGroup, materials: [gimbalMat, tickMat, satOctaMat, satWireMat], satellites: buildSatellites, style: 'gimbal' };

    // 2) MATH: Twin inclined Keplerian ellipse orbits + geodesic icosahedron theorem nodes.
    const mathGroup = new THREE.Group();
    mathGroup.rotation.set(-0.42, 0.58, 0.22);
    const keplerPts = buildModeOrbitPath('kepler', { radius: 2.18, segments: 120 });
    const keplerGeo = new THREE.BufferGeometry();
    keplerGeo.setAttribute('position', new THREE.BufferAttribute(keplerPts, 3));
    const keplerMat = new THREE.LineBasicMaterial({ color: modes.math.color, transparent: true, opacity: 0.48 });
    const keplerLoopA = new THREE.LineLoop(keplerGeo, keplerMat);
    const keplerLoopB = new THREE.LineLoop(keplerGeo, keplerMat);
    keplerLoopB.rotation.set(Math.PI / 3, 0, Math.PI / 5);
    mathGroup.add(keplerLoopA, keplerLoopB);

    const conjugateGeo = new THREE.RingGeometry(1.76, 1.772, 84);
    const conjugateMat = new THREE.MeshBasicMaterial({
      color: modes.math.secondary, side: THREE.DoubleSide, transparent: true, opacity: 0.28,
    });
    const conjugateRing = new THREE.Mesh(conjugateGeo, conjugateMat);
    conjugateRing.rotation.set(Math.PI / 2.2, 0.35, 0);
    mathGroup.add(conjugateRing);

    const icoGeo = new THREE.IcosahedronGeometry(0.072, 0);
    const icoEdges = new THREE.EdgesGeometry(icoGeo);
    const icoMat = new THREE.MeshStandardMaterial({
      color: modes.math.color, metalness: 0.8, roughness: 0.22,
      emissive: modes.math.color, emissiveIntensity: 0.25, transparent: true, opacity: 0.9,
    });
    const icoWireMat = new THREE.LineBasicMaterial({ color: 0xfff3dd, transparent: true, opacity: 0.72 });
    const mathSatellites = [];
    for (let i = 0; i < 2; i += 1) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(icoGeo, icoMat);
      mesh.add(new THREE.LineSegments(icoEdges, icoWireMat));
      pivot.add(mesh);
      mathGroup.add(pivot);
      mathSatellites.push({ pivot, mesh, phase: i * Math.PI });
    }
    sculpture.add(mathGroup);
    disposableResources.push(keplerGeo, keplerMat, conjugateGeo, conjugateMat, icoGeo, icoEdges, icoMat, icoWireMat);
    modeAssemblies.math = { group: mathGroup, materials: [keplerMat, conjugateMat, icoMat, icoWireMat], satellites: mathSatellites, style: 'kepler' };

    // 3) LEARN: Lissajous wave orbital + 4 tetrahedron curiosity nodes.
    const learnGroup = new THREE.Group();
    learnGroup.rotation.set(0.35, -0.52, -0.28);
    const lissajousPts = buildModeOrbitPath('lissajous', { radius: 2.18, segments: 144 });
    const lissajousGeo = new THREE.BufferGeometry();
    lissajousGeo.setAttribute('position', new THREE.BufferAttribute(lissajousPts, 3));
    const lissajousMat = new THREE.LineBasicMaterial({ color: modes.learn.color, transparent: true, opacity: 0.5 });
    const lissajousLoop = new THREE.LineLoop(lissajousGeo, lissajousMat);
    learnGroup.add(lissajousLoop);

    const resonanceGeo = new THREE.RingGeometry(2.3, 2.31, 96);
    const resonanceMat = new THREE.MeshBasicMaterial({
      color: modes.learn.secondary, side: THREE.DoubleSide, transparent: true, opacity: 0.26,
    });
    const resonanceRing = new THREE.Mesh(resonanceGeo, resonanceMat);
    resonanceRing.rotation.set(-0.7, 0.35, 0.2);
    learnGroup.add(resonanceRing);

    const tetraGeo = new THREE.TetrahedronGeometry(0.068, 0);
    const tetraEdges = new THREE.EdgesGeometry(tetraGeo);
    const tetraMat = new THREE.MeshStandardMaterial({
      color: modes.learn.color, metalness: 0.65, roughness: 0.25,
      emissive: modes.learn.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9,
    });
    const tetraWireMat = new THREE.LineBasicMaterial({ color: 0xf1ecff, transparent: true, opacity: 0.78 });
    const learnSatellites = [];
    for (let i = 0; i < 4; i += 1) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(tetraGeo, tetraMat);
      mesh.add(new THREE.LineSegments(tetraEdges, tetraWireMat));
      pivot.add(mesh);
      learnGroup.add(pivot);
      learnSatellites.push({ pivot, mesh, phase: (i * Math.PI * 2) / 4 });
    }
    sculpture.add(learnGroup);
    disposableResources.push(lissajousGeo, lissajousMat, resonanceGeo, resonanceMat, tetraGeo, tetraEdges, tetraMat, tetraWireMat);
    modeAssemblies.learn = { group: learnGroup, materials: [lissajousMat, resonanceMat, tetraMat, tetraWireMat], satellites: learnSatellites, style: 'lissajous' };
  }
  buildModeAssemblies();

  // Procedural 3D orbital constellation starfield (THREE.Points + ShaderMaterial + faint filaments).
  const constellationData = buildConstellationPoints({
    count: compact ? 110 : 210,
    innerRadius: 2.65,
    outerRadius: 5.7,
    seed: 0x54617275,
  });
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(constellationData.positions, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(constellationData.sizes, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(constellationData.phases, 1));
  starGeo.setAttribute('aSpeed', new THREE.BufferAttribute(constellationData.speeds, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(constellationData.tints, 1));

  const starUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uColorA: { value: accent.clone() },
    uColorB: { value: secondaryAccent.clone() },
    uOpacity: { value: 0.72 },
  };
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STARFIELD_VERTEX_SHADER,
    fragmentShader: STARFIELD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const starfield = new THREE.Points(starGeo, starMaterial);
  const starfieldGroup = new THREE.Group();
  starfieldGroup.add(starfield);

  const filamentGeo = new THREE.BufferGeometry();
  filamentGeo.setAttribute('position', new THREE.BufferAttribute(constellationData.filamentPositions, 3));
  const filamentMat = new THREE.LineBasicMaterial({
    color: mode.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  starfieldGroup.add(new THREE.LineSegments(filamentGeo, filamentMat));
  scene.add(starfieldGroup);
  disposableResources.push(starGeo, starMaterial, filamentGeo, filamentMat);

  // Interactive pointer drag-to-orbit + scroll-linked camera parallax state.
  const pointer = new THREE.Vector2();
  const currentPointer = new THREE.Vector2();
  let targetOrbitYaw = 0;
  let targetOrbitPitch = 0;
  let currentOrbitYaw = 0;
  let currentOrbitPitch = 0;
  let targetScrollProgress = 0;
  let currentScrollProgress = 0;

  let inViewport = true;
  let lostContext = false;
  let destroyed = false;
  let frame = 0;
  let previousTime = performance.now();
  let elapsed = 0;
  let hasSize = false;
  let dirty = true;
  let pendingPointer = null;
  let previousWidth = 0;
  let previousHeight = 0;
  let previousRatio = 0;

  let dragActive = false;
  let dragPointerId = null;
  let dragPointerType = '';
  let dragStartX = 0;
  let dragStartY = 0;
  let dragLastX = 0;
  let dragLastY = 0;

  const interactiveSurface = container.parentElement || container;
  if (interactiveSurface?.style) interactiveSurface.style.touchAction = 'pan-y';

  function mayRender() {
    return !destroyed && !lostContext && !document.hidden && inViewport && hasSize;
  }
  function mayAnimate() { return mayRender() && !userPaused; }

  function updateAccentUniforms() {
    rim.color.copy(accent);
    orbitMaterial.color.copy(accent);
    beadMaterial.color.copy(accent);
    beadMaterial.emissive.copy(accent);
    filamentMat.color.copy(accent);
    tintedMetal.copy(baseMetal).lerp(accent, 0.22);
    metal.color.copy(tintedMetal);
    haloUniforms.uColorA.value.copy(accent);
    haloUniforms.uColorB.value.copy(secondaryAccent);
    cageUniforms.uColorA.value.copy(accent);
    cageUniforms.uColorB.value.copy(secondaryAccent);
    starUniforms.uColorA.value.copy(accent);
    starUniforms.uColorB.value.copy(secondaryAccent);
  }

  function updateModeSatellites(time) {
    for (const [name, assembly] of Object.entries(modeAssemblies)) {
      const weight = modeBlend[name];
      assembly.group.visible = weight > 0.01;
      if (!assembly.group.visible) continue;
      assembly.group.scale.setScalar(0.84 + 0.16 * weight);
      for (const mat of assembly.materials) {
        if (mat._baseOpacity === undefined) mat._baseOpacity = mat.opacity;
        mat.opacity = mat._baseOpacity * weight;
      }
      for (const sat of assembly.satellites) {
        const angle = sat.phase + time * (name === 'math' ? 0.34 : 0.26);
        const [sx, sy, sz] = evaluateSatellitePosition(assembly.style, angle, 2.18);
        sat.pivot.position.set(sx, sy, sz);
        sat.mesh.rotation.set(time * 0.55 + sat.phase, time * 0.72, 0);
      }
    }
  }

  function updateCamera() {
    const rig = computeCameraRig({
      aspect: camera.aspect || 1,
      fovDeg: camera.fov,
      scrollProgress: currentScrollProgress,
      orbitYaw: currentOrbitYaw,
      orbitPitch: currentOrbitPitch,
      pointerX: currentPointer.x,
      pointerY: currentPointer.y,
    });
    camera.position.set(rig.position[0], rig.position[1], rig.position[2]);
    camera.lookAt(0, 0, 0);
  }

  function settleMode() {
    accent.copy(mode.color);
    secondaryAccent.copy(mode.secondary);
    updateAccentUniforms();
    core.rotation.z = mode.z;
    for (const keyName of Object.keys(modeBlend)) {
      modeBlend[keyName] = keyName === selectedMode ? 1 : 0;
    }
    haloUniforms.uActivity.value = userPaused ? 0 : 1;
    cageUniforms.uActivity.value = userPaused ? 0 : 1;
    updateModeSatellites(elapsed);
    updateCamera();
  }
  settleMode();

  function paint() {
    if (!mayRender()) return;
    try {
      renderer.render(scene, camera);
      container.classList.add('scene-ready');
      container.dataset.sceneReady = 'true';
      interactiveSurface?.classList?.add('is-interactive');
    } catch {
      lostContext = true;
      canvas.style.opacity = '0';
      container.classList.remove('scene-ready');
      container.dataset.sceneReady = 'false';
      interactiveSurface?.classList?.remove('is-interactive');
    }
  }

  function animate(now) {
    frame = 0;
    if (!mayRender()) return;
    const animating = mayAnimate();
    if (dirty || (animating && now - previousTime >= frameInterval - 0.5)) {
      const delta = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      if (animating) {
        elapsed += delta;
        if (pendingPointer) {
          const bounds = container.getBoundingClientRect();
          if (bounds.width && bounds.height) {
            pointer.set(
              THREE.MathUtils.clamp(((pendingPointer.x - bounds.left) / bounds.width) * 2 - 1, -1, 1),
              THREE.MathUtils.clamp(((pendingPointer.y - bounds.top) / bounds.height) * 2 - 1, -1, 1),
            );
          }
          pendingPointer = null;
        }
        const smoothing = 1 - Math.exp(-delta * 4.5);
        const orbitSmoothing = 1 - Math.exp(-delta * 8);
        currentPointer.lerp(pointer, smoothing);
        currentOrbitYaw += (targetOrbitYaw - currentOrbitYaw) * orbitSmoothing;
        currentOrbitPitch += (targetOrbitPitch - currentOrbitPitch) * orbitSmoothing;
        currentScrollProgress += (targetScrollProgress - currentScrollProgress) * orbitSmoothing;

        accent.lerp(mode.color, 1 - Math.exp(-delta * 5));
        secondaryAccent.lerp(mode.secondary, 1 - Math.exp(-delta * 5));
        updateAccentUniforms();

        for (const keyName of Object.keys(modeBlend)) {
          const goal = keyName === selectedMode ? 1 : 0;
          modeBlend[keyName] += (goal - modeBlend[keyName]) * (1 - Math.exp(-delta * 6));
        }

        sculpture.rotation.x = currentPointer.y * 0.08;
        sculpture.rotation.y = currentPointer.x * 0.16;
        sculpture.position.y = Math.sin(elapsed * 0.45) * 0.055;
        core.rotation.x = 0.38 + Math.sin(elapsed * 0.2) * 0.08;
        core.rotation.y = -0.28 + elapsed * 0.095;
        core.rotation.z += (mode.z - core.rotation.z) * smoothing;
        orbits.rotation.z = elapsed * 0.025;
        starfieldGroup.rotation.y = -currentPointer.x * 0.06 - currentOrbitYaw * 0.25;
        starfieldGroup.rotation.x = -currentPointer.y * 0.04 - currentOrbitPitch * 0.25;

        haloUniforms.uTime.value = elapsed;
        haloUniforms.uActivity.value = 1;
        cageUniforms.uTime.value = elapsed;
        cageUniforms.uActivity.value = 1;
        starUniforms.uTime.value = elapsed;

        updateModeSatellites(elapsed);
        updateCamera();
      }
      paint();
      dirty = false;
    }
    if (mayAnimate()) frame = requestAnimationFrame(animate);
  }

  function synchronize() {
    if (!mayRender()) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    dirty = true;
    if (!frame) {
      previousTime = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }

  function resize() {
    if (destroyed) return;
    const { width, height } = container.getBoundingClientRect();
    hasSize = width > 0 && height > 0;
    if (!hasSize) { synchronize(); return; }
    const pixelBudget = compact ? 600_000 : 1_500_000;
    const ratio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5,
      Math.sqrt(pixelBudget / (width * height)));
    if (width === previousWidth && height === previousHeight && ratio === previousRatio) return;
    previousWidth = width; previousHeight = height; previousRatio = ratio;
    camera.aspect = width / height;
    starUniforms.uPixelRatio.value = ratio;
    updateCamera();
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    synchronize();
    if (mayRender()) { paint(); dirty = false; }
  }

  function updateCompact() {
    const next = compactQuery.matches || limitedHardware;
    if (next === compact) return;
    compact = next;
    coreGeometries.forEach(geometry => geometry.dispose());
    haloGeometries.forEach(geometry => geometry.dispose());
    cageGeometries.forEach(geometry => geometry.dispose());
    coreGeometries.clear();
    haloGeometries.clear();
    cageGeometries.clear();
    core.geometry = coreGeometryFor(selectedMode);
    haloMesh.geometry = haloGeometryFor(selectedMode);
    cageLines.geometry = cageGeometryFor(selectedMode);
    synchronize();
    resize();
  }

  let resolutionQuery;
  function watchResolution() {
    resolutionQuery?.removeEventListener('change', resolutionChanged);
    resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolutionQuery.addEventListener('change', resolutionChanged);
  }
  function resolutionChanged() { watchResolution(); resize(); }

  function onScroll() {
    if (destroyed || userPaused) return;
    const y = typeof window.scrollY === 'number' ? window.scrollY : 0;
    const heroHeight = interactiveSurface?.getBoundingClientRect?.().height || previousHeight || 800;
    targetScrollProgress = clamp(y / Math.max(heroHeight, 1), 0, 1);
    container.dataset.scrollParallax = targetScrollProgress.toFixed(3);
  }

  function startDrag(event) {
    if (!mayAnimate()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragActive = true;
    dragPointerId = event.pointerId ?? 0;
    dragPointerType = event.pointerType || 'mouse';
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
  }

  function move(event) {
    if (!mayAnimate()) return;
    if (dragActive && (event.pointerId ?? 0) === dragPointerId) {
      const dx = event.clientX - dragLastX;
      const dy = event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      targetOrbitYaw = clamp(targetOrbitYaw + dx * 0.0065, -1.65, 1.65);
      targetOrbitPitch = clamp(targetOrbitPitch + dy * 0.0055, -0.78, 0.78);
      if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 4) {
        interactiveSurface?.classList?.add('is-dragging');
        container.dataset.orbitYaw = targetOrbitYaw.toFixed(3);
        container.dataset.orbitPitch = targetOrbitPitch.toFixed(3);
      }
      return;
    }
    if (event.pointerType === 'touch') return;
    pendingPointer = { x: event.clientX, y: event.clientY };
  }

  function endDrag(event) {
    if (!dragActive) return;
    if (event?.pointerId !== undefined && dragPointerId !== null && event.pointerId !== dragPointerId) return;
    dragActive = false;
    dragPointerId = null;
    dragPointerType = '';
    interactiveSurface?.classList?.remove('is-dragging');
  }

  function leave() {
    pendingPointer = null;
    pointer.set(0, 0);
    if (dragPointerType === 'touch') endDrag();
  }

  function resetOrbit() {
    if (!mayAnimate()) return;
    targetOrbitYaw = 0;
    targetOrbitPitch = 0;
    container.dataset.orbitYaw = '0.000';
    container.dataset.orbitPitch = '0.000';
  }

  function contextLost(event) {
    event.preventDefault();
    lostContext = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    canvas.style.opacity = '0';
    container.classList.remove('scene-ready');
    container.dataset.sceneReady = 'false';
    interactiveSurface?.classList?.remove('is-interactive', 'is-dragging');
  }

  function contextRestored() {
    lostContext = false;
    canvas.style.opacity = '';
    buildEnvironment();
    synchronize();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(entries => {
    inViewport = entries[0]?.isIntersecting ?? true;
    synchronize();
  }, { rootMargin: '100px' });
  intersectionObserver.observe(container);

  if (typeof interactiveSurface?.addEventListener === 'function') {
    interactiveSurface.addEventListener('pointerdown', startDrag, { passive: true });
    interactiveSurface.addEventListener('pointermove', move, { passive: true });
    interactiveSurface.addEventListener('pointerleave', leave, { passive: true });
    interactiveSurface.addEventListener('dblclick', resetOrbit);
  }
  window.addEventListener?.('pointermove', move, { passive: true });
  window.addEventListener?.('pointerup', endDrag, { passive: true });
  window.addEventListener?.('pointercancel', endDrag, { passive: true });
  window.addEventListener?.('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', synchronize);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  compactQuery.addEventListener('change', updateCompact);
  watchResolution();
  resize();
  dirty = false;

  return {
    setMode(name) {
      if (destroyed || !Object.hasOwn(modes, name) || name === selectedMode) return;
      selectedMode = name;
      mode = modes[name];
      core.geometry = coreGeometryFor(name);
      haloMesh.geometry = haloGeometryFor(name);
      cageLines.geometry = cageGeometryFor(name);
      if (!mayAnimate()) settleMode();
      synchronize();
    },
    setPaused(nextPaused) {
      if (destroyed || userPaused === Boolean(nextPaused)) return;
      userPaused = Boolean(nextPaused);
      if (userPaused) {
        endDrag();
        settleMode();
      } else {
        haloUniforms.uActivity.value = 1;
        cageUniforms.uActivity.value = 1;
      }
      synchronize();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (typeof interactiveSurface?.removeEventListener === 'function') {
        interactiveSurface.removeEventListener('pointerdown', startDrag);
        interactiveSurface.removeEventListener('pointermove', move);
        interactiveSurface.removeEventListener('pointerleave', leave);
        interactiveSurface.removeEventListener('dblclick', resetOrbit);
        interactiveSurface.classList?.remove('is-interactive', 'is-dragging');
      }
      window.removeEventListener?.('pointermove', move);
      window.removeEventListener?.('pointerup', endDrag);
      window.removeEventListener?.('pointercancel', endDrag);
      window.removeEventListener?.('scroll', onScroll);
      document.removeEventListener('visibilitychange', synchronize);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      compactQuery.removeEventListener('change', updateCompact);
      resolutionQuery.removeEventListener('change', resolutionChanged);
      coreGeometries.forEach(geometry => geometry.dispose());
      haloGeometries.forEach(geometry => geometry.dispose());
      cageGeometries.forEach(geometry => geometry.dispose());
      disposableResources.forEach(resource => resource.dispose());
      environment?.dispose();
      renderer.dispose();
      canvas.remove();
      container.classList.remove('scene-ready');
      delete container.dataset.sceneReady;
      delete container.dataset.orbitYaw;
      delete container.dataset.orbitPitch;
      delete container.dataset.scrollParallax;
    },
  };
}
