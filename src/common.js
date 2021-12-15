import {HDate, Location, months, HebrewCalendar, greg, Zmanim} from '@hebcal/core';
import querystring from 'querystring';
import dayjs from 'dayjs';
import createError from 'http-errors';
import uuid from 'uuid-random';
import {nearestCity} from './nearestCity';
import {getEventCategories} from '@hebcal/rest-api';
import etag from 'etag';

export const langNames = {
  's': ['Sephardic transliterations', null],
  'a': ['Ashkenazis transliterations', null],
  'he-x-NoNikud': ['עברית', 'Hebrew'],
  'h': ['עִברִית', 'Hebrew with nikud'],
  'es': ['español', 'Spanish'],
  'fr': ['français', 'French'],
  'de': ['Deutsch', 'German'],
  'ru': ['ру́сский язы́к', 'Russian'],
  'pl': ['język polski', 'Polish'],
  'fi': ['Suomalainen', 'Finnish'],
  'hu': ['Magyar nyelv', 'Hungarian'],
};

export const langTzDefaults = {
  AR: ['es', 'America/Argentina/Buenos_Aires'],
  AT: ['de', 'Europe/Vienna'],
  AU: ['s', 'Australia/Sydney'],
  BR: ['s', 'America/Sao_Paulo'],
  CA: ['s', 'America/Toronto'],
  CN: ['s', 'Asia/Shanghai'],
  DE: ['de', 'Europe/Berlin'],
  ES: ['es', 'Europe/Madrid'],
  FI: ['fi', 'Europe/Helsinki'],
  FR: ['fr', 'Europe/Paris'],
  GB: ['s', 'Europe/London'],
  HU: ['hu', 'Europe/Budapest'],
  IL: ['h', 'Asia/Jerusalem'],
  IN: ['s', 'Asia/Kolkata'],
  MX: ['es', 'America/Mexico_City'],
  NL: ['s', 'Europe/Amsterdam'],
  NZ: ['s', 'Pacific/Auckland'],
  PL: ['pl', 'Europe/Warsaw'],
  RO: ['s', 'Europe/Bucharest'],
  RU: ['ru', 'Europe/Moscow'],
  US: ['s', 'America/New_York'],
  ZA: ['s', 'Africa/Johannesburg'],
};

export const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

const negativeOpts = {
  maj: 'noHolidays',
  min: 'noMinorHolidays',
  nx: 'noRoshChodesh',
  mod: 'noModern',
  mf: 'noMinorFast',
  ss: 'noSpecialShabbat',
};

/*
const optsToMask = {
  maj: flags.YOM_TOV_ENDS | flags.MAJOR_FAST |
    flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS | flags.CHANUKAH_CANDLES,
  nx: flags.ROSH_CHODESH,
  mod: flags.MODERN_HOLIDAY,
  mf: flags.MINOR_FAST,
  ss: flags.SPECIAL_SHABBAT | flags.SHABBAT_MEVARCHIM,
  c: flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS,
  o: flags.OMER_COUNT,
  s: flags.PARSHA_HASHAVUA,
  F: flags.DAF_YOMI,
  i: flags.IL_ONLY,
};
*/

const booleanOpts = {
  d: 'addHebrewDates',
  D: 'addHebrewDatesForEvents',
  o: 'omer',
  a: 'ashkenazi',
  c: 'candlelighting',
  i: 'il',
  s: 'sedrot',
  F: 'dafyomi',
  euro: 'euro',
  M: 'havdalahTzeit',
};

const numberOpts = {
  m: 'havdalahMins',
  b: 'candleLightingMins',
  ny: 'numYears',
};

const geoposLegacy = {
  ladeg: 90,
  lamin: 60,
  lodeg: 180,
  lomin: 60,
};

const primaryGeoKeys = ['geonameid', 'zip', 'city'];
const geoKeys = primaryGeoKeys.concat(['latitude', 'longitude', 'tzid']);
const allGeoKeys = geoKeys.concat(Object.keys(geoposLegacy)).concat(['city-typeahead']);
const cookieOpts = geoKeys.concat(['geo', 'lg'], Object.keys(numberOpts));

/**
 * @param {string} val
 * @return {boolean}
 */
