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
  button.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
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
import('./scene.js').then(({ initScene }) => {
  sculpture = initScene($('#hero-scene'));
  sculpture.setMode(mode); sculpture.setPaused(paused);
}).catch(() => { $('#hero-scene').dataset.sceneReady = 'false'; });
window.addEventListener('pagehide', event => { if (!event.persisted) sculpture?.destroy(); });

const menuToggle = $('.menu-toggle');
const navigation = $('#main-navigation');
function closeMenu() {
  navigation.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
}
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('open', expanded);
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

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
};
const dialog = $('#project-dialog');
let dialogTrigger;
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const project = projects[button.dataset.project];
  dialogTrigger = button;
  // Authored local content only. No remote or user-provided HTML is accepted.
  $('#dialog-content').innerHTML = `<p class="dialog-eyebrow">${project.label}</p><h2 id="dialog-title">${project.title}</h2><p class="dialog-lead">${project.lead}</p><div class="dialog-section"><h3>What I built</h3><p>${project.built}</p></div><div class="dialog-section"><h3>Inside the project</h3><ul>${project.details.map(detail => `<li>${detail}</li>`).join('')}</ul></div><div class="dialog-section"><p>${project.note}</p></div><div class="dialog-links">${project.links.map(([label, url]) => `<a class="text-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`).join('')}</div>`;
  dialog.showModal(); document.body.style.overflow = 'hidden'; dialog.scrollTop = 0;
  $('.dialog-close').focus();
}));
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
dialog.addEventListener('close', () => { document.body.style.overflow = ''; dialogTrigger?.focus({ preventScroll: true }); });

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
