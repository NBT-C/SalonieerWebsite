// Searchable country picker with flags (one sprite image) and, in "dial" mode, international calling codes.
// Accessible combobox: the trigger opens a panel with a search box that controls a listbox (arrow keys, Enter,
// Escape, type to filter). On phones the panel opens as a bottom sheet.
import { COUNTRIES } from './countries.js';

const COLS = 16;
export function flag(code) {
  const i = COUNTRIES.indexOf(code);
  return i < 0 ? '<span class="flag" aria-hidden="true"></span>' : `<span class="flag" aria-hidden="true" style="--c:${i % COLS};--r:${Math.floor(i / COLS)}"></span>`;
}

let uid = 0;
// options: { name, value, mode: 'country'|'dial', label, dialCodeOf(code) -> string|null, t, countryName(code), lang, required }
export function countryPicker(o) {
  const id = `cp${++uid}`;
  const dial = o.mode === 'dial';
  const value = o.value || '';
  const code = dial && value ? o.dialCodeOf(value) : null;
  const text = value ? (dial ? `+${code}` : o.countryName(value)) : o.t('chooseCountry');
  return `<div class="cpick${dial ? ' cpick-dial' : ''}" data-cpick="${o.mode}" data-id="${id}">
    <input type="hidden" name="${o.name}" value="${value}" data-cpick-value>
    <button type="button" class="cpick-btn${value ? '' : ' is-empty'}" id="${o.name}-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-pop" ${o.describedBy ? `aria-describedby="${o.describedBy}"` : ''} aria-label="${o.label}: ${value ? (dial ? `${o.countryName(value)} +${code}` : o.countryName(value)) : o.t('chooseCountry')}">${value ? flag(value) : '<span class="flag is-blank" aria-hidden="true"></span>'}<span class="cpick-text"${dial ? ' dir="ltr"' : ''}>${text}</span><span class="cpick-chev" aria-hidden="true"></span></button>
    <div class="cpick-pop" id="${id}-pop" hidden>
      <div class="cpick-sheet-head"><span>${o.label}</span><button type="button" class="icon-btn cpick-close" aria-label="${o.t('close')}">✕</button></div>
      <div class="cpick-search-wrap"><input type="text" inputmode="search" enterkeyhint="search" class="cpick-search" role="combobox" aria-expanded="true" aria-controls="${id}-list" aria-autocomplete="list" aria-label="${o.t('searchCountry')}" placeholder="${o.t('searchCountry')}" autocomplete="off" spellcheck="false"></div>
      <ul class="cpick-list" id="${id}-list" role="listbox" aria-label="${o.label}"></ul>
      <p class="cpick-empty" hidden>${o.t('noCountryMatch')}</p>
    </div>
  </div>`;
}

// Normalizes for search: case- and accent-insensitive.
const fold = s => s.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function bindCountryPicker(root, o) {
  const dial = root.dataset.cpick === 'dial';
  const btn = root.querySelector('.cpick-btn'), pop = root.querySelector('.cpick-pop'), search = root.querySelector('.cpick-search');
  const list = root.querySelector('.cpick-list'), empty = root.querySelector('.cpick-empty'), hidden = root.querySelector('[data-cpick-value]');
  const id = root.dataset.id;
  const items = COUNTRIES.map(code => ({ code, name: o.countryName(code), dial: dial ? o.dialCodeOf(code) : null }))
    .filter(x => !dial || x.dial)
    .sort((a, b) => a.name.localeCompare(b.name, o.lang));
  // Pinned first: the markets Salonieer serves most.
  const pinned = (o.pinned || []).map(c => items.find(x => x.code === c)).filter(Boolean);
  let shown = [], active = -1;

  const optionHtml = (x, i) => `<li role="option" id="${id}-o${i}" data-code="${x.code}" aria-selected="${x.code === hidden.value}">${flag(x.code)}<span class="cpick-name">${o.esc(x.name)}</span>${x.dial ? `<span class="cpick-code" dir="ltr">+${x.dial}</span>` : ''}</li>`;
  function draw() {
    const q = fold(search.value.trim()), digits = q.replace(/[^\d]/g, '');
    const match = x => !q || fold(x.name).includes(q) || x.code.toLowerCase() === q || (digits && x.dial && x.dial.startsWith(digits.replace(/^0+/, '')));
    shown = q ? items.filter(match) : [...pinned, ...items.filter(x => !pinned.includes(x))];
    list.innerHTML = shown.map(optionHtml).join('') + '';
    if (!q && pinned.length) list.children[pinned.length - 1]?.classList.add('is-pin-end');
    empty.hidden = shown.length > 0;
    setActive(Math.max(0, shown.findIndex(x => x.code === hidden.value)), !q);
  }
  function setActive(i, center = false) {
    active = Math.min(Math.max(i, 0), shown.length - 1);
    list.querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
    const el = list.children[active];
    if (!el) { search.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('is-active');
    search.setAttribute('aria-activedescendant', el.id);
    el.scrollIntoView({ block: center ? 'center' : 'nearest' });
  }
  const mobile = () => matchMedia('(max-width: 720px)').matches;
  function open() {
    if (!pop.hidden) return;
    pop.hidden = false; root.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
    // On phones the list is a bottom sheet over a page-wide backdrop. It moves to <body> while open so no card's
    // stacking context can put the backdrop above it (taps would land on the backdrop and close the sheet).
    if (mobile()) { document.body.classList.add('sheet-open'); document.body.appendChild(pop); }
    search.value = ''; draw();
    requestAnimationFrame(() => search.focus({ preventScroll: true }));
    document.addEventListener('pointerdown', outside, true);
  }
  function close(focus = true) {
    if (pop.hidden) return;
    root.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sheet-open');
    pop.hidden = true;
    if (pop.parentNode !== root) root.appendChild(pop);
    document.removeEventListener('pointerdown', outside, true);
    if (focus) btn.focus({ preventScroll: true });
  }
  const outside = e => { if (!root.contains(e.target) && !pop.contains(e.target)) close(false); };
  function choose(code, { silent = false } = {}) {
    hidden.value = code;
    const x = items.find(i => i.code === code);
    btn.classList.toggle('is-empty', !code);
    btn.querySelector('.flag').outerHTML = code ? flag(code) : '<span class="flag is-blank" aria-hidden="true"></span>';
    btn.querySelector('.cpick-text').textContent = !code ? o.t('chooseCountry') : dial ? `+${x?.dial ?? o.dialCodeOf(code)}` : x?.name ?? code;
    btn.setAttribute('aria-label', `${o.label}: ${code ? (dial ? `${x?.name} +${x?.dial}` : x?.name) : o.t('chooseCountry')}`);
    if (!silent) { hidden.dispatchEvent(new Event('change', { bubbles: true })); o.onChange?.(code); }
  }
  btn.addEventListener('click', () => pop.hidden ? open() : close());
  btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); } });
  root.querySelector('.cpick-close').addEventListener('click', () => close());
  search.addEventListener('input', draw);
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) { choose(shown[active].code); close(); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  list.addEventListener('click', e => { const li = e.target.closest('[data-code]'); if (li) { choose(li.dataset.code); close(); } });
  list.addEventListener('pointermove', e => { const li = e.target.closest('[data-code]'); if (li) setActive([...list.children].indexOf(li)); });
  return { choose, get value() { return hidden.value; }, close };
}
