// Light / Dark / System, set before the first paint so a page never flashes in the wrong mode.
// The choice is kept in this browser (meton:appearance = system | light | dark, the same key as the METON app).
// "System" follows the device and changes with it while the page is open.
(function () {
  var root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() { try { var v = localStorage.getItem('meton:appearance'); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; } }
  function apply() {
    var p = pref(), dark = p === 'dark' || (p === 'system' && !!(mq && mq.matches));
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-appearance', p);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#101425' : '#F5F7FE');
  }
  window.metonAppearance = {
    get: pref,
    set: function (v) { try { if (v === 'light' || v === 'dark') localStorage.setItem('meton:appearance', v); else localStorage.removeItem('meton:appearance'); } catch (e) {} apply(); },
    apply: apply
  };
  apply();
  if (mq) { var on = function () { if (pref() === 'system') apply(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  window.addEventListener('storage', function (e) { if (e.key === 'meton:appearance') apply(); });
})();
