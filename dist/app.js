import { sceneRequiresConsent, projectKeyFromURL, projectURL, matchesProject } from './ui-state.js';
const $ = selector => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialog = $('#project-dialog');
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
// An open case study covers the hero, so the sculpture also rests behind it.
function applyPaused() { sculpture?.setPaused(paused || dialog.open); }
updateMotionButton();
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#scene-label').textContent = modeLabels[mode][0];
  $('.hero h1 em').style.color = modeLabels[mode][1];
  sculpture?.setMode(mode);
}));
$('.motion-toggle').addEventListener('click', () => { paused = !paused; applyPaused(); updateMotionButton(); });
reducedMotion.addEventListener('change', event => { paused = event.matches; applyPaused(); updateMotionButton(); });
const sceneContainer = $('#hero-scene');
const sceneButton = $('.scene-enable');
const sceneStatus = $('#scene-status');
const narrowScreen = window.matchMedia('(max-width: 760px)');
// Tablets and landscape phones are wider than the narrow breakpoint but still touch-first.
const coarsePointer = window.matchMedia('(pointer: coarse)');
let sceneLoading = false;
let sceneFailed = false;
let sceneDisposed = false;
let sceneVisible = false;
let sceneIdle;
let sceneObserver;
function needsSceneConsent() {
  return sceneRequiresConsent({ reducedMotion: reducedMotion.matches, narrow: narrowScreen.matches, coarsePointer: coarsePointer.matches,
    saveData: navigator.connection?.saveData, effectiveType: navigator.connection?.effectiveType });
}
function sceneState(state, message) {
  sceneContainer.dataset.sceneState = state;
  if (sceneStatus) sceneStatus.textContent = message;
  if (sceneButton) {
    const hidden = state === 'ready';
    const disabled = state === 'loading' || state === 'fallback';
    // Hiding or disabling the focused button would drop keyboard focus to <body>; keep it on the sculpture controls.
    if ((hidden || disabled) && document.activeElement === sceneButton) $('[data-mode][aria-pressed="true"]')?.focus();
    sceneButton.hidden = hidden;
    sceneButton.disabled = disabled;
    sceneButton.textContent = state === 'loading' ? 'Loading 3D…' : state === 'fallback' ? 'Static artwork active' : 'Enable 3D';
  }
  $('.motion-toggle').disabled = state !== 'ready';
}
sceneState('deferred', needsSceneConsent() ? 'Lightweight artwork. Enable 3D to explore the sculpture.' : 'Interactive sculpture loads when you view it.');
async function loadScene() {
  if (sculpture || sceneLoading || sceneFailed || sceneDisposed) return;
  sceneLoading = true;
  sceneState('loading', 'Preparing the interactive sculpture.');
  try {
    const { initScene } = await import('./scene.js');
    if (sceneDisposed) return;
    sculpture = initScene(sceneContainer, { mode, paused });
    sculpture.setMode(mode); applyPaused();
    // scene.js marks 'false' on every failure; an unset value means the renderer exists but its first paint was skipped (hidden tab).
    const ready = sceneContainer.dataset.sceneReady !== 'false';
    sceneState(ready ? 'ready' : 'fallback', ready ? 'Interactive sculpture ready. Choose a theme or pause the motion.' : '3D is unavailable here. The lightweight artwork remains visible.');
  } catch {
    // The fallback is final: later visibility or preference changes do not retry the import.
    sceneFailed = true;
    sceneContainer.dataset.sceneReady = 'false';
    sceneState('fallback', '3D could not load. All projects and contact links remain available.');
  } finally { sceneLoading = false; }
}
function scheduleScene() {
  if (sceneIdle || sculpture || sceneLoading || sceneFailed || sceneDisposed || !sceneVisible || dialog.open || document.hidden || needsSceneConsent() || document.readyState !== 'complete') return;
  const start = () => {
    sceneIdle = null;
    // Recheck after idle: scrolling, an opened case study, data preferences or visibility may have changed.
    if (sceneVisible && !dialog.open && !document.hidden && !needsSceneConsent()) void loadScene();
  };
  sceneIdle = 'requestIdleCallback' in window ? window.requestIdleCallback(start, { timeout: 1800 }) : window.setTimeout(start, 200);
}
sceneButton?.addEventListener('click', () => { void loadScene(); });
// scene.js marks a ready scene 'false' after a lost context or failed paint, and 'true' again once a restored
// context draws (a phone back from the background, a GPU reset): move between the fallback and ready states.
new MutationObserver(() => {
  const { sceneReady, sceneState: state } = sceneContainer.dataset;
  if (sceneReady === 'false' && state === 'ready') sceneState('fallback', '3D is unavailable here. The lightweight artwork remains visible.');
  else if (sceneReady === 'true' && state === 'fallback' && sculpture) sceneState('ready', 'Interactive sculpture ready. Choose a theme or pause the motion.');
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
coarsePointer.addEventListener('change', scheduleScene);
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
    links: [['Try the website', 'https://axiom-sat.pages.dev/'], ['View source', 'https://github.com/TARUNTEjjjj/axiom-sat']],
  },
  forge: {
    label: 'INTERACTIVE WEB / 3D LEARNING', title: 'Forge',
    lead: 'A learning experience that gives technical subjects a place on an interactive 3D map.',
    built: 'Built with React, TypeScript and Vite, Forge brings together guided Python, Git, algorithms and software engineering lessons with browser-based coding practice.',
    details: ['A 3D learning map provides a visual route through the material.', 'Guided exercises connect explanations to hands-on practice.', 'The interface is built around exploring a topic and returning to the next step.'],
    note: 'The artwork in this portfolio is an original visual interpretation of the project. Follow the website link to explore the actual learning experience.',
    links: [['Explore Forge', 'https://forge-learning-academy.pages.dev/'], ['View source', 'https://github.com/TARUNTEjjjj/forge-learning-academy']],
  },
  math: {
    label: 'C++20 / EXACT ARITHMETIC', title: 'AxiomMath',
    lead: 'A small mathematical tool built around a simple promise: keep fractions exact, and make the limits explicit.',
    built: 'A C++20 rational-arithmetic and expression-parsing project, with a canonical fraction representation, bounded integer arithmetic and explicit overflow handling.',
    details: ['Engineering notes explain the arithmetic bounds and expression grammar.', 'Differential checks compare results with Python’s fractions.Fraction.', 'Property and boundary tests explore the behaviour of the implementation.'],
    note: 'Finite tests provide evidence about correctness, not a proof for every possible input. The supported arithmetic range and limitations are documented.',
    links: [['View source', 'https://github.com/TARUNTEjjjj/axiom-math']],
  },
  pocket: {
    label: 'C++20 / PERSISTENT STORAGE', title: 'PocketKV',
    lead: 'A compact key-value store that makes persistence, recovery and performance tradeoffs visible.',
    built: 'A C++20 persistent store using an append-only log, an in-memory index, checksums and file locking. Its documentation covers the storage format, recovery behaviour and verification.',
    details: ['A reproducible benchmark varies overwrite history while holding live-key count fixed.', 'Raw measurements, timing boundaries and validation checks accompany the report.', 'Small local workloads show why reopening a longer log can cost more while indexed reads remain comparatively stable.'],
    note: 'The benchmark describes small, warm-cache local workloads. It is not a general performance guarantee or a certification of power-loss durability.',
    links: [['View source', 'https://github.com/TARUNTEjjjj/pocketkv']],
  },
  storm: {
    label: 'WEB DEVELOPMENT / WEATHER AWARENESS', title: 'StormSignal',
    lead: 'Weather information designed to stay useful when connectivity becomes unreliable.',
    built: 'A React and TypeScript weather workspace with forecasts, satellite imagery, official-source checks, saved places and offline briefings.',
    details: ['Bounded provider timeouts and retries keep slow upstream services from leaving requests hanging.', 'Source status and partial results remain visible when an official provider is unavailable.', '308 automated tests passed in the November 2026 release, alongside live checks for supported locations.'],
    note: 'Availability and freshness vary by source. The November 2026 live check found PAGASA unavailable; Manila retained partial WMO coverage. Cached information can become outdated. Follow current instructions from local emergency authorities.',
    links: [['Explore StormSignal', 'https://stormsignal-weather.pages.dev/'], ['View source', 'https://github.com/TARUNTEjjjj/stormsignal']],
  },
  neural: {
    label: 'PYTHON / NEURAL NETWORKS', title: 'Neural Math Lab',
    lead: 'An inspectable neural network that connects matrix operations, derivatives and actual model predictions.',
    built: 'A NumPy learning project with manual backpropagation, SGD and Adam optimizers, and self-contained reports for XOR, moons and circles experiments.',
    details: ['Interactive reports replay saved checkpoints and trace a point through each layer.', 'Training-only preprocessing and validation selection keep held-out test examples separate.', 'Python and JavaScript regression tests check the mathematics, saved models, reports and browser prediction agreement.'],
    note: 'An open-source learning project. Recorded results describe particular synthetic datasets and seeds; they are not a guarantee of real-world accuracy.',
    links: [['Explore Neural Math Lab', 'https://neural-math-lab.pages.dev/'], ['View source', 'https://github.com/TARUNTEjjjj/neural-math-lab']],
  },

};
let dialogTrigger;
let currentProject;
let previousBodyOverflow = null;
// Where the page was scrolled when the case study opened (the page cannot scroll while one is open), and the address
// of the entry it was opened from; a traversal that closes the case study on that address returns to the position.
let readingPosition = [0, 0];
let readingURL;
// The address as of the last traversal or in-page link. A popstate listener already finds the new address in
// location; this still names the entry the traversal left.
let shownURL = location.href;
// Marks the case-study entries this page pushed. A restored or reloaded tab keeps their history.state, but Back from
// such an entry can load the previous one as a new page, so only this page's own entries close with history.back().
const historyOwner = String(Math.random());
function showProject(key, trigger) {
  const project = projects[key];
  if (!project) return;
  // Focus returns only to the control that opened the case study; a ?project= link or history traversal has none.
  if (!dialog.open) dialogTrigger = trigger;
  currentProject = key;
  // Authored local content only. The URL selects an allowlisted project, never HTML.
  $('#dialog-content').innerHTML = `<p class="dialog-eyebrow">${project.label}</p><h2 id="dialog-title">${project.title}</h2><p class="dialog-lead">${project.lead}</p><div class="dialog-section"><h3>What I built</h3><p>${project.built}</p></div><div class="dialog-section"><h3>Inside the project</h3><ul>${project.details.map(detail => `<li>${detail}</li>`).join('')}</ul></div><div class="dialog-section"><p>${project.note}</p></div>${project.links.length ? `<div class="dialog-links">${project.links.map(([label, url]) => `<a class="text-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`).join('')}</div>` : ''}<button class="copy-project-link" type="button">Copy project link</button><p class="project-link-status" aria-live="polite"></p>`;
  if (!dialog.open) {
    // The last case study's close event may still be queued; keep the overflow saved before the page was locked.
    if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
    readingPosition = [scrollX, scrollY];
    // A card adds only ?project= to the address it opens from; a traversal opens the case study from the entry it left.
    readingURL = projectURL(trigger ? location.href : shownURL, null);
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    applyPaused();
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
  // Going back to a #fragment entry re-runs fragment navigation, which scrolls away and drops the restored focus.
  if (history.state?.portfolioProject === currentProject && history.state.portfolioOwner === historyOwner && !location.hash) history.back();
  else history.replaceState(history.state, '', projectURL(location.href, null));
}
function syncProjectURL() {
  const key = projectKeyFromURL(location.href, Object.keys(projects));
  if (key) showProject(key);
  else if (dialog.open) {
    dialog.close();
    // Back to a #fragment entry re-runs fragment navigation after this event, scrolling away from the case study's
    // card. Back on the entry it was opened from, return to where the page was, as closing with × or Escape leaves it;
    // a jump to an entry with another address, such as another section, stays where the browser puts it.
    if (location.hash && projectURL(location.href, null) === readingURL) setTimeout(() => scrollTo({ left: readingPosition[0], top: readingPosition[1], behavior: 'instant' }));
  }
  shownURL = location.href;
}
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', event => {
  // The second click of a double-click on × or the backdrop lands on whichever card the closing dialog uncovered.
  if (event.detail > 1) return;
  const key = button.dataset.project;
  if (!Object.hasOwn(projects, key)) return;
  const state = { ...history.state, portfolioProject: key, portfolioOwner: historyOwner };
  // Reuse the #fragment entry a case study was closed on, so repeated case studies add one history entry at most. Only
  // this page's own: a restored tab's entry can follow another document, which Back from a replaced entry would load.
  if (history.state?.portfolioProject && history.state.portfolioOwner === historyOwner && location.hash) history.replaceState(state, '', projectURL(location.href, key));
  else history.pushState(state, '', projectURL(location.href, key));
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
  // A queued close event can arrive after another case study has opened; that one keeps the page locked.
  if (dialog.open) return;
  if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = null;
  if (dialogTrigger && !dialogTrigger.closest('[hidden]')) dialogTrigger.focus({ preventScroll: true });
  applyPaused();
  scheduleScene();
});
window.addEventListener('popstate', syncProjectURL);
window.addEventListener('hashchange', () => { shownURL = location.href; });
syncProjectURL();

