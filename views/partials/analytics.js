/* eslint-disable no-var, one-var, keyword-spacing, comma-spacing, brace-style, space-before-blocks */
var _paq = window._paq = window._paq || [];
var canonicalMeta=document.querySelector('link[rel="canonical"]');
var urlHref=canonicalMeta?canonicalMeta.href:window.location.href;
/* redact identifier from URL */
var url = new URL(urlHref);
var sp = url.searchParams;
var pn = url.pathname;
if (pn.substring(0, 15)=='/yahrzeit/edit/') {
  url.pathname='/yahrzeit/edit/_ID_';
  url.search='';
} else if (pn.substring(0, 17)=='/yahrzeit/verify/') {
  url.pathname='/yahrzeit/verify/_ID_';
} else if ((pn=='/yahrzeit'||pn=='/yahrzeit/')&&typeof sp.get('t1')=='string') {
  url.pathname='/yahrzeit';
  url.search='';
} else if (pn=='/email/verify.php') {
  url.search='';
} else if (pn=='/converter') {
  if (sp.get('h2g')=='1') {
    url.pathname='/converter/'+sp.get('hy')+'/'+sp.get('hm')+'/'+sp.get('hd');
  } else {
    url.pathname='/converter/'+sp.get('gy')+'/'+sp.get('gm')+'/'+sp.get('gd');
  }
  url.search='';
} else if (pn=='/hebcal') {
  var yr=sp.get('year');
  url.pathname=sp.get('v')=='1'&&yr?'/hebcal/'+yr:'/hebcal';
  url.search='';
} else if (pn=='/shabbat/fridge.cgi'||pn=='/shabbat') {
  url.search='';
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
  var u='/ma/';
  _paq.push(['setTrackerUrl', u+'ma.php']);
  _paq.push(['setSiteId', '1']);
  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.async=true; g.src=u+'ma.js'; s.parentNode.insertBefore(g,s);
})();