export function empty(val) {
  return typeof val !== 'string' || val.length === 0;
}

/**
 * @param {string} val
 * @return {boolean}
 */
export function off(val) {
  return typeof val === 'undefined' || val === 'off' || val == '0';
}

/**
 * @param {Object.<string,string>} query
 * @param {Object.<string,string>} [override]
 * @return {Object.<string,string>}
 */
export function urlArgsObj(query, override={}) {
  const q = Object.assign({}, query, override);
  for (const key of getGeoKeysToRemove(q.geo)) {
    delete q[key];
  }
  if (q.M === 'on') {
    delete q.m;
  }
  delete q['.s'];
  for (const key of Object.keys(negativeOpts)) {
    if (off(q[key])) {
      q[key] = 'off';
    }
  }
  return q;
}

/**
 * @param {Object.<string,string>} query
 * @param {Object.<string,string>} [override]
 * @return {string}
 */
export function urlArgs(query, override={}) {
  const q = urlArgsObj(query, override);
  return querystring.stringify(q);
}

/**
 * @param {string} geo
 * @return {string[]}
 */
function getGeoKeysToRemove(geo) {
  if (empty(geo)) {
    return [];
  }
  switch (geo) {
    case 'pos': return primaryGeoKeys;
    case 'none': return allGeoKeys.concat(['b', 'm', 'M']);
    case 'geoname': return allGeoKeys.filter((k) => k !== 'geonameid');
    default: return allGeoKeys.filter((k) => k !== geo);
  }
}

/**
 * @param {Object.<string,string>} query
 * @param {string} uid
 * @return {string}
 */
function makeCookie(query, uid) {
  const ck = {};
  for (const key of Object.keys(negativeOpts)) {
    ck[key] = off(query[key]) ? 'off' : 'on';
  }
  for (const key of Object.keys(booleanOpts)) {
    if (key === 'euro') {
      continue;
    }
    ck[key] = (query[key] === 'on' || query[key] == '1') ? 'on' : 'off';
  }
  for (const key of cookieOpts) {
    if (typeof query[key] === 'number' ||
       (typeof query[key] === 'string' && query[key].length > 0)) {
      ck[key] = query[key];
    }
  }
  if (Object.keys(ck).length === 0) {
    return false;
  }
  uid = uid || uuid();
  return 'uid=' + uid + '&' + querystring.stringify(ck);
}

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
export function possiblySetCookie(ctx, query) {
  if (ctx.status === 400 || ctx.request.querystring.length === 0) {
    return false;
  }
  const prevCookie = ctx.cookies.get('C');
  if (prevCookie === 'opt_out') {
    return false;
  }
  const uid = prevCookie && prevCookie.startsWith('uid=') && prevCookie.substring(4, 40);
  const newCookie = makeCookie(query, uid);
  if (newCookie === false) {
    return false;
  }
  const ampersand = newCookie.indexOf('&');
  if (ampersand === -1) {
    return false;
  }
  if (prevCookie) {
    const prev = prevCookie.substring(prevCookie.indexOf('&'));
    const current = newCookie.substring(ampersand);
    if (prev === current) {
      return false;
    }
  }
  setCookie(ctx, newCookie);
  return true;
}

/**
 * @param {any} ctx
 * @param {string} newCookie
 */
function setCookie(ctx, newCookie) {
  ctx.cookies.set('C', newCookie, {
    expires: dayjs().add(1, 'year').toDate(),
    overwrite: true,
    httpOnly: false,
  });
  const visitor = ctx.state.visitor;
  if (typeof visitor === 'object' && typeof visitor.set === 'function') {
    const newUuid = newCookie.substring(4, 40);
    visitor.set('uid', newUuid);
  }
}

/**
 * @param {string} cookieString
 * @param {Object.<string,string>} defaults
 * @param {Object.<string,string>} query0
 * @return {any}
 */
