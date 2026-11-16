/**
 * Client-side behavior for the /shabbat page (views/shabbat.ejs).
 */
document.addEventListener('DOMContentLoaded', function() {
  const d = document;
  // The fridge.cgi links are rendered without an href so that non-JS
  // crawlers (which ignore rel=nofollow) don't follow them; fill them in
  // from the #shabbatLinks JSON.
  const linksEl = d.getElementById('shabbatLinks');
  if (linksEl) {
    const links = JSON.parse(linksEl.textContent);
    d.querySelectorAll('[data-shabbat-href]').forEach(function(el) {
      const path = links[el.dataset.shabbatHref];
      if (typeof path === 'string') {
        el.href = path;
      }
    });
  }
  d.getElementById('m').addEventListener('focus', function() {
    d.getElementById('M1').checked = false;
    d.getElementById('M0').checked = true;
    d.getElementById('td').value = '';
  });
  d.getElementById('td').addEventListener('focus', function() {
    d.getElementById('M0').checked = false;
    d.getElementById('M1').checked = true;
    d.getElementById('m').value = '';
  });
});
