var _paq = window._paq = window._paq || [];
var canonicalMeta=document.querySelector('link[rel="canonical"]');
var urlHref=canonicalMeta?canonicalMeta.href:window.location.href;
/* redact identifier from URL */
var url = new URL(urlHref);
if (url.pathname.substring(0, 15) == '/yahrzeit/edit/') {
  url.pathname = '/yahrzeit/edit/_ID_';
}
_paq.push(['setCustomUrl', url.href]);
_paq.push(['disableCookies']);
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
/* Hebcal anonymous userid */
var d0=document, c0=d0.cookie;
if(c0&&c0.length&&typeof URLSearchParams=='function'){
  var cks=c0.split(';').map(function(s0){var s=s0.trim(),eq=s.indexOf('=');
    return[s.substring(0, eq),s.substring(eq+1)]}).reduce(function(m,v){
    m[v[0]]=v[1];return m},{});
  if(cks['C']){
    var ck=new URLSearchParams(cks['C']);
    var uid=ck.get('uid');
    if(uid){_paq.push(['setUserId', uid])}
  }
}
(function() {
var u="/ma/";
_paq.push(['setTrackerUrl', u+'ma.php']);
_paq.push(['setSiteId', '1']);
var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
g.async=true; g.src=u+'ma.js'; s.parentNode.insertBefore(g,s);
})();
