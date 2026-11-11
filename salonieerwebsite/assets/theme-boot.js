// Light / Dark / System, set before the first paint so a page never flashes in the wrong mode.
// Light is the default for everyone (owner, 2026-11-11); Dark when chosen; System follows the device only when chosen.
// The choice is kept in this browser (meton:appearance = light | dark | system, the same key as the METON app).
(function () {
  var root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() { try { var v = localStorage.getItem('meton:appearance'); return v === 'dark' || v === 'system' ? v : 'light'; } catch (e) { return 'light'; } }
  function apply() {
    var p = pref(), dark = p === 'dark' || (p === 'system' && !!(mq && mq.matches));
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-appearance', p);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#101425' : '#F5F7FE');
  }
  window.metonAppearance = {
    get: pref,
    set: function (v) { try { localStorage.setItem('meton:appearance', v === 'dark' || v === 'system' ? v : 'light'); } catch (e) {} apply(); },
    apply: apply
  };
  apply();
  if (mq) { var on = function () { if (pref() === 'system') apply(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  window.addEventListener('storage', function (e) { if (e.key === 'meton:appearance') apply(); });
})();
