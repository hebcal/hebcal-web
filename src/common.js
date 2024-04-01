import {HDate, Location, HebrewCalendar, flags} from '@hebcal/core';
import '@hebcal/learning';
import createError from 'http-errors';
import uuid from 'uuid-random';
import {nearestCity} from './nearestCity.js';
import {getEventCategories} from '@hebcal/rest-api';
import etag from 'etag';
import {find as geoTzFind} from 'geo-tz';
import {basename} from 'path';
import {readJSON} from './readJSON.js';
import {empty, off} from './empty.js';
import {isoDateStringToDate} from './dateUtil.js';
import {getIpAddress} from './getIpAddress.js';

const pkg = readJSON('../package.json');

export const langNames = {
  's': ['Sephardic transliterations', null],
  'a': ['Ashkenazic transliterations', null],
  'h': ['עִברִית', 'Hebrew'],
  'he-x-NoNikud': ['עברית', 'Hebrew (no nikud)'],
  'fi': ['Suomalainen', 'Finnish'],
  'fr': ['français', 'French'],
  'de': ['Deutsch', 'German'],
  'hu': ['Magyar nyelv', 'Hungarian'],
  'pl': ['język polski', 'Polish'],
  'ro': ['Română', 'Romanian'],
  'ashkenazi_romanian': ['Română (Ashk.)', 'Romanian (Ashk.)'],
  'ru': ['ру́сский язы́к', 'Russian'],
  'es': ['español', 'Spanish'],
  'uk': ['українська', 'Ukrainian'],
};

export const langTzDefaults = {
  AR: ['es', 'America/Argentina/Buenos_Aires'],
  AT: ['de', 'Europe/Vienna'],
  AU: ['s', 'Australia/Sydney'],
  BE: ['fr', 'Europe/Brussels'],
  BM: ['es', 'Atlantic/Bermuda'],
  BR: ['s', 'America/Sao_Paulo'],
  CA: ['s', 'America/Toronto'],
  CH: ['de', 'Europe/Zurich'],
  CO: ['es', 'America/Bogota'],
  CN: ['s', 'Asia/Shanghai'],
  DE: ['de', 'Europe/Berlin'],
  ES: ['es', 'Europe/Madrid'],
  FI: ['fi', 'Europe/Helsinki'],
  FR: ['fr', 'Europe/Paris'],
  GB: ['s', 'Europe/London'],
  HU: ['hu', 'Europe/Budapest'],
  IL: ['h', 'Asia/Jerusalem'],
  IT: ['s', 'Europe/Rome'],
  IN: ['s', 'Asia/Kolkata'],
  MX: ['es', 'America/Mexico_City'],
  NL: ['s', 'Europe/Amsterdam'],
  NZ: ['s', 'Pacific/Auckland'],
  PA: ['es', 'America/Panama'],
  PH: ['s', 'Asia/Manila'],
  PL: ['pl', 'Europe/Warsaw'],
  RO: ['ro', 'Europe/Bucharest'],
  RU: ['ru', 'Europe/Moscow'],
  US: ['s', 'America/New_York'],
  UA: ['uk', 'Europe/Kiev'],
  VE: ['es', 'America/Caracas'],
  ZA: ['s', 'Africa/Johannesburg'],
};

export const hebcalFormDefaults = {
  maj: 'on',
  min: 'on',
  nx: 'on',
  mf: 'on',
  ss: 'on',
  mod: 'on',
  i: 'off',
  yt: 'G',
  lg: 's',
  b: 18,
  M: 'on',
};

export const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

const negativeOpts = {
  maj: 'noMajor',
  min: 'noMinorHolidays',
  nx: 'noRoshChodesh',
  mod: 'noModern',
  mf: 'noMinorFast',
  ss: 'noSpecialShabbat',
};

