import {basename} from 'node:path';
import {getIpAddress} from './getIpAddress.js';
import {processCookieAndQuery} from './urlArgs.js';
import {localeMap, langTzDefaults, pickLanguage} from './lang.js';
import {cleanQuery} from './cleanQuery.js';
import {CACHE_CONTROL_IMMUTABLE} from './cacheControl.js';
import {getLocationFromQueryOrGeoIp} from './location.js';

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

/**
 * Perform a 302 redirect to `rpath`.
 * @param {any} ctx
 * @param {string} rpath
 * @param {number} status
 */
export function httpRedirect(ctx, rpath, status=302) {
  const proto = ctx.get('x-forwarded-proto') || 'http';
  const host = getHostname(ctx);
  ctx.status = status;
  if (status === 301) {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
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

/**
 * MaxMind geoIP lookup GeoLite2-Country.mmdb
 * @return {any}
 * @param {any} ctx
 */
export function setDefautLangTz(ctx) {
  ctx.set('Cache-Control', 'private'); // personalize by cookie or GeoIP
  const prevCookie = ctx.cookies.get('C');
  const q = processCookieAndQuery(prevCookie, {}, ctx.request.query);
  cleanQuery(q);
  const location = getLocationFromQueryOrGeoIp(ctx, q);
  const geoip = ctx.state.geoip;
  let cc = geoip?.cc;
  let tzid = geoip?.tzid;
  if (location !== null) {
    tzid = location.getTzid();
    cc = location.getCountryCode();
    if (location.getIsrael()) {
      q.i = 'on';
    }
  } else if (ctx.geoipCountry) {
    const ip = getIpAddress(ctx);
    cc = ctx.geoipCountry.get(ip);
  }
  const lg = ctx.state.lg = q.lg = pickLanguage(ctx, q, cc);
  ctx.state.lang = ctx.state.locale = localeMap[lg] || 'en';
  cc = cc || 'US';
  ctx.state.countryCode = cc;
  const ccDefaults = langTzDefaults[cc] || langTzDefaults['US'];
  ctx.state.timezone = tzid || ccDefaults[1];
  ctx.state.location = location;
  ctx.state.il = q.i === 'on' || cc === 'IL' || ctx.state.timezone === 'Asia/Jerusalem';
  ctx.state.q = q;
  return q;
}

const hebrewRe = /([\u0590-\u05FF][\s\u0590-\u05FF]+[\u0590-\u05FF])/g;

/**
 * @param {string} str
 * @return {string}
 */
export function wrapHebrewInSpans(str) {
  return str.replace(hebrewRe, `<span lang="he" dir="rtl">$&</span>`);
}

export function stopIfTimedOut() {
  return async function stopIfTimedOut0(ctx, next) {
    if (!ctx.state.timeout) {
      await next();
    }
  };
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
 * @param {any} ctx
 * @return {string}
 */
export function getBaseFromPath(ctx) {
  try {
    return decodeURIComponent(basename(ctx.request.path));
  } catch (err) {
    ctx.throw(400, err.message, err);
  }
}

export function throw410(ctx) {
  ctx.throw(410,
      `The requested resource ${ctx.request.path} is no longer available on this server ` +
      `and there is no forwarding address. Please remove all references to this resource.`);
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
