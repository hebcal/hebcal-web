import {cleanQuery} from './cleanQuery.js';
import {pickLanguage, localeMap, langTzDefaults} from './lang.js';
import {getLocationFromQueryOrGeoIp} from './location.js';
import {processCookieAndQuery} from './urlArgs.js';

/**
 * MaxMind geoIP lookup GeoLite2-City.mmdb
 * @return {Promise<any>}
 * @param {import('koa').Context} ctx
 */
export async function setDefautLangTz(ctx) {
  ctx.set('Cache-Control', 'private'); // personalize by cookie or GeoIP
  const prevCookie = ctx.cookies.get('C');
  const q = processCookieAndQuery(prevCookie, {}, ctx.request.query);
  cleanQuery(q);
  const location = await getLocationFromQueryOrGeoIp(ctx, q);
  const geoip = ctx.state.geoip;
  let cc = geoip?.cc;
  let tzid = geoip?.tzid;
  if (location !== null) {
    tzid = location.getTzid();
    cc = location.getCountryCode();
    if (location.getIsrael()) {
      q.i = 'on';
    }
  }
  // Otherwise cc/tzid fall back to ctx.state.geoip, which is populated from
  // the GeoLite2-City database (geoip.country.iso_code) by getLocationFromGeoIp().
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
