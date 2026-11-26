/**
 * Tactile motion choreography for cards, feature panels, and scroll telemetry.
 * Dynamically imported by app.js only when motion is allowed; pauses cleanly
 * under reduced-motion preferences, open dialogs, or the hero pause toggle.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const MODE_ACCENTS = {
  build: '#8be9e4',
  math: '#eac18a',
  learn: '#b2a0ff',
};

const SECTION_LABELS = [
  ['#contact', '05 / CONTACT'],
  ['#experience', '04 / LEARNING'],
  ['#about', '02 / ABOUT'],
  ['#work', '01 / WORK'],
  ['#top', '00 / HERO'],
];

export function initMotion3D({ paused = false, mode = 'build' } = {}) {
  let userPaused = Boolean(paused);
  let destroyed = false;
  let rafId = 0;
  let targetScroll = 0;
  let smoothScroll = 0;

  const root = document.documentElement;
  root.style.setProperty('--accent', MODE_ACCENTS[mode] || MODE_ACCENTS.build);

  // Assign deterministic stagger indices to reveal items.
  const revealItems = [...document.querySelectorAll('.project, .capability, .timeline-item')];
  revealItems.forEach((el, index) => {
    el.style.setProperty('--stagger', String(index % 4));
  });

  // Scroll progress hairline + section telemetry indicator.
  const progressHost = document.createElement('div');
  progressHost.className = 'scroll-progress';
  progressHost.setAttribute('aria-hidden', 'true');
  const progressBar = document.createElement('span');
  progressBar.className = 'scroll-progress-bar';
  progressHost.appendChild(progressBar);

  const telemetry = document.createElement('div');
  telemetry.className = 'scroll-telemetry';
  telemetry.setAttribute('aria-hidden', 'true');
  telemetry.innerHTML = '<span class="telemetry-dot"></span><span class="telemetry-label">00 / HERO</span><span class="telemetry-pct">00%</span>';
  const telemetryLabel = telemetry.querySelector('.telemetry-label');
  const telemetryPct = telemetry.querySelector('.telemetry-pct');

  document.body.append(progressHost, telemetry);

  const tiltTargets = [...document.querySelectorAll('.project-visual, .about-art, .teaching-panel')];
  const tiltStates = new Map();
  for (const el of tiltTargets) {
    tiltStates.set(el, {
      rx: 0,
      ry: 0,
      lift: 0,
      gx: 50,
      gy: 50,
      go: 0,
      tx: 0,
      ty: 0,
      tLift: 0,
      tgx: 50,
      tgy: 50,
      tgo: 0,
      active: false,
    });
  }

  const magneticArrow = document.querySelector('.contact-arrow');
  const arrowState = { x: 0, y: 0, tx: 0, ty: 0, active: false };

  function resetElementProps(el) {
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
    el.style.removeProperty('--lift-y');
    el.style.removeProperty('--glare-x');
    el.style.removeProperty('--glare-y');
    el.style.removeProperty('--glare-o');
    delete el.dataset.tiltActive;
  }

  function clearAllMotion() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    root.classList.remove('motion-3d');
    for (const [el, state] of tiltStates) {
      state.rx = 0;
      state.ry = 0;
      state.lift = 0;
      state.go = 0;
      state.tx = 0;
      state.ty = 0;
      state.tLift = 0;
      state.tgo = 0;
      state.active = false;
      resetElementProps(el);
    }
    if (magneticArrow) {
      arrowState.x = 0;
      arrowState.y = 0;
      arrowState.tx = 0;
      arrowState.ty = 0;
      arrowState.active = false;
      magneticArrow.style.removeProperty('--mag-x');
      magneticArrow.style.removeProperty('--mag-y');
    }
  }

  function updateSectionTelemetry(ratio) {
    const pct = Math.round(clamp(ratio, 0, 1) * 100);
    telemetryPct.textContent = `${String(pct).padStart(2, '0')}%`;
    root.dataset.scrollProgress = clamp(ratio, 0, 1).toFixed(3);
    telemetry.classList.toggle('visible', !userPaused && window.scrollY > 80);

    const probeY = window.innerHeight * 0.42;
    let activeLabel = '00 / HERO';
    for (const [selector, label] of SECTION_LABELS) {
      const node = document.querySelector(selector);
      if (!node) continue;
      if (node.getBoundingClientRect().top <= probeY) {
        activeLabel = label;
        break;
      }
    }
    telemetryLabel.textContent = activeLabel;
  }

  function readScrollTarget() {
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    targetScroll = clamp(window.scrollY / maxScroll, 0, 1);
  }

  function step() {
    rafId = 0;
    if (destroyed || userPaused) return;

    let keepGoing = false;
    readScrollTarget();
    const scrollDelta = targetScroll - smoothScroll;
    if (Math.abs(scrollDelta) > 0.0008) {
      smoothScroll += scrollDelta * 0.16;
      keepGoing = true;
    } else {
      smoothScroll = targetScroll;
    }
    root.style.setProperty('--scroll-progress', smoothScroll.toFixed(4));
    updateSectionTelemetry(smoothScroll);

    for (const [el, s] of tiltStates) {
      const dx = s.tx - s.rx;
      const dy = s.ty - s.ry;
      const dl = s.tLift - s.lift;
      const dgo = s.tgo - s.go;
      if (s.active || Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02 || Math.abs(dl) > 0.05 || Math.abs(dgo) > 0.004) {
        s.rx += dx * 0.16;
        s.ry += dy * 0.16;
        s.lift += dl * 0.16;
        s.gx += (s.tgx - s.gx) * 0.2;
        s.gy += (s.tgy - s.gy) * 0.2;
        s.go += dgo * 0.16;
        el.style.setProperty('--tilt-x', `${s.rx.toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${s.ry.toFixed(2)}deg`);
        el.style.setProperty('--lift-y', `${s.lift.toFixed(2)}px`);
        el.style.setProperty('--glare-x', `${s.gx.toFixed(1)}%`);
        el.style.setProperty('--glare-y', `${s.gy.toFixed(1)}%`);
        el.style.setProperty('--glare-o', s.go.toFixed(3));
        keepGoing = true;
      }
    }

    if (magneticArrow) {
      const mx = arrowState.tx - arrowState.x;
      const my = arrowState.ty - arrowState.y;
      if (arrowState.active || Math.abs(mx) > 0.04 || Math.abs(my) > 0.04) {
        arrowState.x += mx * 0.2;
        arrowState.y += my * 0.2;
        magneticArrow.style.setProperty('--mag-x', `${arrowState.x.toFixed(2)}px`);
        magneticArrow.style.setProperty('--mag-y', `${arrowState.y.toFixed(2)}px`);
        keepGoing = true;
      }
    }

    if (keepGoing) rafId = requestAnimationFrame(step);
  }

  function wake() {
    if (destroyed || userPaused || rafId) return;
    rafId = requestAnimationFrame(step);
  }

  function handleCardMove(event) {
    if (destroyed || userPaused || event.pointerType === 'touch') return;
    const el = event.currentTarget;
    const state = tiltStates.get(el);
    if (!state) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const isPanel = el.classList.contains('teaching-panel');
    const maxTilt = isPanel ? 2.4 : 5.2;
    state.active = true;
    state.tx = (0.5 - ny) * maxTilt * 2;
    state.ty = (nx - 0.5) * maxTilt * 2;
    state.tLift = isPanel ? -2 : -4;
    state.tgx = nx * 100;
    state.tgy = ny * 100;
    state.tgo = 1;
    el.dataset.tiltActive = 'true';
    wake();
  }

  function handleCardLeave(event) {
    const el = event.currentTarget;
    const state = tiltStates.get(el);
    if (!state) return;
    state.active = false;
    state.tx = 0;
    state.ty = 0;
    state.tLift = 0;
    state.tgo = 0;
    delete el.dataset.tiltActive;
    wake();
  }

  function handleArrowMove(event) {
    if (destroyed || userPaused || event.pointerType === 'touch' || !magneticArrow) return;
    const rect = magneticArrow.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const ny = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    arrowState.active = true;
    arrowState.tx = nx * 5;
    arrowState.ty = ny * 5;
    wake();
  }

  function handleArrowLeave() {
    arrowState.active = false;
    arrowState.tx = 0;
    arrowState.ty = 0;
    wake();
  }

  function handleScroll() {
    if (destroyed || userPaused) return;
    readScrollTarget();
    wake();
  }

  for (const el of tiltTargets) {
    el.addEventListener('pointermove', handleCardMove, { passive: true });
    el.addEventListener('pointerleave', handleCardLeave, { passive: true });
  }
  magneticArrow?.addEventListener('pointermove', handleArrowMove, { passive: true });
  magneticArrow?.addEventListener('pointerleave', handleArrowLeave, { passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });

  if (!userPaused) {
    root.classList.add('motion-3d');
    readScrollTarget();
    smoothScroll = targetScroll;
    root.style.setProperty('--scroll-progress', smoothScroll.toFixed(4));
    updateSectionTelemetry(smoothScroll);
  } else {
    clearAllMotion();
  }

  return {
    setMode(nextMode) {
      if (destroyed) return;
      root.style.setProperty('--accent', MODE_ACCENTS[nextMode] || MODE_ACCENTS.build);
    },
    setPaused(nextPaused) {
      if (destroyed) return;
      const next = Boolean(nextPaused);
      if (next === userPaused) return;
      userPaused = next;
      if (userPaused) {
        clearAllMotion();
        telemetry.classList.remove('visible');
      } else {
        root.classList.add('motion-3d');
        readScrollTarget();
        smoothScroll = targetScroll;
        root.style.setProperty('--scroll-progress', smoothScroll.toFixed(4));
        updateSectionTelemetry(smoothScroll);
        wake();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearAllMotion();
      for (const el of tiltTargets) {
        el.removeEventListener('pointermove', handleCardMove);
        el.removeEventListener('pointerleave', handleCardLeave);
      }
      magneticArrow?.removeEventListener('pointermove', handleArrowMove);
      magneticArrow?.removeEventListener('pointerleave', handleArrowLeave);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      progressHost.remove();
      telemetry.remove();
      delete root.dataset.scrollProgress;
    },
  };
}
