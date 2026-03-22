const grabBtnList = document.querySelectorAll('.btn.grabBtn');
grabBtnList.forEach(function(el) {
  const tooltipBtn = new bootstrap.Tooltip(el, {
    trigger: 'manual',
  });
  el.addEventListener('click', function() {
    const targetSelector = el.getAttribute('data-clipboard-target');
    const targetEl = targetSelector && document.querySelector(targetSelector);
    const text = targetEl ? (targetEl.value || targetEl.textContent) : '';
    navigator.clipboard.writeText(text).then(function() {
      el.setAttribute('data-bs-original-title', 'Copied!');
      tooltipBtn.show();
      setTimeout(function() {
        tooltipBtn.hide();
      }, 2000);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
      }
    }).catch(function() {
      const modifierKey = /mac/i.test(navigator.userAgent) ? '\u2318' : 'Ctrl-';
      const fallbackMsg = 'Press ' + modifierKey + 'C to copy';
      el.setAttribute('data-bs-original-title', fallbackMsg);
      tooltipBtn.show();
      setTimeout(function() {
        tooltipBtn.hide();
      }, 2000);
    });
  });
});
const grabLink = document.getElementById('grabLink');
if (grabLink) {
  grabLink.addEventListener('focus', function() {
    setTimeout(function() {
      grabLink.select();
    }, 100);
  });
}
