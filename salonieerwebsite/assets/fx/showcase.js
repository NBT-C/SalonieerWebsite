// The home page's product showcase: the tour's tabs, a screen enlarged on tap, and a quiet fade-in as sections
// arrive. All content is in the page without it; with reduced motion nothing moves.
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let tab = 'dashboard', cleanups = [];
// Sections already shown stay shown when the page is redrawn (a language change), instead of fading in again.
const seen = new Set();
export const tourTab = () => tab;

// Tabs (WAI-ARIA pattern): arrows move between them (mirrored right-to-left), Home/End jump to the ends.
function tabs(root) {
  const list = root.querySelector('[data-tour-tabs]');
  if (!list) return;
  const buttons = [...list.querySelectorAll('[role="tab"]')];
  const select = (btn, focus) => {
    tab = btn.dataset.tab;
    for (const b of buttons) {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      root.querySelector('#' + b.getAttribute('aria-controls'))?.classList.toggle('is-active', on);
    }
    if (focus) btn.focus();
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
  };
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(b, false));
    b.addEventListener('keydown', e => {
      const rtl = getComputedStyle(list).direction === 'rtl';
      const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
      const to = step ? buttons[(i + step + buttons.length) % buttons.length] : e.key === 'Home' ? buttons[0] : e.key === 'End' ? buttons.at(-1) : null;
      if (to) { e.preventDefault(); select(to, true); }
    });
  });
}

// A screen, enlarged: the device is a button that opens the full-size picture in a dialog.
function zoom(root) {
  const dialog = root.querySelector('#sc-lightbox');
  if (!dialog?.showModal) return;
  const img = dialog.querySelector('img');
  root.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => {
    img.src = btn.dataset.zoom;
    img.alt = btn.dataset.alt || '';
    dialog.classList.toggle('is-tablet', btn.dataset.kind === 'tablet');
    document.documentElement.classList.add('sc-locked');
    dialog.showModal();
  }));
  dialog.addEventListener('click', e => { if (e.target === dialog || e.target.closest('[data-close]')) dialog.close(); });
  dialog.addEventListener('close', () => { document.documentElement.classList.remove('sc-locked'); img.removeAttribute('src'); });
  cleanups.push(() => { if (dialog.open) dialog.close(); document.documentElement.classList.remove('sc-locked'); });
}

// Sections fade up once as they come into view.
function reveal(root) {
  const home = root.querySelector('.sc-home');
  if (!home || reduce() || !('IntersectionObserver' in window)) return;
  const items = [...home.querySelectorAll('.sc-reveal')];
  items.forEach(el => { if (seen.has(el.dataset.r)) el.classList.add('is-in'); });
  home.classList.add('sc-anim');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in'); seen.add(e.target.dataset.r); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -6% 0px', threshold: 0.12 });
  items.forEach(el => { if (!el.classList.contains('is-in')) io.observe(el); });
  cleanups.push(() => io.disconnect());
}

export function initShowcase(root) {
  cleanups.forEach(fn => fn()); cleanups = [];
  tabs(root);
  zoom(root);
  reveal(root);
}
