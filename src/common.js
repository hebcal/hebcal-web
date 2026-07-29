import {basename} from 'node:path';
import {CACHE_CONTROL_IMMUTABLE, cacheControl} from './cacheControl.js';

export const DOCUMENT_ROOT = process.env.NODE_ENV === 'production' ? '/var/www/html' : './static';

const HEBCAL_HOSTNAME = 'www.hebcal.com';

function getHostname(ctx) {
  const hostStr = ctx.get('host') || '';
  const [host] = hostStr.split(':');
  if (isTrustedHostname(host)) {
    return hostStr;
  }
  return HEBCAL_HOSTNAME;
}

export function hebrewFontPreload(ctx) {
  ctx.append('Link', '</i/adobehebrew-regular.woff2>; rel=preload; as=font; type="font/woff2"; crossorigin');
}

const CACHE_CONTROL = 'Cache-Control';

/**
 * Perform a 302 redirect to `rpath`.
 * @param {import('koa').Context} ctx
 * @param {string} rpath
 * @param {number} status
 */
export function httpRedirect(ctx, rpath, status=302) {
  const proto = ctx.get('x-forwarded-proto') || 'http';
  const host = getHostname(ctx);
  ctx.status = status;
  if (status === 301) {
    ctx.set(CACHE_CONTROL, CACHE_CONTROL_IMMUTABLE);
  } else if (!ctx.has(CACHE_CONTROL)) {
    ctx.set(CACHE_CONTROL, cacheControl(0.25));
  }
  let url = `${proto}://${host}${rpath}`;
  const u = new URL(url);
  const qs = u.searchParams;
  let utmSource = qs.get('utm_source') || qs.get('us');
  if (!utmSource) {
    utmSource = utmSourceFromRef(ctx);
    if (utmSource) {
      const sep = rpath.includes('?') ? '&' : '?';
      url += `${sep}utm_source=${utmSource}`;
      ctx.append('Vary', 'Referer');
    }
  }
  ctx.redirect(url);
}

const hebrewRe = /([\u0590-\u05FF][\s\u0590-\u05FF]+[\u0590-\u05FF])/g;

/**
 * @param {string} str
 * @return {string}
 */
export function wrapHebrewInSpans(str) {
  return str.replaceAll(hebrewRe, `<span lang="he" dir="rtl">$&</span>`);
}

const hebcalPrefix = `https://${HEBCAL_HOSTNAME}/`;

/**
 * @param {string} url
 * @return {string}
 */
export function shortenUrl(url) {
  if (typeof url === 'string' && url.startsWith(hebcalPrefix)) {
    url = url.substring(hebcalPrefix.length - 1);
    const utm = url.indexOf('utm_source=');
    if (utm !== -1) {
      url = url.substring(0, utm - 1);
    }
  }
  return url;
}

export function utmSourceFromRef(ctx) {
  const ref = ctx.get('referer');
  if (ref?.length) {
    try {
      const refUrl = new URL(ref);
      const hostname = refUrl.hostname.toLowerCase();
      if (isTrustedHostname(hostname)) {
        return undefined;
      }
      if (hostname.startsWith('www.')) {
        return hostname.substring(4);
      }
      return hostname;
    } catch (err) {
      // ignore errors in invalid referrer URL
      ctx.logger.warn(err, `invalid referrer ${ref}`);
    }
  }
  return undefined;
}

/**
 * Hostnames permitted to make state-changing cross-origin requests.
 * @private
 * @param {string} hostname
 * @return {boolean}
 */
