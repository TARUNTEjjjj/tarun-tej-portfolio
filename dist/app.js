import { sceneRequiresConsent, projectKeyFromURL, projectURL } from './ui-state.js';
const $ = selector => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let mode = 'build';
let sculpture;
const modeLabels = {
  build: ['01 / THE ART OF BUILDING', '#8be9e4'],
  math: ['02 / THE BEAUTY OF REASONING', '#eac18a'],
  learn: ['03 / THE JOY OF EXPLORING', '#b2a0ff'],
};
function updateMotionButton() {
  const button = $('.motion-toggle');
  button.setAttribute('aria-pressed', String(paused));
  button.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
}
updateMotionButton();
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#scene-label').textContent = modeLabels[mode][0];
  $('.hero h1 em').style.color = modeLabels[mode][1];
  sculpture?.setMode(mode);
}));
$('.motion-toggle').addEventListener('click', () => { paused = !paused; sculpture?.setPaused(paused); updateMotionButton(); });
reducedMotion.addEventListener('change', event => { paused = event.matches; sculpture?.setPaused(paused); updateMotionButton(); });
const sceneContainer = $('#hero-scene');
const sceneButton = $('.scene-enable');
const sceneStatus = $('#scene-status');
const narrowScreen = window.matchMedia('(max-width: 760px)');
let sceneLoading = false;
let sceneDisposed = false;
let sceneVisible = false;
let sceneIdle;
let sceneObserver;
function needsSceneConsent() {
  return sceneRequiresConsent({ reducedMotion: reducedMotion.matches, narrow: narrowScreen.matches,
    saveData: navigator.connection?.saveData, effectiveType: navigator.connection?.effectiveType });
}
function sceneState(state, message) {
  sceneContainer.dataset.sceneState = state;
  if (sceneStatus) sceneStatus.textContent = message;
  if (sceneButton) {
    sceneButton.hidden = state === 'ready';
    sceneButton.disabled = state === 'loading' || state === 'fallback';
    sceneButton.textContent = state === 'loading' ? 'Loading 3D…' : state === 'fallback' ? 'Static artwork active' : 'Enable 3D';
  }
  $('.motion-toggle').disabled = state !== 'ready';
}
sceneState('deferred', needsSceneConsent() ? 'Lightweight artwork. Enable 3D to explore the sculpture.' : 'Interactive sculpture loads when you view it.');
async function loadScene() {
  if (sculpture || sceneLoading || sceneDisposed) return;
  sceneLoading = true;
  sceneState('loading', 'Preparing the interactive sculpture.');
  try {
    const { initScene } = await import('./scene.js');
    if (sceneDisposed) return;
    sculpture = initScene(sceneContainer, { mode, paused });
    sculpture.setMode(mode); sculpture.setPaused(paused);
    // scene.js marks 'false' on every failure; an unset value means the renderer exists but its first paint was skipped (hidden tab).
    const ready = sceneContainer.dataset.sceneReady !== 'false';
    sceneState(ready ? 'ready' : 'fallback', ready ? 'Interactive sculpture ready. Choose a theme or pause the motion.' : '3D is unavailable here. The lightweight artwork remains visible.');
  } catch {
    sceneContainer.dataset.sceneReady = 'false';
    sceneState('fallback', '3D could not load. All projects and contact links remain available.');
  } finally { sceneLoading = false; }
}
function scheduleScene() {
  if (sceneIdle || sculpture || sceneLoading || sceneDisposed || !sceneVisible || document.hidden || needsSceneConsent() || document.readyState !== 'complete') return;
  const start = () => {
    sceneIdle = null;
    // Recheck after idle: scrolling, data preferences or visibility may have changed.
    if (sceneVisible && !document.hidden && !needsSceneConsent()) void loadScene();
  };
  sceneIdle = 'requestIdleCallback' in window ? window.requestIdleCallback(start, { timeout: 1800 }) : window.setTimeout(start, 200);
}
sceneButton?.addEventListener('click', () => { void loadScene(); });
// scene.js marks a ready scene 'false' after a lost context or failed paint; move it to the fallback state.
new MutationObserver(() => {
  if (sceneContainer.dataset.sceneReady === 'false' && sceneContainer.dataset.sceneState === 'ready') sceneState('fallback', '3D is unavailable here. The lightweight artwork remains visible.');
}).observe(sceneContainer, { attributeFilter: ['data-scene-ready'] });
if ('IntersectionObserver' in window) {
  sceneObserver = new IntersectionObserver(entries => {
    sceneVisible = entries.some(entry => entry.isIntersecting);
    scheduleScene();
  }, { threshold: 0.05 });
  sceneObserver.observe(sceneContainer);
} else { sceneVisible = true; }
if (document.readyState === 'complete') scheduleScene();
else window.addEventListener('load', scheduleScene, { once: true });
document.addEventListener('visibilitychange', scheduleScene);
narrowScreen.addEventListener('change', scheduleScene);
reducedMotion.addEventListener('change', scheduleScene);
navigator.connection?.addEventListener?.('change', scheduleScene);
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  sceneDisposed = true;
  sceneObserver?.disconnect();
  if (sceneIdle) {
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(sceneIdle);
    else clearTimeout(sceneIdle);
  }
  sculpture?.destroy();
});


