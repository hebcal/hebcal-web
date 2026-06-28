import {basename} from 'node:path';
import {CACHE_CONTROL_IMMUTABLE, cacheControl} from './cacheControl.js';

export const DOCUMENT_ROOT = process.env.NODE_ENV === 'production' ? '/var/www/html' : './static';

const HEBCAL_HOSTNAME = 'www.hebcal.com';

function getHostname(ctx) {
  const hostStr = ctx.get('host') || HEBCAL_HOSTNAME;
  const [host] = hostStr.split(':');
  if (host === 'hebcal.com' || host.endsWith('.hebcal.com') ||
      host === '127.0.0.1' || host === 'localhost') {
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
      if (hostname === 'hebcal.com' || hostname.endsWith('.hebcal.com') ||
          hostname === '127.0.0.1') {
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
