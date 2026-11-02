import * as THREE from './vendor/three.module.js';

/**
 * A procedural, locally rendered sculpture: no model or remote image requests.
 * initScene(element) -> { setMode('build'|'math'|'learn'), setPaused(boolean), destroy() }
 * The element receives .scene-ready only after a successful render. Its existing
 * CSS fallback remains available if WebGL cannot start or its context is lost.
 */
export function initScene(container) {
  const noop = { setMode() {}, setPaused() {}, destroy() {} };
  if (!container) return noop;

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
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(0, 0, 7.5);

  // Large white studio panels make the chrome legible against the dark page.
  // Radiance above 1 is preserved by PMREM's floating-point render target.
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment;
  try {
    environment = pmrem.fromScene(studio, 0.025, 0.1, 50);
    scene.environment = environment.texture;
  } catch {
    // Directional lights also make a readable object on restricted renderers.
  } finally {
    pmrem.dispose();
    studioResources.forEach(resource => resource.dispose());
  }

  const key = new THREE.DirectionalLight(0xf6f4ef, 3.2);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8be9e4, 3);
  rim.position.set(3, 1, -3);
  scene.add(rim, new THREE.AmbientLight(0xcbd3de, 0.6));

  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const modes = {
    build: { color: new THREE.Color('#8be9e4'), p: 2, q: 3, z: -0.18 },
    math: { color: new THREE.Color('#eac18a'), p: 3, q: 4, z: 0.25 },
    learn: { color: new THREE.Color('#b2a0ff'), p: 2, q: 5, z: -0.38 },
  };
  const geometries = Object.fromEntries(Object.entries(modes).map(([name, mode]) => [
    name, new THREE.TorusKnotGeometry(1.03, name === 'learn' ? 0.205 : 0.25, 256, 32, mode.p, mode.q),
  ]));
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xd8e3e5,
    metalness: 0.94,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 0.22,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 340,
    envMapIntensity: 1.1,
  });
  const core = new THREE.Mesh(geometries.build, metal);
  core.rotation.set(0.38, -0.28, -0.18);
  sculpture.add(core);

  const orbits = new THREE.Group();
  const orbitMaterial = new THREE.MeshBasicMaterial({
    color: modes.build.color, transparent: true, opacity: 0.32,
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
    color: modes.build.color, metalness: 0.5, roughness: 0.25,
    emissive: modes.build.color, emissiveIntensity: 0.35,
  });
  const beads = [];
  for (let i = 0; i < 3; i += 1) {
    const bead = new THREE.Mesh(beadGeometry, beadMaterial);
    const angle = i * Math.PI * 2 / 3 + 0.45;
    bead.position.set(Math.cos(angle) * 2.02, Math.sin(angle) * 2.02, 0);
    orbitA.add(bead);
    beads.push(bead);
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = new THREE.Vector2();
  const currentPointer = new THREE.Vector2();
  const accent = modes.build.color.clone();
  const tintedMetal = new THREE.Color();
  const baseMetal = new THREE.Color(0xd8e3e5);
  let mode = modes.build;
  let userPaused = false;
  let inViewport = true;
  let lostContext = false;
  let destroyed = false;
  let frame = 0;
  let previousTime = performance.now();
  let elapsed = 0;
  let hasSize = false;

  function mayAnimate() {
    return !destroyed && !lostContext && !userPaused && !motionQuery.matches &&
      !document.hidden && inViewport && hasSize;
  }

  function paint() {
    if (destroyed || lostContext || !hasSize) return;
    try {
      renderer.render(scene, camera);
      container.classList.add('scene-ready');
      container.dataset.sceneReady = 'true';
    } catch {
      lostContext = true;
      canvas.style.opacity = '0';
      container.classList.remove('scene-ready');
      container.dataset.sceneReady = 'false';
    }
  }

  function animate(now) {
    frame = 0;
    if (!mayAnimate()) return;
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    elapsed += delta;
    const smoothing = 1 - Math.exp(-delta * 4);
    currentPointer.lerp(pointer, smoothing);
    accent.lerp(mode.color, 1 - Math.exp(-delta * 5));
    rim.color.copy(accent);
    orbitMaterial.color.copy(accent);
    beadMaterial.color.copy(accent);
    beadMaterial.emissive.copy(accent);
    tintedMetal.copy(baseMetal).lerp(accent, 0.2);
    metal.color.copy(tintedMetal);
    sculpture.rotation.x = currentPointer.y * 0.08;
    sculpture.rotation.y = currentPointer.x * 0.16;
    sculpture.position.y = Math.sin(elapsed * 0.45) * 0.055;
    core.rotation.x = 0.38 + Math.sin(elapsed * 0.2) * 0.08;
    core.rotation.y = -0.28 + elapsed * 0.095;
    core.rotation.z += (mode.z - core.rotation.z) * smoothing;
    orbits.rotation.z = elapsed * 0.025;
    paint();
    if (mayAnimate()) frame = requestAnimationFrame(animate);
  }

  function synchronize() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (destroyed) return;
    if (mayAnimate()) {
      previousTime = performance.now();
      frame = requestAnimationFrame(animate);
    } else {
      paint();
    }
  }

  function resize() {
    if (destroyed) return;
    const { width, height } = container.getBoundingClientRect();
    hasSize = width > 0 && height > 0;
    if (!hasSize) return;
    camera.aspect = width / height;
    camera.position.z = 2.22 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) /
      Math.min(camera.aspect, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    paint();
    synchronize();
  }

  function move(event) {
    if (motionQuery.matches || userPaused) return;
    const bounds = container.getBoundingClientRect();
    if (bounds.width && bounds.height) {
      pointer.set(
        THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1),
      );
    }
  }
  function leave() { pointer.set(0, 0); }
  function contextLost(event) {
    event.preventDefault();
    lostContext = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    canvas.style.opacity = '0';
    container.classList.remove('scene-ready');
    container.dataset.sceneReady = 'false';
  }
  function contextRestored() {
    // A lost PMREM target cannot be reliably rebuilt from its disposed source.
    // Keep the lightweight fallback; reinitialization is an explicit caller action.
    lostContext = true;
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(entries => {
    inViewport = entries[0]?.isIntersecting ?? true;
    synchronize();
  }, { rootMargin: '100px' });
  intersectionObserver.observe(container);
  container.addEventListener('pointermove', move, { passive: true });
  container.addEventListener('pointerleave', leave, { passive: true });
  document.addEventListener('visibilitychange', synchronize);
  motionQuery.addEventListener('change', synchronize);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  resize();

  return {
    setMode(name) {
      if (destroyed || !Object.hasOwn(modes, name)) return;
      mode = modes[name];
      core.geometry = geometries[name];
      if (!mayAnimate()) {
        accent.copy(mode.color);
        rim.color.copy(accent);
        orbitMaterial.color.copy(accent);
        beadMaterial.color.copy(accent);
        beadMaterial.emissive.copy(accent);
        metal.color.copy(baseMetal).lerp(accent, 0.2);
        core.rotation.z = mode.z;
      }
      paint();
      synchronize();
    },
    setPaused(paused) {
      userPaused = Boolean(paused);
      synchronize();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', synchronize);
      motionQuery.removeEventListener('change', synchronize);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      Object.values(geometries).forEach(geometry => geometry.dispose());
      [metal, orbitGeometry, orbitMaterial, beadGeometry, beadMaterial].forEach(resource => resource.dispose());
      environment?.dispose();
      renderer.dispose();
      canvas.remove();
      container.classList.remove('scene-ready');
      delete container.dataset.sceneReady;
    },
  };
}