const menuToggle = $('.menu-toggle');
const navigation = $('#main-navigation');
function closeMenu({ restoreFocus = false } = {}) {
  const wasOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  navigation.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  if (restoreFocus && wasOpen) menuToggle.focus();
}
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('open', expanded);
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu({ restoreFocus: true });
});
document.addEventListener('pointerdown', event => {
  if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});
document.addEventListener('focusin', event => {
  if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});
narrowScreen.addEventListener('change', event => { if (!event.matches) closeMenu(); });


const projects = {
  axiom: {
    label: 'WEB DEVELOPMENT / MATHEMATICS', title: 'Axiom SAT Math',
    lead: 'A focused place to practise SAT-style maths and understand the reasoning behind an answer.',
    built: 'An interactive browser application using HTML, CSS and JavaScript. It combines reproducible question generation, timed practice, worked review and progress saved on the learner’s device.',
    details: ['Seeded mathematical templates make generated questions reproducible.', 'Worked review connects an answer to its reasoning.', 'Local progress and recoverable data keep the experience independent of an account.'],
    note: 'An independent SAT-style practice project. The questions are generated from mathematical templates; this is not an official College Board product.',
    links: [['Try the website', 'https://axiom-sat.pages.dev/'], ['Explore the code', 'https://github.com/TARUNTEjjjj/axiom-sat'], ['Engineering notes', 'https://github.com/TARUNTEjjjj/axiom-sat/blob/main/docs/engineering.md']],
  },
  forge: {
    label: 'INTERACTIVE WEB / 3D LEARNING', title: 'Forge',
    lead: 'A learning experience that gives technical subjects a place on an interactive 3D map.',
    built: 'Built with React, TypeScript and Vite, Forge brings together guided Python, Git, algorithms and software engineering lessons with browser-based coding practice.',
    details: ['A 3D learning map provides a visual route through the material.', 'Guided exercises connect explanations to hands-on practice.', 'The interface is built around exploring a topic and returning to the next step.'],
    note: 'The artwork in this portfolio is an original visual interpretation of the project. Follow the website link to explore the actual learning experience.',
    links: [['Explore Forge', 'https://forge-learning-academy.pages.dev/'], ['Explore the code', 'https://github.com/TARUNTEjjjj/forge-learning-academy']],
  },
  math: {
    label: 'C++20 / EXACT ARITHMETIC', title: 'AxiomMath',
    lead: 'A small mathematical tool built around a simple promise: keep fractions exact, and make the limits explicit.',
    built: 'A C++20 rational-arithmetic and expression-parsing project, with a canonical fraction representation, bounded integer arithmetic and explicit overflow handling.',
    details: ['Engineering notes explain the arithmetic bounds and expression grammar.', 'Differential checks compare results with Python’s fractions.Fraction.', 'Property and boundary tests explore the behaviour of the implementation.'],
    note: 'Finite tests provide evidence about correctness, not a proof for every possible input. The supported arithmetic range and limitations are documented.',
    links: [['Explore the code', 'https://github.com/TARUNTEjjjj/axiom-math'], ['Arithmetic reasoning', 'https://github.com/TARUNTEjjjj/axiom-math/blob/main/docs/engineering.md'], ['Verification', 'https://github.com/TARUNTEjjjj/axiom-math/blob/main/docs/verification.md']],
  },
  pocket: {
    label: 'C++20 / PERSISTENT STORAGE', title: 'PocketKV',
    lead: 'A compact key-value store that makes persistence, recovery and performance tradeoffs visible.',
    built: 'A C++20 persistent store using an append-only log, an in-memory index, checksums and file locking. Its documentation covers the storage format, recovery behaviour and verification.',
    details: ['A reproducible benchmark varies overwrite history while holding live-key count fixed.', 'Raw measurements, timing boundaries and validation checks accompany the report.', 'Small local workloads show why reopening a longer log can cost more while indexed reads remain comparatively stable.'],
    note: 'The benchmark describes small, warm-cache local workloads. It is not a general performance guarantee or a certification of power-loss durability.',
    links: [['Explore the code', 'https://github.com/TARUNTEjjjj/pocketkv'], ['Read the benchmark', 'https://github.com/TARUNTEjjjj/pocketkv/blob/main/docs/benchmarks.md'], ['Storage design', 'https://github.com/TARUNTEjjjj/pocketkv/blob/main/docs/engineering.md']],
  },
  storm: {
    label: 'WEB DEVELOPMENT / WEATHER AWARENESS', title: 'StormSignal',
    lead: 'Weather information designed to stay useful when connectivity becomes unreliable.',
    built: 'A weather situational-awareness website with satellite imagery, forecast information, official alert sources and a lightweight mode for limited connections.',
    details: ['Official local weather sources provide context for supported locations.', 'Satellite views complement forecasts with a view of changing conditions.', 'Offline preparation and reduced-data features help visitors retain useful information when a connection drops.'],
    note: 'Availability and freshness vary by location and source. Cached information can become outdated; follow current instructions from local emergency authorities.',
    links: [['Explore StormSignal', 'https://stormsignal-weather.gardenroot512.chatgpt.site/'], ['Explore the code', 'https://github.com/TARUNTEjjjj/stormsignal']],
  },
  neural: {
    label: 'PYTHON / NEURAL NETWORKS', title: 'Neural Math Lab',
    lead: 'An inspectable neural network that connects matrix operations, derivatives and actual model predictions.',
    built: 'A NumPy learning project with manual backpropagation, SGD and Adam optimizers, and self-contained reports for XOR, moons and circles experiments.',
    details: ['Interactive reports replay saved checkpoints and trace a point through each layer.', 'Training-only preprocessing and validation selection keep held-out test examples separate.', '105 Python tests and 5 JavaScript tests check the mathematics, saved models, reports and browser prediction agreement.'],
    note: 'A private learning project. Recorded results describe particular synthetic datasets and seeds; they are not a guarantee of real-world accuracy. The source remains private.',
    links: [['Ask about the project', 'mailto:avulataruntej123@gmail.com?subject=Neural%20Math%20Lab']],
  },

};
const dialog = $('#project-dialog');
let dialogTrigger;
let currentProject;
let previousBodyOverflow = '';
function showProject(key, trigger) {
  const project = projects[key];
  if (!project) return;
  dialogTrigger = trigger || document.querySelector(`.project-visual[data-project="${key}"]`);
  currentProject = key;
  // Authored local content only. The URL selects an allowlisted project, never HTML.
  $('#dialog-content').innerHTML = `<p class="dialog-eyebrow">${project.label}</p><h2 id="dialog-title">${project.title}</h2><p class="dialog-lead">${project.lead}</p><div class="dialog-section"><h3>What I built</h3><p>${project.built}</p></div><div class="dialog-section"><h3>Inside the project</h3><ul>${project.details.map(detail => `<li>${detail}</li>`).join('')}</ul></div><div class="dialog-section"><p>${project.note}</p></div><div class="dialog-links">${project.links.map(([label, url]) => `<a class="text-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`).join('')}</div><button class="copy-project-link" type="button">Copy project link</button><p class="project-link-status" aria-live="polite"></p>`;
  if (!dialog.open) {
    previousBodyOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }
  dialog.scrollTop = 0;
  $('.dialog-close').focus();
  $('.copy-project-link').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = $('.project-link-status');
    try {
      await navigator.clipboard.writeText(new URL(projectURL(location.href, key), location.href).href);
      button.textContent = 'Link copied';
      status.textContent = 'Project link copied to clipboard.';
    } catch { status.textContent = 'Copy unavailable. You can copy this page’s address from your browser.'; }
  });
}
function closeProject() {
  if (!dialog.open) return;
  dialog.close();
  if (history.state?.portfolioProject === currentProject) history.back();
  else history.replaceState(history.state, '', projectURL(location.href, null));
}
function syncProjectURL() {
  const key = projectKeyFromURL(location.href, Object.keys(projects));
  if (key) showProject(key);
  else if (dialog.open) dialog.close();
}
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.project;
  if (!Object.hasOwn(projects, key)) return;
  history.pushState({ ...history.state, portfolioProject: key }, '', projectURL(location.href, key));
  showProject(key, button);
}));
$('.dialog-close').addEventListener('click', closeProject);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeProject(); });
const outsideDialog = event => {
  const bounds = dialog.getBoundingClientRect();
  return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
};
// Close only for a single click that started and ended on the backdrop, not a double-click or a drag out of the dialog.
let backdropPress = false;
dialog.addEventListener('pointerdown', event => { backdropPress = outsideDialog(event); });
dialog.addEventListener('click', event => {
  if (backdropPress && event.detail <= 1 && outsideDialog(event)) closeProject();
  backdropPress = false;
});
dialog.addEventListener('close', () => {
  document.body.style.overflow = previousBodyOverflow;
  if (dialogTrigger && !dialogTrigger.closest('[hidden]')) dialogTrigger.focus({ preventScroll: true });
});
window.addEventListener('popstate', syncProjectURL);
syncProjectURL();

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.filter;
  let visible = 0;
  document.querySelectorAll('.project').forEach(project => {
    const show = filter === 'all' || project.dataset.category.split(' ').includes(filter);
    project.hidden = !show;
    if (show) { visible++; project.classList.add('visible'); }
  });
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#filter-status').textContent = `${visible} ${visible === 1 ? 'project' : 'projects'} shown.`;
}));
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  document.documentElement.classList.add('js-reveal');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .06, rootMargin: '0px 0px -12px 0px' });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}
$('.copy-email').addEventListener('click', async () => {
  const button = $('.copy-email');
  try {
    await navigator.clipboard.writeText('avulataruntej123@gmail.com');
    button.innerHTML = 'Copied <span aria-hidden="true">✓</span>';
    $('.copy-status').textContent = 'Email address copied to clipboard.';
  } catch {
    $('.copy-status').textContent = 'Copy unavailable. Select the email address or use the email link.';
    button.textContent = 'Select the email to copy';
  }
});
$('#year').textContent = String(new Date().getFullYear());
