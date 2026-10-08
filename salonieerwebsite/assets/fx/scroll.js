// Scroll choreography (GSAP + ScrollTrigger + SplitText). One context per rendered page: everything is reverted
// before the next page paints. gsap.matchMedia splits desktop / phone / reduced motion, so the phone gets its own
// (lighter) version of each scene and reduced-motion visitors get the final compositions without movement.
import { gsap, ScrollTrigger, SplitText } from '../vendor/gsap.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
let mm = null, headerOff = null;

const REDUCE = '(prefers-reduced-motion: reduce)';
const reduced = () => matchMedia(REDUCE).matches;

// ---- Header: hides while reading down, returns on the way up; knows when it sits over a dark scene. --------------------
function header() {
  const bar = document.querySelector('.topbar');
  if (!bar) return () => {};
  let lastY = scrollY, ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY, menuOpen = document.body.classList.contains('menu-open');
    bar.classList.toggle('is-solid', y > 24);
    bar.classList.toggle('is-hidden', !menuOpen && y > 200 && y > lastY + 4 && !bar.contains(document.activeElement));
    if (y < lastY - 4 || y < 200) bar.classList.remove('is-hidden');
    lastY = y;
    const probe = document.elementFromPoint(innerWidth / 2, (bar.offsetHeight || 72) + 2);
    document.body.classList.toggle('on-ink', !!probe?.closest('.ink,.site-footer'));
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => removeEventListener('scroll', onScroll);
}

// ---- Shared: the inner-page title arrives once, cut out of a mask (the single load moment on calm pages). -------------
function titleIn(scope) {
  const h = scope.querySelector('.page-heading h1, .auth-art h1');
  if (!h) return;
  const arabic = document.documentElement.lang === 'ar';
  SplitText.create(h, { type: arabic ? 'words,lines' : 'lines', mask: 'lines', autoSplit: true, onSplit(self) {
    return gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: 'expo.out', stagger: 0.08 });
  } });
}

// ---- Plans: rows chalk in on load ---------------------------------------------------------------------------------
function plans() {
  gsap.utils.toArray('.plan-rows .menu-row, .extras .menu-row').forEach((row, i) =>
    gsap.from(row, { clipPath: 'inset(0 100% 0 0)', duration: 0.9, ease: 'expo.out', delay: 0.15 + i * 0.07, scrollTrigger: { trigger: row, start: 'top 92%', once: true } }));
}

export function killFx() {
  mm?.revert(); mm = null;
  headerOff?.(); headerOff = null;
}

export function initFx(route) {
  killFx();
  headerOff = header();
  if (route.startsWith('/admin')) return;
  mm = gsap.matchMedia();
  mm.add({ phone: '(max-width: 760px)', wide: '(min-width: 761px)', reduce: REDUCE }, ctx => {
    // Reduced motion: the pages are shown as they are, without movement. The home page has no scroll animation at all.
    if (ctx.conditions.reduce) return;
    titleIn(document);
    if (route === '/plans') plans();
  });
  // Fonts change line lengths and trigger positions.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}
export { reduced };