export function processCookieAndQuery(cookieString, defaults, query0) {
  const query = Object.assign({}, query0);
  const ck = querystring.parse(cookieString || '');
  delete ck.t;
  delete ck.uid;
  let found = false;
  for (const geoKey of primaryGeoKeys) {
    if (!empty(query[geoKey]) && query[geoKey].trim().length > 0) {
      for (const key of allGeoKeys.filter((k) => k !== geoKey)) {
        delete ck[key];
        delete query[key];
      }
      found = true;
      break;
    }
  }
  if (!found) {
    const geo = query.geo;
    const toRemove = (geo === 'pos') ? primaryGeoKeys : (geo === 'none') ? allGeoKeys : [];
    for (const key of toRemove) {
      delete ck[key];
      delete query[key];
    }
  }
  return Object.assign({}, defaults, ck, query);
}

const reIsoDate = /^\d\d\d\d-\d\d-\d\d/;

/**
 * Parse a string YYYY-MM-DD and return Date
 * @param {string} str
 * @return {Date}
 */
export function isoDateStringToDate(str) {
  if (!reIsoDate.test(str)) {
    throw createError(400, `Date must match format YYYY-MM-DD: ${str}`);
  }
  const yy = parseInt(str, 10);
  const mm = parseInt(str.substring(5, 7), 10);
  const dd = parseInt(str.substring(8, 10), 10);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  return dt;
}

/**
 * Returns the date in the query string or today
 * @param {Object.<string,string>} query
 * @return {Date}
 */
export function getTodayDate(query) {
  if (!empty(query.dt)) {
    try {
      const dt = isoDateStringToDate(query.dt);
      return dt;
    } catch (err) {
      return new Date();
    }
  }
  const isToday = Boolean(empty(query.gy) || empty(query.gm) || empty(query.gd));
  return isToday ? new Date() : makeGregDate(query.gy, query.gm, query.gd);
}

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {HebrewCalendar.Options}
 */
export function makeHebcalOptions(db, query) {
  const options = {};
  // map very old "nh=on" to 5 new parameters
  if (query.nh === 'on') {
    Object.keys(negativeOpts).filter((x) => x !== 'nx').forEach((x) => query[x] = 'on');
    delete query.nh;
  }
  // translate lowercase &m=on to &M=on before proceessing booleanOpts
  if (query.m === 'on') {
    query.M = 'on';
    delete query.m;
  }
  for (const [key, val] of Object.entries(booleanOpts)) {
    if (typeof query[key] === 'string' &&
      (query[key] === 'on' || query[key] === '1')) {
      options[val] = true;
    }
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (off(query[key])) {
      options[val] = true;
    }
  }
  if (!options.noRoshChodesh && !options.noSpecialShabbat) {
    options.shabbatMevarchim = true;
  }
  // Before we parse numberOpts, check for tzeit preference
  if (options.havdalahTzeit) {
    options.havdalahDeg = 8.5;
    delete options.havdalahTzeit;
    delete query.m;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof query[key] === 'string' && query[key].length) {
      const num = parseInt(query[key], 10);
      if (isNaN(num)) {
        delete query[key];
      } else {
        options[val] = num;
      }
    }
  }
  if (!empty(query.yt)) {
    options.isHebrewYear = Boolean(query.yt === 'H');
  }
  if (!empty(query.year)) {
    if (query.year === 'now') {
      if (options.isHebrewYear) {
        options.year = new HDate().getFullYear();
      } else {
        const dt = new Date();
        options.year = dt.getFullYear();
        if (query.month === 'now') {
          query.month = String(dt.getMonth() + 1);
        }
      }
      query.year = String(options.year);
    } else {
      options.year = parseInt(query.year, 10);
      if (isNaN(options.year)) {
        throw createError(400, `Sorry, invalid year ${query.year}`);
      } else if (options.isHebrewYear && options.year < 1) {
        throw createError(400, 'Sorry, Hebrew year must be 1 or later');
      }
    }
  }
  if (!empty(query.month)) {
    const month = parseInt(query.month, 10);
    if (month >= 1 && month <= 12) {
      options.month = month;
    } else {
      delete query.month; // month=x is default, implies entire year
    }
  }
  for (const param of ['start', 'end']) {
    if (!empty(query[param])) {
      options[param] = isoDateStringToDate(query[param]);
    }
  }
  if (options.ashkenazi && empty(query.lg)) {
    query.lg = 'a';
  }
  if (!empty(query.lg)) {
    const lg = query.lg;
    options.locale = lgToLocale[lg] || lg;
    if (lg === 'ah' || lg === 'sh') {
      options.appendHebrewToSubject = true;
    }
  }
  if (options.candlelighting && typeof options.year === 'number' &&
      ((options.isHebrewYear && options.year < 5661) || options.year < 1900)) {
    options.candlelighting = false;
  }
  if (options.candlelighting) {
    const location = getLocationFromQuery(db, query);
    if (location) {
      options.location = location;
      if (location.getIsrael()) {
        options.il = true;
        if (location.getShortName() === 'Jerusalem' &&
            (typeof options.candleLightingMins !== 'number' ||
            options.candleLightingMins === 18)) {
          options.candleLightingMins = 40;
        }
      }
    } else {
      delete options.candlelighting;
    }
  }
  return options;
}