const optsToMask = {
  maj: flags.YOM_TOV_ENDS | flags.MAJOR_FAST |
    flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS |
    flags.MINOR_HOLIDAY | flags.EREV | flags.CHOL_HAMOED |
    flags.CHANUKAH_CANDLES,
  nx: flags.ROSH_CHODESH,
  mod: flags.MODERN_HOLIDAY,
  mf: flags.MINOR_FAST,
  ss: flags.SPECIAL_SHABBAT,
  o: flags.OMER_COUNT,
  s: flags.PARSHA_HASHAVUA,
  ykk: flags.YOM_KIPPUR_KATAN,
  molad: flags.MOLAD,
  min: flags.MINOR_HOLIDAY,
};

const booleanOpts = {
  d: 'addHebrewDates',
  D: 'addHebrewDatesForEvents',
  o: 'omer',
  a: 'ashkenazi',
  c: 'candlelighting',
  i: 'il',
  s: 'sedrot',
  euro: 'euro',
  M: 'havdalahTzeit',
  ykk: 'yomKippurKatan',
  molad: 'molad',
  yto: 'yomTovOnly',
  ue: 'useElevation',
};

export const dailyLearningOpts = {
  F: 'dafYomi',
  myomi: 'mishnaYomi',
  nyomi: 'nachYomi',
  dty: 'tanakhYomi',
  dr1: 'rambam1',
  yyomi: 'yerushalmi',
  dcc: 'chofetzChaim',
  dshl: 'shemiratHaLashon',
  dps: 'psalms',
  dw: 'dafWeeklySunday',
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
const geoKeys = primaryGeoKeys.concat(['latitude', 'longitude', 'elev', 'tzid']);
const allGeoKeys = geoKeys.concat(Object.keys(geoposLegacy)).concat(['city-typeahead']);
const cookieOpts = geoKeys.concat(['geo', 'lg'], Object.keys(numberOpts));

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
  } else if (q.M === 'off' && empty(q.m)) {
    q.M = 'on';
    delete q.m;
  }
  delete q['.s'];
  delete q.vis;
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
  return new URLSearchParams(q).toString();
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
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @param {string} uid
 * @return {string}
 */
function makeCookie(ctx, query, uid) {
  const ck = {};
  for (const key of Object.keys(negativeOpts)) {
    ck[key] = off(query[key]) ? 'off' : 'on';
  }
  for (const key of Object.keys(booleanOpts).concat(Object.keys(dailyLearningOpts))) {
    if (key === 'euro' || key === 'yto') {
      continue;
    }
    const value = query[key];
    ck[key] = (value === 'on' || value == '1') ? 'on' : 'off';
  }
  if (!empty(query.h12)) {
    ck.h12 = off(query.h12) ? '0' : '1';
  }
  for (const key of cookieOpts) {
    const value = query[key];
    if (typeof value === 'number' ||
       (typeof value === 'string' && value.length > 0)) {
      ck[key] = value;
    }
  }
  // don't persist candle lighting minutes if it's default val.
  // use double-equals instead of triple-equals deliberately
  // so strings will match numbers
  if (ck.b &&
      ((ck.zip && ck.b == DEFAULT_CANDLE_MINS) ||
       (ck.geonameid && ck.b == queryDefaultCandleMins(ck)))) {
    delete ck.b;
  }
  if (Object.keys(ck).length === 0) {
    return false;
  }
  uid = uid || uuid();
  ctx.state.visitorId = ctx.state.userId = uid;
  return 'uid=' + uid + '&' + new URLSearchParams(ck).toString();
}

/**
 * @param {any} ctx
 * @return {boolean}
 */
export function doesCookieNeedRefresh(ctx) {
  const prevCookie = ctx.cookies.get('C');
  if (!prevCookie) {
    return true;
  } else if (prevCookie === 'opt_out') {
    return false;
  }
  const prev0 = prevCookie.substring(prevCookie.indexOf('&'));
  const prevExp = prev0.indexOf('&exp=');
  if (prevExp === -1) {
    return true;
  }
  const expDt = isoDateStringToDate(prev0.substring(prevExp + 5));
  const expMillis = expDt.getTime();
  const now = Date.now();
  const diff = (expMillis - now) / (24 * 60 * 60 * 1000);
  return diff < 90;
}

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
export function possiblySetCookie(ctx, query) {
  if (ctx.status >= 400 || (ctx.method === 'GET' && ctx.request.querystring.length === 0)) {
    return false;
  }
  return setHebcalCookie(ctx, query);
}

