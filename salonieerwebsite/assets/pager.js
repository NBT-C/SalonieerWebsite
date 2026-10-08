// Every list on the site shows at most 5 items; the rest is paged. A list opts in with data-paginate="<key>" on the
// element whose direct children are the items (a <tbody> for tables). Items marked data-no-page (empty states) don't
// count. data-paginate-start="last" opens on the last page (message threads, newest at the bottom).
// Works on any re-render: a MutationObserver re-applies paging whenever a list's items change, and the page a
// visitor is on is kept while the same list is redrawn with the same number of items.
export const PAGE_SIZE = 5;
const state = new Map();   // key → { page, count }
let label = (key, vars) => key === 'pageOf' ? `${vars.page} / ${vars.pages}` : key === 'previous' ? '‹' : '›';
let queued = false;

function itemsOf(list) { return [...list.children].filter(el => !el.hasAttribute('data-no-page') && !el.classList.contains('pager')); }
// The pager goes after the list, or after the table's scroll wrapper for a <tbody>.
function anchorOf(list) { return list.tagName === 'TBODY' ? (list.closest('.table-wrap,.ap-table-wrap') || list.closest('table')) : list; }

function apply(list) {
  const key = list.dataset.paginate || 'list', items = itemsOf(list), anchor = anchorOf(list);
  let nav = anchor.nextElementSibling?.matches?.(`nav.pager[data-for="${CSS.escape(key)}"]`) ? anchor.nextElementSibling : null;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  let s = state.get(key);
  if (!s || s.count !== items.length) s = { page: list.dataset.paginateStart === 'last' ? pages : 1, count: items.length };
  s.page = Math.min(Math.max(1, s.page), pages);
  state.set(key, s);
  const from = (s.page - 1) * PAGE_SIZE, to = from + PAGE_SIZE;
  items.forEach((el, i) => el.toggleAttribute('data-page-hidden', pages > 1 && (i < from || i >= to)));
  if (pages <= 1) { nav?.remove(); return; }
  const sig = `${s.page}/${pages}/${document.documentElement.lang}`;
  if (nav && nav.dataset.sig === sig) return;
  if (!nav) { nav = document.createElement('nav'); nav.className = 'pager'; nav.dataset.for = key; anchor.after(nav); }
  nav.dataset.sig = sig;
  nav.setAttribute('aria-label', label('pagination'));
  nav.innerHTML = `<button type="button" class="pager-btn" data-step="-1"${s.page === 1 ? ' disabled' : ''} aria-label="${label('previous')}"><span aria-hidden="true">‹</span></button>`
    + `<span class="pager-status" aria-live="polite">${label('pageOf', { page: s.page, pages })}</span>`
    + `<button type="button" class="pager-btn" data-step="1"${s.page === pages ? ' disabled' : ''} aria-label="${label('next')}"><span aria-hidden="true">›</span></button>`;
  nav.onclick = e => {
    const b = e.target.closest('[data-step]'); if (!b || b.disabled) return;
    s.page += Number(b.dataset.step); apply(list);
    // Keep the list in view on small screens instead of leaving the visitor at the pager.
    const top = list.closest('section,table,.table-wrap,.ap-table-wrap,.application-list') || list;
    if (top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    nav.querySelector(`[data-step="${b.dataset.step}"]:not([disabled])`)?.focus();
  };
}

export function paginateAll(root = document) { root.querySelectorAll('[data-paginate]').forEach(apply); }
// Forget a list's page (e.g. after a filter change) so it reopens on its first page.
export function resetPage(key) { state.delete(key); }

export function installPager(labeller) {
  if (labeller) label = labeller;
  const run = () => { queued = false; paginateAll(); };
  new MutationObserver(records => {
    // Ignore the pager's own nav changes; anything else may have redrawn a list.
    if (records.every(r => r.target.closest?.('nav.pager'))) return;
    if (!queued) { queued = true; requestAnimationFrame(run); }
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
