/* eslint-disable keyword-spacing, comma-spacing, brace-style, space-before-blocks, no-var */
var _paq = window._paq = window._paq || [];
const canonicalMeta=document.querySelector('link[rel="canonical"]');
const urlHref=canonicalMeta?canonicalMeta.href:window.location.href;
/* save utm */
const utm_ = {};
new URL(window.location.href).searchParams.forEach(function(v, k) {
  if (k.startsWith('utm_')) {utm_[k] = v;}
});
/* redact identifier from URL */
const url = new URL(urlHref);
const sp = url.searchParams;
const pn = url.pathname;
if (pn.startsWith('/yahrzeit/edit/')) {
  url.pathname='/yahrzeit/edit/_ID_';
} else if (pn.startsWith('/yahrzeit/verify/')) {
  url.pathname='/yahrzeit/verify/_ID_';
} else if (pn=='/yahrzeit/') {
  url.pathname='/yahrzeit';
} else if (pn=='/converter') {
  if (sp.get('h2g')=='1') {
    url.pathname='/converter/'+sp.get('hy')+'/'+sp.get('hm')+'/'+sp.get('hd');
  } else {
    url.pathname='/converter/'+sp.get('gy')+'/'+sp.get('gm')+'/'+sp.get('gd');
  }
} else if (pn=='/hebcal') {
  const yr=sp.get('year');
  url.pathname=sp.get('v')=='1'&&yr?'/hebcal/'+yr:'/hebcal';
}
/* always remove search params */
url.search='';
Object.entries(utm_).forEach(function(arr) {
  url.searchParams.set(arr[0], arr[1]);
});
_paq.push(['setCustomUrl', url.href]);
_paq.push(['disableCookies']);
/* Hebcal anonymous userid */
const d0=document; const c0=d0.cookie;
if(c0&&c0.length&&typeof URLSearchParams=='function'){
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
  }
}
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
(function() {
  const u='/ma/';
  _paq.push(['setTrackerUrl', u+'ma.php']);
  _paq.push(['setSiteId', '1']);
  const d=document; const g=d.createElement('script'); const s=d.getElementsByTagName('script')[0];
  g.nonce='<%=nonce%>';
  g.async=true; g.src=u+'ma.js'; s.parentNode.insertBefore(g,s);
})();