const tzidMap = {
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
  'US/Alaska': 'America/Anchorage',
  'US/Hawaii': 'Pacific/Honolulu',
  'US/Aleutian': 'Pacific/Honolulu',
};

/**
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {Location}
 */
export function getLocationFromQuery(db, query) {
  if (!empty(query.geonameid)) {
    const location = db.lookupGeoname(parseInt(query.geonameid, 10));
    if (location == null) {
      throw createError(404, `Sorry, can't find geonameid: ${query.geonameid}`);
    }
    query.geo = 'geoname';
    return location;
  } else if (!empty(query.zip)) {
    const location = db.lookupZip(query.zip);
    if (location == null) {
      throw createError(404, `Sorry, can't find ZIP code: ${query.zip}`);
    }
    query.geo = 'zip';
    return location;
  } else if (!empty(query.city)) {
    const location = db.lookupLegacyCity(query.city);
    if (location == null) {
      throw createError(404, `Invalid legacy city specified: ${query.city}`);
    }
    query.geo = 'geoname';
    query.geonameid = location.getGeoId();
    return location;
  } else if (!empty(query.latitude) && !empty(query.longitude)) {
    if (empty(query.tzid)) {
      throw createError(400, 'Timezone required');
    } else if (query.tzid === 'undefined' || query.tzid === 'null') {
      throw createError(400, `Invalid time zone specified: ${query.tzid}`);
    }
    let il = query.i === 'on';
    if (query.tzid === 'Asia/Jerusalem') {
      il = true;
    } else if (query.tzid[0] === ' ' || query.tzid[0] === '-' || query.tzid[0] === '+') {
      // hack for client who passes +03:00 or -02:00 ("+" url-decodes to " ")
      const m = query.tzid.match(/^([ +-])(\d\d):00$/);
      if (m && m[2]) {
        const dir = m[1] === '-' ? '-' : '+';
        query.tzid = 'Etc/GMT' + dir + parseInt(m[2], 10);
      }
    }
    query.tzid = tzidMap[query.tzid] || query.tzid;
    const latitude = parseFloat(query.latitude);
    if (isNaN(latitude)) {
      throw createError(400, `Invalid latitude specified: ${query.latitude}`);
    }
    const longitude = parseFloat(query.longitude);
    if (isNaN(longitude)) {
      throw createError(400, `Invalid longitude specified: ${query.longitude}`);
    }
    const cityName = query['city-typeahead'] || makeGeoCityName(latitude, longitude, query.tzid);
    query.geo = 'pos';
    return new Location(latitude, longitude, il, query.tzid, cityName);
  } else if (hasLatLongLegacy(query)) {
    let tzid = query.tzid;
    if (empty(tzid) && !empty(query.tz) && !empty(query.dst)) {
      tzid = Location.legacyTzToTzid(query.tz, query.dst);
      if (!tzid && query.dst === 'none') {
        const tz = parseInt(query.tz, 10);
        const plus = tz > 0 ? '+' : '';
        tzid = `Etc/GMT${plus}${tz}`;
      }
    }
    if (!tzid) {
      throw createError(400, 'Timezone required');
    }
    for (const [key, max] of Object.entries(geoposLegacy)) {
      if (empty(query[key]) || parseInt(query[key], 10) > max) {
        throw createError(400, `Sorry, ${key}=${query[key]} out of valid range 0-${max}`);
      }
    }
    let latitude = parseInt(query.ladeg, 10) + (parseInt(query.lamin, 10) / 60.0);
    let longitude = parseInt(query.lodeg, 10) + (parseInt(query.lomin, 10) / 60.0);
    if (query.ladir === 's') {
      latitude *= -1;
    }
    if (query.lodir === 'w') {
      longitude *= -1;
    }
    let il = query.i === 'on';
    if (tzid === 'Asia/Jerusalem') {
      il = true;
    }
    tzid = tzidMap[tzid] || tzid;
    query.latitude = latitude;
    query.longitude = longitude;
    query.tzid = tzid;
    const cityName = query['city-typeahead'] || makeGeoCityName(latitude, longitude, tzid);
    query.geo = 'pos';
    return new Location(latitude, longitude, il, tzid, cityName);
  } else if (query.geo === 'pos') {
    if (empty(query.latitude) && empty(query.longitude)) {
      query.geo = 'none';
      return null;
    } else {
      throw createError(400, 'geo=pos requires latitude, longitude, tzid parameters');
    }
  }
  return null;
}

