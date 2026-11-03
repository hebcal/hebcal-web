// Tiny inline loader for the Gregorian calendar popup. Inlined into pages
// (views/partials/client-datepicker-loader.min.js) and wires every
// [data-hebcal-datepicker] button via one delegated listener, so rows added
// later (Yahrzeit "Add another name") work with no extra code.
//
// The ~30 KB picker bundle is fetched only when a visitor first shows
// interest: hovering/focusing a button warms it up, clicking opens it. The
// CSP has 'strict-dynamic', so a script inserted by this nonce'd script runs.
(function() {
  const cfgEl = document.getElementById('hebcal-datepicker-cfg');
  if (!cfgEl) return;
  const src = JSON.parse(cfgEl.textContent).src;
  const SELECTOR = '[data-hebcal-datepicker]';
  let promise;
  function load() {
    if (!promise) {
      promise = new Promise(function(resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = function() {
          promise = undefined; // allow a retry on the next click
          reject(new Error('datepicker load failed'));
        };
        document.head.appendChild(s);
      });
    }
    return promise;
  }
  function warm(e) {
    if (e.target.closest && e.target.closest(SELECTOR)) {
      load().catch(function() {});
    }
  }
  document.addEventListener('pointerover', warm, {passive: true});
  document.addEventListener('focusin', warm);
  document.addEventListener('click', function(e) {
    const btn = e.target.closest && e.target.closest(SELECTOR);
    if (!btn) return;
    e.preventDefault();
    if (window.hebcalDatepicker) {
      if (window.hebcalDatepicker.open(btn)) {
        e.stopPropagation();
      }
      return;
    }
    btn.setAttribute('aria-busy', 'true');
    load().then(function() {
      btn.removeAttribute('aria-busy');
      // Replay the click now that the picker is here; it comes back through
      // this listener and takes the synchronous path above.
      btn.click();
    }, function() {
      btn.removeAttribute('aria-busy');
    });
  }, true); // capture: run before the library's own listener on the button
})();