let activeFilter = 'all';
const searchInput = $('#project-search');
const clearSearch = $('#clear-project-search');
const projectCards = [...document.querySelectorAll('.project')].map(element => ({
  element, text: element.textContent, categories: element.dataset.category,
}));
function filterProjects() {
  let visible = 0;
  for (const card of projectCards) {
    const show = matchesProject(card, { query: searchInput.value, category: activeFilter });
    card.element.hidden = !show;
    if (show) { visible++; card.element.classList.add('visible'); }
  }
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === activeFilter)));
  clearSearch.hidden = activeFilter === 'all' && !searchInput.value;
  $('#filter-status').textContent = visible ? `${visible} ${visible === 1 ? 'project' : 'projects'} shown.` : 'No projects match. Try another term or clear the filters.';
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filterProjects();
}));
searchInput.addEventListener('input', filterProjects);
clearSearch.addEventListener('click', () => {
  activeFilter = 'all'; searchInput.value = ''; filterProjects(); searchInput.focus();
});
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
// The page is set up. The card artwork ships inert so that, where this module cannot run, it is not a dead control;
// fallback.js applies the static layout unless <html> carries app-ready.
document.querySelectorAll('.project-visual[inert]').forEach(card => card.removeAttribute('inert'));
document.documentElement.classList.add('app-ready');