/**
 * @private
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
function hasLatLongLegacy(query) {
  for (const k of ['ladir', 'lodir'].concat(Object.keys(geoposLegacy))) {
    if (empty(query[k])) {
      return false;
    }
  }
  return true;
}

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} tzid
 * @return {string}
 */
function makeGeoCityName(latitude, longitude, tzid) {
  const ladir = latitude < 0 ? 'S' : 'N';
  const ladeg = latitude < 0 ? Math.ceil(latitude) * -1 : Math.floor(latitude);
  const lamin = Math.floor(60 * (Math.abs(latitude) - ladeg));
  const lodir = longitude < 0 ? 'W' : 'E';
  const lodeg = longitude < 0 ? Math.ceil(longitude) * -1 : Math.floor(longitude);
  const lomin = Math.floor(60 * (Math.abs(longitude) - lodeg));

  return `${ladeg}°${lamin}′${ladir} ${lodeg}°${lomin}′${lodir} ${tzid}`;
}

export const localeMap = {
  'de': 'de',
  'es': 'es',
  'fi': 'fi',
  'fr': 'fr',
  'he': 'he',
  'he-x-NoNikud': 'he',
  'he-x-nonikud': 'he',
  'hu': 'hu',
  'h': 'he',
  'pl': 'pl',
  'ru': 'ru',
};

/**
 * @param {HDate} hdate today
 * @return {number}
 */
export function getDefaultHebrewYear(hdate) {
  const today = hdate.abs();
  const hy0 = hdate.getFullYear();
  const av15 = new HDate(15, months.AV, hy0).abs();
  return today > av15 ? hy0 + 1 : hy0;
}

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';

/**
 * Perform a 302 redirect to `rpath`.
 * @param {any} ctx
 * @param {string} rpath
 * @param {number} status
 */
export function httpRedirect(ctx, rpath, status=302) {
  const proto = ctx.get('x-forwarded-proto') || 'http';
  const host = ctx.get('host') || 'www.hebcal.com';
  ctx.status = status;
  if (status === 301) {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
  }
  ctx.redirect(`${proto}://${host}${rpath}`);
}

/**
 * @param {any} ctx
 * @param {HebrewCalendar.Options} options
 * @return {Event[]}
 */
export function makeHebrewCalendar(ctx, options) {
  let events;
  try {
    events = HebrewCalendar.calendar(options);
  } catch (err) {
    ctx.throw(400, err);
  }
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  return events;
}

/**
 * @param {any} ctx
 * @return {string}
 */
export function getIpAddress(ctx) {
  return ctx.get('x-client-ip') || ctx.request.ip;
}

/**
 * @param {string} email
 * @return {boolean}
 */
