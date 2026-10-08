// Tactile interactions (Motion): magnetic calls to action, the menu, and the "book a cut" demo where a time is
// snipped out of the day and flies into the calendar. Springs everywhere a hand is involved; nothing moves by itself.
import { animate, spring } from '../vendor/motion.js';

const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let cleanups = [];

// Magnetic buttons: the button leans toward the cursor and springs back. Desktop pointers only; on touch the press
// scale (CSS) is the feedback instead.
function magnetic(root) {
  if (!fine() || reduce()) return;
  root.querySelectorAll('.magnetic').forEach(el => {
    const move = e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.28, y = (e.clientY - (r.top + r.height / 2)) * 0.4;
      animate(el, { x, y }, { type: spring, stiffness: 320, damping: 20, mass: 0.6 });
    };
    const leave = () => animate(el, { x: 0, y: 0 }, { type: spring, stiffness: 260, damping: 14 });
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
  });
}

// Menu: the page under the full-screen menu stops scrolling; Escape and any menu link close it.
function menu() {
  const toggle = document.getElementById('menu-toggle'), panel = document.getElementById('nav-panel');
  if (!toggle || !panel) return;
  const sync = () => {
    const open = panel.classList.contains('open');
    document.body.classList.toggle('menu-open', open);
    toggle.querySelector('.label-text') && (toggle.querySelector('.label-text').textContent = open ? toggle.dataset.close : toggle.dataset.open);
    if (open) panel.querySelector('.menu-links a')?.focus({ preventScroll: true });
  };
  const obs = new MutationObserver(sync); obs.observe(panel, { attributes: true, attributeFilter: ['class'] });
  const close = () => { panel.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };
  panel.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  const key = e => { if (e.key === 'Escape' && panel.classList.contains('open')) { close(); toggle.focus(); } };
  addEventListener('keydown', key);
  cleanups.push(() => { obs.disconnect(); removeEventListener('keydown', key); document.body.classList.remove('menu-open'); });
}

// The demo: choose a service, then cut a time out of the strip. The cut piece flies (with a little spin, as if just
// snipped) into the calendar row for that time. Everything is a real button, so it works with keyboard and touch.
function demo(root, t) {
  const board = root.querySelector('.demo-board');
  if (!board) return;
  const services = [...board.querySelectorAll('[data-service]')], slots = [...board.querySelectorAll('.tslot')], confirm = board.querySelector('.demo-confirm');
  let service = services.find(b => b.getAttribute('aria-pressed') === 'true') || services[0];
  services.forEach(b => b.addEventListener('click', () => {
    service = b; services.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (!reduce()) animate(b, { scale: [0.94, 1] }, { type: spring, stiffness: 500, damping: 18 });
  }));
  slots.forEach(slot => slot.addEventListener('click', async () => {
    if (slot.getAttribute('aria-disabled') === 'true' || board.dataset.busy) return;
    board.dataset.busy = '1';
    const time = slot.dataset.time, cell = board.querySelector(`.demo-cal-cell[data-time="${time}"]`);
    const label = `${service.dataset.label} · ${time}`;
    if (cell && !reduce()) {
      const a = slot.getBoundingClientRect(), b = cell.getBoundingClientRect();
      const fly = Object.assign(document.createElement('div'), { className: 'fly', textContent: time });
      Object.assign(fly.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
      document.body.appendChild(fly);
      slot.classList.add('is-cut');
      await animate(fly, { x: [0, (b.left - a.left) * 0.5, b.left - a.left], y: [0, -60, b.top - a.top + 4], rotate: [0, -14, 0], width: [a.width, a.width * 1.1, b.width], height: [a.height, a.height, b.height - 8] },
        { duration: 0.75, ease: [0.65, 0, 0.15, 1] }).finished;
      fly.remove();
    } else slot.classList.add('is-cut');
    slot.setAttribute('aria-disabled', 'true');
    if (cell) {
      const block = Object.assign(document.createElement('div'), { className: 'booked', textContent: label });
      cell.appendChild(block);
      if (!reduce()) animate(block, { scaleY: [0.6, 1] }, { type: spring, stiffness: 420, damping: 20 });
    }
    confirm.textContent = t('dm_booked', { service: service.dataset.label, time });
    delete board.dataset.busy;
  }));
  board.querySelector('.demo-again')?.addEventListener('click', () => {
    board.querySelectorAll('.booked').forEach(b => b.remove());
    slots.forEach(s => { if (!s.dataset.taken) { s.classList.remove('is-cut'); s.removeAttribute('aria-disabled'); } });
    confirm.textContent = '';
    slots.find(s => !s.dataset.taken)?.focus();
  });
}

export function initInteract(root, t) {
  cleanups.forEach(fn => fn()); cleanups = [];
  menu();
  magnetic(root);
  demo(root, t);
}