function isTrustedHostname(hostname) {
  hostname = hostname.toLowerCase();
  return hostname === 'hebcal.com' || hostname.endsWith('.hebcal.com') ||
    hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * CSRF mitigation for state-changing POST endpoints (e.g. email subscribe).
 *
 * Browsers always attach an `Origin` header to cross-site POST requests, so a
 * forged cross-site POST can be rejected by inspecting it. Requests with no
 * `Origin` header are allowed through, because those are not browser-driven
 * cross-site requests: server-to-server callers, RFC 8058 `List-Unsubscribe`
 * one-click POSTs (sent by Gmail/Apple Mail with no Origin), and non-browser
 * API clients. This blocks the email-bombing vector (a page on another origin
 * silently POSTing a victim's address to trigger a confirmation email) without
 * breaking legitimate same-origin or non-browser traffic.
 *
 * No-ops for non-POST requests, so it is safe to call at the top of a handler
 * that serves both GET (render form) and POST (submit).
 *
 * @param {import('koa').Context} ctx
 */
export function rejectForgedCrossOriginPost(ctx) {
  if (ctx.method !== 'POST') {
    return;
  }
  const origin = ctx.get('origin');
  if (!origin) {
    // No Origin header: not a browser cross-site request. Allow.
    return;
  }
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    ctx.throw(403, 'Forbidden: malformed Origin header');
  }
  if (!isTrustedHostname(hostname)) {
    ctx.throw(403, 'Forbidden: cross-origin request not allowed');
  }
}

/**
 * @param {import('koa').Context} ctx
 * @return {string}
 */
export function getBaseFromPath(ctx) {
  try {
    return decodeURIComponent(basename(ctx.request.path));
  } catch (err) {
    ctx.throw(400, err.message, err);
  }
}

// JSON.stringify leaves these characters raw, and each is a hazard once the
// result sits inside something an HTML or JavaScript parser will read:
//   <  >  &    can terminate an enclosing <script> block or open a tag when the
//              payload is read by an HTML parser rather than a JS parser. Note
//              that <script type="application/json"> is *not* executed but is
//              still parsed as markup, so a bare </script> inside the data ends
//              the block and everything after it becomes live HTML.
//   U+2028/9   were line terminators in JavaScript before ES2019, so they could
//              split a string literal and change what the surrounding script does.
// Escaping them as \uXXXX is semantically invisible -- any JSON or JS parser
// decodes the escape back to the identical character -- but it makes the bytes
// on the wire inert. A global replace is safe because none of these characters
// can appear as JSON structure; they only ever occur inside string literals.
const UNSAFE_FOR_SCRIPT_RE = /[<>&\u2028\u2029]/g;

function escapeForScript(json) {
  return json.replaceAll(UNSAFE_FOR_SCRIPT_RE,
      (ch) => '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0'));
}

/**
 * Serialize `obj` for embedding inside a `<script>` element or a JavaScript
 * response body. Use this instead of a bare `JSON.stringify()` anywhere the
 * result lands in markup -- notably the `<%- %>` blocks in the EJS templates,
 * where an unescaped `</script>` in the data would break out of the element.
 *
 * Exposed to every template as a local by `app-www.js`.
 *
 * @param {any} obj
 * @return {string}
 */
export function jsonForScript(obj) {
  return escapeForScript(JSON.stringify(obj));
}

// A JSONP callback is emitted verbatim into a JavaScript response body, so it
// must be a dotted chain of plain JS identifiers and nothing else. This is an
// allowlist test rather than a strip-the-bad-characters replace: a replace
// silently turns hostile input into some other callable name, whereas a
// caller who sends garbage should simply get plain JSON back.
const JSONP_CALLBACK_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const JSONP_CALLBACK_MAXLEN = 128;

/**
 * Serialize `obj` as JSON, wrapping it in a JSONP callback when the request
 * carries a well-formed `callback=` parameter.
 *
 * Sets the response content type as a side effect: `text/javascript` for
 * JSONP (the body is a script, not JSON) and `application/json` otherwise.
 *
 * @param {import('koa').Context} ctx
 * @param {any} obj
 * @return {string|any} JSONP string, or `obj` unchanged for plain JSON
 */
export function jsonpBody(ctx, obj) {
  const callback = ctx.request.query.callback;
  if (typeof callback === 'string' &&
      callback.length !== 0 &&
      callback.length <= JSONP_CALLBACK_MAXLEN &&
      JSONP_CALLBACK_RE.test(callback)) {
    ctx.type = 'text/javascript';
    return callback + '(' + jsonForScript(obj) + ')\n';
  }
  ctx.type = 'json';
  return obj;
}

/**
 * Return candle lighting time description based on day of week
 * @param {number} dow day of week
 * @return {string}
 */
export function lightCandlesWhen(dow) {
  if (dow === 5) {
    return 'before sundown';
  } else if (dow === 6) {
    return 'at nightfall';
  } else {
    return 'at dusk';
  }
}