export function validateEmail(email) {
  // eslint-disable-next-line max-len
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

/**
 * MaxMind geoIP lookup GeoLite2-Country.mmdb
 * @return {any}
 * @param {any} ctx
 * @param {number} maxAccuracyRadius
 */
export function getLocationFromGeoIp(ctx, maxAccuracyRadius=500) {
  if (!ctx.geoipCity) {
    return {geo: 'none'};
  }
  const ip = getIpAddress(ctx);
  const geoip = ctx.geoipCity.get(ip);
  if (!geoip) {
    return {geo: 'none'};
  }
  const gloc = {details: geoip};
  if (typeof geoip.location === 'object' &&
        typeof geoip.location.time_zone === 'string' &&
        typeof geoip.location.latitude === 'number' &&
        typeof geoip.location.longitude === 'number') {
    gloc.latitude = geoip.location.latitude;
    gloc.longitude = geoip.location.longitude;
    gloc.tzid = geoip.location.time_zone;
    gloc.cc = geoip.country && geoip.country.iso_code;
    gloc.accuracy_radius = geoip.location.accuracy_radius;
  }
  if (typeof geoip.postal === 'object' &&
        typeof geoip.postal.code === 'string' &&
        geoip.postal.code.length === 5 &&
        typeof geoip.country === 'object' &&
        geoip.country.iso_code === 'US') {
    gloc.geo = 'zip';
    gloc.zip = geoip.postal.code;
    return gloc;
  }
  if (typeof geoip.city === 'object' &&
        typeof geoip.city.geoname_id === 'number') {
    gloc.geo = 'geoname';
    gloc.geonameid = geoip.city.geoname_id;
    return gloc;
  }
  if (typeof geoip.location === 'object' &&
        typeof geoip.location.time_zone === 'string' &&
        typeof geoip.location.latitude === 'number' &&
        typeof geoip.location.longitude === 'number') {
    gloc.geo = 'pos';
    if (geoip.location.accuracy_radius > maxAccuracyRadius) {
      return gloc;
    }
    const city = nearestCity(ctx.db.geonamesDb,
        geoip.location.latitude,
        geoip.location.longitude,
        geoip.location.time_zone);
    if (city !== null) {
      gloc.geo = 'geoname';
      gloc.geonameid = city.geonameid;
      gloc.nn = true;
    }
    return gloc;
  }
  gloc.geo = 'none';
  return gloc;
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
  const location = getLocationFromQueryOrGeoIp(ctx, q);
  let cc = 'US';
  let tzid = null;
  if (location !== null) {
    tzid = location.getTzid();
    cc = location.getCountryCode();
    if (location.getIsrael()) {
      q.i = 'on';
    }
  } else {
    const ip = getIpAddress(ctx);
    cc = ctx.geoipCountry ? ctx.geoipCountry.get(ip) || 'US' : 'US';
  }
  const ccDefaults = langTzDefaults[cc] || langTzDefaults['US'];
  const lg = ctx.state.lg = q.lg = q.lg || ccDefaults[0];
  ctx.state.lang = ctx.state.locale = localeMap[lg] || 'en';
  ctx.state.countryCode = cc;
  ctx.state.timezone = tzid || ccDefaults[1];
  ctx.state.location = location;
  ctx.state.il = q.i === 'on' || cc === 'IL' || ctx.state.timezone === 'Asia/Jerusalem';
  ctx.state.q = q;
  return q;
}

/**
 * @param {any} ctx
 * @param {any} q
 * @return {any}
 */
function getLocationFromQueryOrGeoIp(ctx, q) {
  let location = getLocationFromQuery(ctx.db, q);
  if (location !== null) {
    return location;
  }
  // try to infer location from GeoIP
  const gloc = ctx.state.geoip = getLocationFromGeoIp(ctx, 1000);
  if (gloc.zip || gloc.geonameid) {
    const geoip = {};
    for (const [key, val] of Object.entries(gloc)) {
      if (key !== 'details') {
        geoip[key] = String(val);
      }
    }
    try {
      location = getLocationFromQuery(ctx.db, geoip);
      return location;
    } catch (err) {
      // ignore
    }
  }
  if (typeof gloc.latitude === 'number') {
    return new Location(gloc.latitude, gloc.longitude, gloc.cc === 'IL', gloc.tzid, null, gloc.cc);
  }
  return null;
}

/**
 * @param {string} gy Gregorian Year
 * @param {string} gm Gregorian Month
 * @param {string} gd Gregorian Day
 * @return {Date}
 */
export function makeGregDate(gy, gm, gd) {
  const yy = parseInt(gy, 10);
  const mm = parseInt(gm, 10);
  const dd = parseInt(gd, 10);
  if (isNaN(dd)) {
    throw createError(400, `Gregorian day must be numeric: ${gd}`);
  } else if (isNaN(mm)) {
    throw createError(400, `Gregorian month must be numeric: ${gm}`);
  } else if (isNaN(yy)) {
    throw createError(400, `Gregorian year must be numeric: ${gy}`);
  } else if (mm > 12 || mm < 1) {
    throw createError(400, `Gregorian month out of valid range 1-12: ${gm}`);
  } else if (yy > 9999) {
    throw createError(400, `Gregorian year cannot be greater than 9999: ${gy}`);
  }
  const maxDay = greg.daysInMonth(mm, yy);
  if (dd < 1 || dd > maxDay) {
    throw createError(400, `Gregorian day ${dd} out of valid range for ${mm}/${yy}`);
  }
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  // Hebrew date 1 Tishrei 1 == Gregorian -003760-09-07
  if (dt.getTime() < -180799747622000) {
    const s = dt.toISOString();
    const isoDate = s.substring(0, s.indexOf('T'));
    throw createError(400, `Gregorian date before Hebrew year 1: ${isoDate}`);
  }
  return dt;
}

/**
 * @param {string} hyStr Hebrew Year
 * @param {string} hmStr Hebrew Month
 * @param {string} hdStr Hebrew Day
 * @return {HDate}
 */
export function makeHebDate(hyStr, hmStr, hdStr) {
  const hy = parseInt(hyStr, 10);
  const hd = parseInt(hdStr, 10);
  if (isNaN(hd)) {
    throw createError(400, 'Hebrew day must be numeric');
  } else if (isNaN(hy)) {
    throw createError(400, 'Hebrew year must be numeric');
  } else if (hy < 1) {
    throw createError(400, 'Hebrew year must be year 1 or later');
  } else if (hy > 32000) {
    throw createError(400, 'Hebrew year is too large');
  }
  const hm = HDate.monthFromName(hmStr);
  const maxDay = HDate.daysInMonth(hm, hy);
  if (hd < 1 || hd > maxDay) {
    const monthName = HDate.getMonthName(hm, hy);
    throw createError(400, `Hebrew day out of valid range 1-${maxDay} for ${monthName} ${hy}`);
  }
  return new HDate(hd, hm, hy);
}

/**
 * @param {Date} dt
 * @param {Location} location
 * @return {any}
 */
export function getBeforeAfterSunsetForLocation(dt, location) {
  const tzid = location.getTzid();
  const isoDate = Zmanim.formatISOWithTimeZone(tzid, dt);
  const gy = parseInt(isoDate.substring(0, 4), 10);
  const gm = parseInt(isoDate.substring(5, 7), 10);
  const gd = parseInt(isoDate.substring(8, 10), 10);
  const day = new Date(gy, gm - 1, gd);
  const zman = new Zmanim(day, location.getLatitude(), location.getLongitude());
  const sunset = zman.sunset();
  const afterSunset = Boolean(dt >= sunset);
  return {dt: day, afterSunset: afterSunset, gy, gd, gm};
}

/**
 * @private
 * @param {Object.<string,string>} options
 * @param {Object.<string,string>} attrs
 * @return {string}
 */
export function eTagFromOptions(options, attrs) {
  const etagObj = Object.assign({version: HebrewCalendar.version()},
      options, attrs);
  return etag(JSON.stringify(etagObj), {weak: true});
}

const MAX_DAYS = 45;

/**
 * @typedef {Object} StartAndEnd
 * @property {dayjs.Dayjs} startD
 * @property {dayjs.Dayjs} endD
 * @property {boolean} isRange
 */

/**
 * @param {Object.<string,string>} q
 * @param {string} tzid
 * @return {StartAndEnd}
 */
export function getStartAndEnd(q, tzid) {
  if (!empty(q.start) && empty(q.end)) {
    q.end = q.start;
  } else if (empty(q.start) && !empty(q.end)) {
    q.start = q.end;
  }
  if (!empty(q.start) && !empty(q.end) && q.start === q.end) {
    q.date = q.start;
    delete q.start;
    delete q.end;
  }
  let isRange = !empty(q.start) && !empty(q.end);
  const singleD = isRange ? null : empty(q.date) ? nowInTimezone(tzid) : isoToDayjs(q.date);
  const startD = isRange ? isoToDayjs(q.start) : singleD;
  let endD = isRange ? isoToDayjs(q.end) : singleD;
  if (isRange) {
    if (endD.isBefore(startD, 'd')) {
      isRange = false;
      endD = startD;
    } else if (endD.diff(startD, 'd') > MAX_DAYS) {
      endD = startD.add(MAX_DAYS, 'd');
    }
  }
  return {isRange, startD, endD};
}

/**
 * @param {string} tzid
 * @return {dayjs.Dayjs}
 */
export function nowInTimezone(tzid) {
  const isoDate = Zmanim.formatISOWithTimeZone(tzid, new Date());
  return dayjs(isoDate.substring(0, 10));
}

/**
 * @param {string} str
 * @return {dayjs.Dayjs}
 */
function isoToDayjs(str) {
  return dayjs(isoDateStringToDate(str));
}

const hebrewRe = /([\u0590-\u05FF][\s\u0590-\u05FF]+[\u0590-\u05FF])/g;

/**
 * @param {string} str
 * @return {string}
 */
export function wrapHebrewInSpans(str) {
  return str.replace(hebrewRe, `<span lang="he" dir="rtl">$&</span>`);
}

// eslint-disable-next-line require-jsdoc
export function stopIfTimedOut() {
  return async function stopIfTimedOut0(ctx, next) {
    if (!ctx.state.timeout) {
      await next();
    }
  };
}

export const bookId = {
  Genesis: 1,
  Exodus: 2,
  Leviticus: 3,
  Numbers: 4,
  Deuteronomy: 5,
};

/**
 * @private
 * @param {Aliyah|Aliyah[]} aliyah
 * @param {boolean} sefAliyot
 * @return {string}
 */
export function sefariaAliyahHref(aliyah, sefAliyot) {
  if (Array.isArray(aliyah)) {
    aliyah = aliyah[0];
  }
  const beginStr = aliyah.b.replace(':', '.');
  const cv1 = beginStr.split('.');
  const end = aliyah.e.replace(':', '.');
  const cv2 = end.split('.');
  const endStr = beginStr === end ? '' : cv1[0] === cv2[0] ? '-' + cv2[1] : '-' + end;
  const book = aliyah.k;
  const suffix = bookId[book] ? `&aliyot=${sefAliyot ? 1 : 0}` : '';
  return `https://www.sefaria.org/${aliyah.k}.${beginStr}${endStr}?lang=bi${suffix}`;
}

const maxNumYear = {
  candlelighting: 4,
  omer: 4,
  addHebrewDatesForEvents: 3,
  addHebrewDates: 2,
  dafyomi: 2,
};

/**
 * Parse HebcalOptions to determine ideal numYears
 * @param {HebrewCalendar.Options} options
 * @return {number}
 */
export function getNumYears(options) {
  if (options.numYears) {
    return options.numYears;
  }

  if ((!options.isHebrewYear && options.year < 2016) ||
    (options.isHebrewYear && options.year < 5776)) {
    return 1;
  }

  let numYears = 5;
  for (const [key, ny] of Object.entries(maxNumYear)) {
    if (options[key] && ny < numYears) {
      numYears = ny;
    }
  }
  // Shabbat plus Hebrew Event every day can get very big
  const hebrewDates = options.addHebrewDates || options.addHebrewDatesForEvents;
  if (options.candlelighting && hebrewDates) {
    numYears = 2;
  }
  // reduce size of file for truly crazy people who specify both Daf Yomi and Hebrew Date every day
  if (options.dafyomi && hebrewDates) {
    numYears = 1;
  }
  return numYears;
}

/**
 * @private
 * @param {HebrewCalendar.Options} options
 * @param {Object.<string,string>} query
 * @return {Object.<string,string>}
 */
export function makeIcalOpts(options, query) {
  const icalOpts = Object.assign({}, options);
  if (query.emoji === '1' || query.emoji === 'on') {
    icalOpts.emoji = true;
  }
  for (const key of ['title', 'caldesc', 'publishedTTL', 'subscribe']) {
    if (!empty(query[key])) {
      icalOpts[key] = query[key];
    }
  }
  return icalOpts;
}
