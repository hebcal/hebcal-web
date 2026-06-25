/* eslint-disable */
var _paq = window._paq = window._paq || [];
/* save utm */
const href=window.location.href;
const utm_ = {};
for (const [k, v] of new URL(href).searchParams) {
  if (k.startsWith('utm_')) {utm_[k] = v;}
}
/* redact identifier from URL */
const d = document;
const canonicalMeta = d.querySelector('link[rel="canonical"]');
const url = new URL(canonicalMeta ? canonicalMeta.href : href);
const sp = url.searchParams;
const pn = url.pathname;
const YAHRZEIT = '/yahrzeit';
if (pn.startsWith(YAHRZEIT + '/edit/')) {
  url.pathname = YAHRZEIT + '/edit/_ID_';
} else if (pn.startsWith(YAHRZEIT + '/verify/')) {
  url.pathname = YAHRZEIT + '/verify/_ID_';
} else if (pn == YAHRZEIT + '/') {
  url.pathname = YAHRZEIT;
} else if (pn == '/converter') {
  if (sp.get('h2g') == '1') {
    url.pathname=pn+'/'+sp.get('hy')+'/'+sp.get('hm')+'/'+sp.get('hd');
  } else {
    url.pathname=pn+'/'+sp.get('gy')+'/'+sp.get('gm')+'/'+sp.get('gd');
  }
} else if (pn == '/hebcal' && sp.get('v') == '1') {
  const yr = sp.get('year');
  if (yr) {
    url.pathname = pn + '/' + yr;
  } else {
    const start = sp.get('start');
    if (start) {
      url.pathname = pn + '/' + start.substring(0, 4);
    }
  }
}
/* always remove search params */
url.search='';
/* restore utm tracking params */
for (const [k, v] of Object.entries(utm_)) {
  url.searchParams.set(k, v);
}
_paq.push(['setCustomUrl', url.href]);
_paq.push(['disableCookies']);
/* Hebcal anonymous userid */
const c0 = d.cookie;
if (c0 && c0.length) {
  const cks=c0.split(';').map(function(s0){const s=s0.trim(); const eq=s.indexOf('=');
    return[s.substring(0, eq),s.substring(eq+1)];}).reduce(function(m,v){
    m[v[0]]=v[1]; return m;},{});
  if(cks['C']){
    const ck=new URLSearchParams(cks['C']);
    const uid=ck.get('uid');
    if(uid){
      const vid = uid.substring(0, 4) + uid.substring(24);
      _paq.push(['setVisitorId', vid]);
      _paq.push(['setUserId', uid]);
    }
  }else if(cks['hebcal']){
    _paq.push(['setUserId',cks['hebcal']]);
  }
}
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
const u='/ma/';
_paq.push(['setTrackerUrl', u+'ma.php']);
_paq.push(['setSiteId', '1']);
const g=d.createElement('script');
const s=d.getElementsByTagName('script')[0];
g.nonce='<%=nonce%>';
g.async=true;
g.src=u+'ma.js';
s.parentNode.insertBefore(g,s);