/**
 * @param {any} ctx
 * @param {Object.<string,string>} query
 * @return {boolean}
 */
export function setHebcalCookie(ctx, query) {
  const prevCookie = ctx.cookies.get('C');
  if (prevCookie === 'opt_out') {
    return false;
  }
  const uid = prevCookie && prevCookie.startsWith('uid=') && prevCookie.substring(4, 40);
  const newCookie = makeCookie(ctx, query, uid);
  if (newCookie === false) {
    return false;
  }
  if (prevCookie) {
    const prev0 = prevCookie.substring(prevCookie.indexOf('&'));
    const prevExp = prev0.indexOf('&exp=');
    const prev = prevExp === -1 ? prev0 : prev0.substring(0, prevExp);
    const ampersand = newCookie.indexOf('&');
    const current = newCookie.substring(ampersand);
    if (prev === current && !doesCookieNeedRefresh(ctx)) {
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
  const prevCookie = ctx.cookies.get('C');
  const expires = new Date();
  expires.setDate(expires.getDate() + 399);
  newCookie += '&exp=' + expires.toISOString().substring(0, 10);
  const headerStr = 'C=' + newCookie + '; path=/; expires=' +
    expires.toUTCString();
  ctx.append('Set-Cookie', headerStr);
  if (empty(prevCookie)) {
    ctx.state.cookieBanner = true;
  }
}

/**
 * @param {string} str
 * @return {boolean}
 */
function is5DigitZip(str) {
  if (typeof str !== 'string') {
    return false;
  }
  const s = str.trim();
  if (s.length < 5) {
    return false;
  }
  for (let i = 0; i < 5; i++) {
    if (s.charCodeAt(i) > 57 || s.charCodeAt(i) < 48) {
      return false;
    }
  }
  return true;
}

/**
 * @param {string} cookieString
 * @param {Object.<string,string>} defaults
 * @param {Object.<string,string>} query0
 * @return {any}
 */
export function processCookieAndQuery(cookieString, defaults, query0) {
  const query = Object.assign({}, query0);
  const ck0 = new URLSearchParams(cookieString || '');
  const ck = {};
  for (const [key, value] of ck0.entries()) {
    ck[key] = value;
  }
  delete ck.t;
  delete ck.uid;
  let found = false;
  const cityTypeahead = query['city-typeahead'];
  if (is5DigitZip(cityTypeahead)) {
    query.zip = cityTypeahead.trim();
  }
  if (!empty(query.m)) {
    delete ck.M;
  }
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

const allKeys = new Set();
for (const key of [].concat(allGeoKeys,
    Object.keys(booleanOpts),
    Object.keys(dailyLearningOpts),
    Object.keys(hebcalFormDefaults),
    Object.keys(negativeOpts),
    Object.keys(numberOpts),
)) {
  allKeys.add(key);
}

/**
 * @param {Object.<string,string>} query
 */
export function cleanQuery(query) {
  for (const key of allKeys) {
    const value = query[key];
    if (!empty(value)) {
      const cleanStr = value.replace(/[<>&"'`]/g, '');
      if (value !== cleanStr) {
        query[key] = cleanStr;
      }
    }
  }
}

const geonameIdCandleOffset = {
  '281184': 40, // Jerusalem
  '294801': 30, // Haifa
  '293067': 30, // Zikhron Yaakov
};

const DEFAULT_CANDLE_MINS = 18;

/**
 * @param {Location} location
 * @return {number}
 */
export function locationDefaultCandleMins(location) {
  if (location.getIsrael()) {
    const geoid = location.getGeoId();
    const offset = geonameIdCandleOffset[geoid];
    if (typeof offset === 'number') {
      return offset;
    }
  }
  return DEFAULT_CANDLE_MINS;
}

/**
 * @param {any} query
 * @return {number}
 */
export function queryDefaultCandleMins(query) {
  const geonameid = query.geonameid;
  if (geonameid) {
    const offset = geonameIdCandleOffset[geonameid];
    if (typeof offset === 'number') {
      return offset;
    }
  }
  return DEFAULT_CANDLE_MINS;
}

/**
 * @param {Object.<string,string>} query
 * @return {number}
 */
function getMaskFromQuery(query) {
  let mask = 0;
  for (const [key, val] of Object.entries(optsToMask)) {
    const value = query[key];
    if (value === 'on' || value === '1') {
      mask |= val;
    }
  }
  return mask;
}

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {CalOptions}
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
    const qkv = query[key];
    if (qkv === 'on' || qkv === '1') {
      options[val] = true;
    } else if (typeof qkv === 'string' && qkv.length) {
      const val2 = qkv.toLowerCase();
      if (val2 !== 'off' && val2 !== '0') {
        delete query[key];
      }
    }
  }
  const dailyLearning = {};
  let hasDailyLearning = false;
  for (const [key, val] of Object.entries(dailyLearningOpts)) {
    const qkv = query[key];
    if (qkv === 'on' || qkv === '1') {
      dailyLearning[val] = true;
      hasDailyLearning = true;
    } else if (typeof qkv === 'string' && qkv.length) {
      const val2 = qkv.toLowerCase();
      if (val2 !== 'off' && val2 !== '0') {
        delete query[key];
      }
    }
  }
  const yerushalmiEd = query.yye;
  if (typeof yerushalmiEd === 'string' &&
      yerushalmiEd.toLowerCase()[0] === 's') {
    dailyLearning.yerushalmi = 2;
    hasDailyLearning = true;
  }
  if (hasDailyLearning) {
    options.dailyLearning = dailyLearning;
  }
  options.mask = getMaskFromQuery(query);
  if (!empty(query.h12)) {
    options.hour12 = !off(query.h12);
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (off(query[key])) {
      options[val] = true;
    }
  }
  if ((options.mask & flags.ROSH_CHODESH) && (options.mask & flags.SPECIAL_SHABBAT)) {
    options.mask |= flags.SHABBAT_MEVARCHIM;
  }
  // Before we parse numberOpts, check for tzeit preference
  if (options.havdalahTzeit) {
    options.havdalahDeg = 8.5;
    delete options.havdalahTzeit;
    delete query.m;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    const value = query[key];
    if (typeof value === 'string' && value.length) {
      const num = parseInt(value, 10);
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
    if (query.year === 'now' || query.year === 'x') {
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
  const location = getLocationFromQuery(db, query);
  if (location) {
    options.location = location;
    options.candlelighting = true;
    if (query.c === 'off') {
      query.c = 'on';
    }
    if (location.getIsrael()) {
      options.il = true;
      const offset = locationDefaultCandleMins(options.location);
      if (typeof options.candleLightingMins !== 'number' ||
          (offset !== DEFAULT_CANDLE_MINS && options.candleLightingMins === DEFAULT_CANDLE_MINS)) {
        options.candleLightingMins = offset;
        query.b = String(offset);
      }
    }
  } else {
    delete options.candlelighting;
  }
  if (options.candlelighting && typeof options.year === 'number' &&
      ((options.isHebrewYear && options.year < 5661) || options.year < 1900)) {
    options.candlelighting = false;
  }
  return options;
}

/**
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {Location}
 */
export function getLocationFromQuery(db, query) {
  const cityTypeahead = query['city-typeahead'];
  if (is5DigitZip(cityTypeahead)) {
    query.zip = cityTypeahead.trim();
  }
  if (!empty(query.geonameid)) {
    const location = db.lookupGeoname(parseInt(query.geonameid, 10));
    if (location == null) {
      throw createError(404, `Sorry, can't find geonameid: ${query.geonameid}`);
    }
    query.geo = 'geoname';
    return location;
  } else if (!empty(query.zip)) {
    if (!is5DigitZip(query.zip)) {
      throw createError(400, `Sorry, invalid ZIP code: ${query.zip}`);
    }
    const zip = query.zip.trim().substring(0, 5); // truncate ZIP+4 to 5-digit ZIP
    const location = db.lookupZip(zip);
    if (location == null) {
      throw createError(404, `Sorry, can't find ZIP code: ${query.zip}`);
    }
    query.zip = zip;
    query.geo = 'zip';
    return location;
  } else if (!empty(query.city)) {
    const location = db.lookupLegacyCity(query.city.trim());
    if (location == null) {
      throw createError(404, `Invalid legacy city specified: ${query.city}`);
    }
    query.geo = 'geoname';
    query.geonameid = location.getGeoId();
    return location;
  } else if (!empty(query.latitude) && !empty(query.longitude)) {
    const latitude = parseFloat(query.latitude);
    if (isNaN(latitude) || latitude > 90 || latitude < -90) {
      throw createError(400, `Invalid latitude specified: ${query.latitude}`);
    }
    const longitude = parseFloat(query.longitude);
    if (isNaN(longitude) || longitude > 180 || longitude < -180) {
      throw createError(400, `Invalid longitude specified: ${query.longitude}`);
    }
    if (empty(query.tzid)) {
      // attempt to guess timezone based on shape data
      const tzids = geoTzFind(latitude, longitude);
      if (tzids.length) {
        query.tzid = tzids[0];
      }
    }
    if (empty(query.tzid)) {
      throw createError(400, 'Timezone required');
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
    try {
      new Intl.DateTimeFormat('en-US', {timeZone: query.tzid});
    } catch (err) {
      throw createError(400, err, {expose: true});
    }
    const cityName = cityTypeahead || makeGeoCityName(latitude, longitude, query.tzid);
    query.geo = 'pos';
    const elevation0 = parseFloat(query.elev);
    const elevation = (elevation0 && elevation0 > 0) ? elevation0 : 0;
    const loc = new Location(latitude, longitude, il, query.tzid, cityName, undefined, undefined, elevation);
    loc.geo = 'pos';
    return loc;
  } else if (hasLatLongLegacy(query)) {
    for (const [key, max] of Object.entries(geoposLegacy)) {
      const value = query[key];
      if (empty(value) || parseInt(value, 10) > max) {
        throw createError(400, `Sorry, ${key}=${value} out of valid range 0-${max}`);
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
    let tzid = query.tzid;
    if (empty(tzid) && !empty(query.tz) && !empty(query.dst)) {
      tzid = Location.legacyTzToTzid(query.tz, query.dst);
      if (!tzid && query.dst === 'none') {
        const tz = parseInt(query.tz, 10);
        const plus = tz > 0 ? '+' : '';
        tzid = `Etc/GMT${plus}${tz}`;
      }
    }
    if (empty(tzid)) {
      // attempt to guess timezone based on shape data
      const tzids = geoTzFind(latitude, longitude);
      if (tzids.length) {
        tzid = tzids[0];
      }
    }
    if (!tzid) {
      throw createError(400, 'Timezone required');
    }
    try {
      new Intl.DateTimeFormat('en-US', {timeZone: tzid});
    } catch (err) {
      throw createError(400, err, {expose: true});
    }
    let il = query.i === 'on';
    if (tzid === 'Asia/Jerusalem') {
      il = true;
    }
    query.latitude = latitude;
    query.longitude = longitude;
    query.tzid = tzid;
    const cityName = cityTypeahead || makeGeoCityName(latitude, longitude, tzid);
    query.geo = 'pos';
    const loc = new Location(latitude, longitude, il, tzid, cityName);
    loc.geo = 'pos';
    return loc;
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
  'ro': 'ro',
  'ashkenazi_romanian': 'ro',
  'uk': 'uk',
};

export const CACHE_CONTROL_IMMUTABLE = cacheControl(365) + ', immutable';
export const CACHE_CONTROL_7DAYS = cacheControl(7);

/**
 * @param {number} days
 * @return {string}
 */
export function cacheControl(days) {
  const seconds = days * 24 * 60 * 60;
  return `public, max-age=${seconds}, s-maxage=${seconds}`;
}

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
 * @param {CalOptions} options
 * @return {Event[]}
 */
export function makeHebrewCalendar(ctx, options) {
  let events;
  // stash away values to avoid warning
  const yomTovOnly = options.yomTovOnly;
  const noMinorHolidays = options.noMinorHolidays;
  if (yomTovOnly) {
    delete options.yomTovOnly;
  }
  if (noMinorHolidays) {
    delete options.noMinorHolidays;
  }
  try {
    events = HebrewCalendar.calendar(options);
  } catch (err) {
    const status = err.status || 400;
    ctx.throw(status, err);
  }
  if (yomTovOnly) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return (categories[0] === 'holiday' && (ev.getFlags() & flags.CHAG));
    });
  } else if (noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  // restore values
  if (yomTovOnly) {
    options.yomTovOnly = true;
  }
  if (noMinorHolidays) {
    options.noMinorHolidays = true;
  }

  return events;
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
  const gloc = {details: geoip, cc: geoip.country?.iso_code};
  if (typeof geoip.location === 'object') {
    const gloc0 = geoip.location;
    const tzid = gloc0.time_zone;
    if (typeof tzid === 'string') {
      gloc.tzid = tzid;
    }
    const latitude = gloc0.latitude;
    const longitude = gloc0.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      gloc.latitude = latitude;
      gloc.longitude = longitude;
    }
    const radius = gloc0.accuracy_radius;
    if (typeof radius === 'number') {
      gloc.accuracy_radius = radius;
    }
  }
  if (typeof geoip.postal === 'object' &&
        typeof geoip.postal.code === 'string' &&
        geoip.postal.code.length === 5 &&
        gloc.cc === 'US') {
    gloc.geo = 'zip';
    gloc.zip = geoip.postal.code;
    return gloc;
  }
  if (typeof geoip.city === 'object' &&
        typeof geoip.city.geoname_id === 'number') {
    const geonameid = geoip.city.geoname_id;
    const location = ctx.db.lookupGeoname(geonameid);
    if (location === null) {
      // log the id and fall through to next test
      gloc.raw_geonameid = geonameid;
    } else {
      gloc.geo = 'geoname';
      gloc.geonameid = geonameid;
      return gloc;
    }
  }
  if (typeof gloc.tzid === 'string' &&
        typeof gloc.latitude === 'number' &&
        typeof gloc.longitude === 'number') {
    gloc.geo = 'pos';
    if (gloc.accuracy_radius > maxAccuracyRadius) {
      return gloc;
    }
    const city = nearestCity(ctx.db.geonamesDb,
        gloc.latitude,
        gloc.longitude,
        gloc.tzid);
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
  cleanQuery(q);
  const location = getLocationFromQueryOrGeoIp(ctx, q);
  const geoip = ctx.state.geoip;
  let cc = geoip && geoip.cc;
  let tzid = geoip && geoip.tzid || null;
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
  const lg = ctx.state.lg = q.lg = pickLanguage(ctx, q.lg, cc);
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

const langISOs = ['en', 'he'].concat(Object.keys(langNames).filter((x) => x.length === 2));

/**
 * @param {*} ctx
 * @param {string} lg
 * @param {string} cc
 * @return {string}
 */
function pickLanguage(ctx, lg, cc) {
  if (lg) {
    return lg;
  }
  const ccDefaults = langTzDefaults[cc];
  if (ccDefaults) {
    return ccDefaults[0];
  }
  const acceptsLangs = ctx.acceptsLanguages(langISOs);
  if (Array.isArray(acceptsLangs)) {
    return acceptsLangs[0] === 'en' ? 's' : acceptsLangs[0];
  } else if (typeof acceptsLangs === 'string') {
    return acceptsLangs === 'en' ? 's' : acceptsLangs;
  }
  return 's';
}

/**
 * @param {any} ctx
 * @param {any} q
 * @return {any}
 */
function getLocationFromQueryOrGeoIp(ctx, q) {
  const location = getLocationFromQuery(ctx.db, q);
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
      const location2 = getLocationFromQuery(ctx.db, geoip);
      return location2;
    } catch (err) {
      // ignore
    }
  }
  if (typeof gloc.latitude === 'number') {
    const loc = new Location(gloc.latitude, gloc.longitude, gloc.cc === 'IL', gloc.tzid, null, gloc.cc);
    loc.geo = 'pos';
    return loc;
  }
  return null;
}

/**
 * @private
 * @param {Object.<string,string>} options
 * @param {Object.<string,string>} attrs
 * @return {string}
 */
export function eTagFromOptions(options, attrs) {
  const vers = {core: HebrewCalendar.version(), web: pkg.version};
  const etagObj = Object.assign(vers, options, attrs);
  return etag(JSON.stringify(etagObj), {weak: true});
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

const maxNumYear = {
  candlelighting: 4,
  omer: 4,
  addHebrewDatesForEvents: 3,
  addHebrewDates: 2,
  dailyLearning: 2,
};

/**
 * Parse HebcalOptions to determine ideal numYears
 * @param {CalOptions} options
 * @return {number}
 */
export function getNumYears(options) {
  if (options.numYears) {
    return options.numYears;
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
  // reduce duration if 2+ daily options are specified
  const daily = (options.addHebrewDates ? 1 : 0) +
    Object.keys(options.dailyLearning || {}).length;
  if (daily > 1) {
    numYears = 1;
  }
  return numYears;
}

/**
 * @private
 * @param {CalOptions} options
 * @param {Object.<string,string>} query
 * @return {Object.<string,string>}
 */
export function makeIcalOpts(options, query) {
  const icalOpts = Object.assign({}, options);
  const emoji = query.emoji;
  if (emoji === '1' || emoji === 'on') {
    icalOpts.emoji = true;
  } else if (emoji === '0' || emoji === 'off') {
    icalOpts.emoji = false;
  }
  for (const key of ['title', 'caldesc', 'publishedTTL', 'subscribe', 'relcalid']) {
    const value = query[key];
    if (!empty(value)) {
      icalOpts[key] = value;
    }
  }
  const color = query.color;
  if (typeof color === 'string' && color.length) {
    icalOpts.calendarColor = color.toUpperCase();
  }
  if (!icalOpts.title && !icalOpts.yahrzeit && !icalOpts.location && query.subscribe === '1') {
    icalOpts.title = 'Hebcal ' + makeCalendarSubtitleFromOpts(icalOpts, query);
    if (!icalOpts.caldesc && (icalOpts.noHolidays || icalOpts.noMajor)) {
      icalOpts.caldesc = queryDescription(query, queryLongDescr);
    }
  }
  return icalOpts;
}

/**
 * @private
 * @param {Object.<string,string>} q
 * @param {Location} location
 * @return {URLSearchParams}
 */
function makeGeoUrlArgs0(q, location) {
  if (!location) {
    throw createError(500, 'Internal error: Location required!');
  }
  const args = new URLSearchParams();
  if (location.geo === 'pos') {
    args.set('geo', 'pos');
    args.set('latitude', location.getLatitude());
    args.set('longitude', location.getLongitude());
    const elev = location.getElevation();
    if (elev > 0) {
      args.set('elev', elev);
    }
    args.set('tzid', location.getTzid());
    const cityName = q['city-typeahead'];
    if (!empty(cityName)) {
      args.set('city-typeahead', cityName);
    }
  } else if (location.geo === 'zip' || q.zip) {
    args.set('zip', location.getGeoId() || q.zip);
  } else {
    args.set('geonameid', location.getGeoId());
  }
  args.set('ue', off(q.ue) ? 'off' : 'on');
  return args;
}

/**
 * @param {Object.<string,string>} q
 * @param {Location} location
 * @param {CalOptions} options
 * @return {string}
 */
export function makeGeoUrlArgs(q, location, options) {
  const args = makeGeoUrlArgs0(q, location);
  const candleLightingMins = options.candleLightingMins;
  if (typeof candleLightingMins !== 'undefined') {
    args.set('b', candleLightingMins);
  }
  const havdalahMins = options.havdalahMins;
  if (typeof havdalahMins === 'number' && !isNaN(havdalahMins)) {
    args.set('M', 'off');
    args.set('m', havdalahMins);
  } else {
    args.set('M', 'on');
  }
  args.set('lg', q.lg || 's');
  return args.toString();
}

/**
 * @param {Object.<string,string>} q
 * @param {Location} location
 * @return {string}
 */
export function makeGeoUrlArgs2(q, location) {
  const args = makeGeoUrlArgs0(q, location);
  if (q.M === 'on') {
    delete q.m;
  } else if (q.M === 'off' && empty(q.m)) {
    q.M = 'on';
    delete q.m;
  }
  q.lg = q.lg || (q.a === 'on' ? 'a' : 's');
  for (const key of ['b', 'M', 'm', 'lg']) {
    if (!empty(q[key])) {
      args.set(key, q[key]);
    }
  }
  return args.toString();
}

const hebcalPrefix = 'https://www.hebcal.com/';

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

export const queryToName = {
  maj: 'Major Holidays',
  min: 'Minor Holidays',
  nx: 'Rosh Chodesh',
  mod: 'Modern Holidays',
  mf: 'Minor Fasts',
  ss: 'Special Shabbatot',
  o: 'Days of the Omer',
  ykk: 'Yom Kippur Katan',
  s: 'Torah Readings', // Weekly Torah portion on Saturdays
  d: 'Hebrew Dates', // Show Hebrew date every day of the year
  D: 'Hebrew Dates', // Show Hebrew date for dates with some event
  F: 'Daf Yomi',
  myomi: 'Mishna Yomi',
  nyomi: 'Nach Yomi',
  dty: 'Tanakh Yomi',
  dps: 'Daily Tehillim',
  dcc: 'Sefer Chofetz Chaim',
  dshl: 'Shemirat HaLashon',
  dr1: 'Daily Rambam',
  yyomi: 'Yerushalmi Yomi',
  dw: 'Daf-a-Week',
};

export const queryLongDescr = Object.assign({}, queryToName, {
  s: 'Parashat ha-Shavua - Weekly Torah Portion',
  o: '7 weeks from the second night of Pesach to the day before Shavuot',
  d: 'Daily Hebrew Dates',
  ykk: 'Minor day of atonement occurring monthly on the day preceding each Rosh Chodesh',
  F: 'Daily regimen of learning the Babylonian Talmud',
  myomi: 'Two Mishnayot each day',
  nyomi: 'Nevi’im (Prophets) and Ketuvim (Writings)',
  dty: 'Prophets and Writings on weekdays according to the ancient Masoretic division of sedarim',
  dps: 'Daily study of few chapters from the book of Psalms',
  dcc: 'Jewish ethics and laws of speech',
  dshl: '',
  dr1: 'Maimonides’ Mishneh Torah legal code',
  yyomi: 'Jerusalem Talmud (Vilna Edition)',
  dw: 'One page of Babylonian Talmud per week',
});

/**
 * @param {Object.<string,string>} query
 * @param {Object.<string,string>} map
 * @return {string}
 */
function queryDescription(query, map) {
  const strs = [];
  for (const [k, v] of Object.entries(map)) {
    if (!off(query[k])) {
      strs.push(v);
    }
  }
  return strs.join(', ');
}

/**
 * If all default holidays are suppressed try to come up with a better name
 * @param {CalOptions} options
 * @param {Object.<string,string>} query
 * @return {string}
 */
export function makeCalendarSubtitleFromOpts(options, query) {
  const ilOrDiaspora = options.il ? 'Israel' : 'Diaspora';
  if (options.noHolidays || options.noMajor) {
    const name = queryDescription(query, queryToName);
    if (name) {
      return (options.sedrot || !options.noModern) ?
        `${ilOrDiaspora} - ${name}` : name;
    }
  }
  return ilOrDiaspora;
}
