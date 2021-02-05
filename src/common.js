import {HDate, Location, months, HebrewCalendar} from '@hebcal/core';
import querystring from 'querystring';
import dayjs from 'dayjs';
import createError from 'http-errors';

export const langTzDefaults = {
  US: ['s', 'America/New_York'],
  IL: ['h', 'Asia/Jerusalem'],
  GB: ['s', 'Europe/London'],
  CA: ['s', 'America/Toronto'],
  AU: ['s', 'Australia/Sydney'],
  ZA: ['s', 'Africa/Johannesburg'],
  BR: ['s', 'America/Sao_Paulo'],
  ES: ['es', 'Europe/Madrid'],
  MX: ['es', 'America/Mexico_City'],
  FR: ['fr', 'Europe/Paris'],
  RU: ['ru', 'Europe/Moscow'],
  PL: ['pl', 'Europe/Warsaw'],
  FI: ['fi', 'Europe/Helsinki'],
};

const lgToLocale = {
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
const cookieOpts = geoKeys.concat(['geo', 'lg'],
    Object.keys(numberOpts), Object.keys(booleanOpts));

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

const dlPrefix = process.env.NODE_ENV == 'production' ?
  'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {any} q
 * @param {string} filename
 * @param {any} override
 * @return {string}
 */
export function downloadHref(q, filename, override={}) {
  const encoded = Buffer.from(urlArgs(q, override))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  const type = q.v === 'yahrzeit' ? 'y' : 'h';
  return `${dlPrefix}/v2/${type}/${encoded}/${filename}`;
}

/**
 * @param {any} query
 * @param {any} [override]
 * @return {string}
 */
export function urlArgs(query, override={}) {
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
 * @param {any} query
 * @return {string}
 */
export function makeCookie(query) {
  let ck = 't=' + Math.floor(Date.now() / 1000);
  for (const key of cookieOpts) {
    if (typeof query[key] === 'number' ||
       (typeof query[key] === 'string' && query[key].length > 0)) {
      ck += '&' + key + '=' + encodeURIComponent(query[key]);
    }
  }
  return ck;
}

/**
 * @param {any} ctx
 * @param {any} query
 * @return {boolean}
 */
export function possiblySetCookie(ctx, query) {
  if (ctx.request.querystring.length === 0) {
    return false;
  }
  const newCookie = makeCookie(query);
  const ampersand = newCookie.indexOf('&');
  if (ampersand === -1) {
    return false;
  }
  const prevCookie = ctx.cookies.get('C');
  if (prevCookie) {
    if (prevCookie === 'opt_out') {
      return false;
    }
    const prev = prevCookie.substring(prevCookie.indexOf('&'));
    const current = newCookie.substring(ampersand);
    if (prev === current) {
      return false;
    }
  }
  // ctx.set('Cache-Control', 'private');
  ctx.cookies.set('C', newCookie, {
    expires: dayjs().add(1, 'year').toDate(),
    overwrite: true,
    httpOnly: false,
  });
  return true;
}

/**
 * @param {string} cookieString
 * @param {any} defaults
 * @param {any} query0
 * @return {any}
 */
export function processCookieAndQuery(cookieString, defaults, query0) {
  const query = Object.assign({}, query0);
  const ck = querystring.parse(cookieString || '');
  delete ck.t;
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
    throw new SyntaxError(`Date must match format YYYY-MM-DD: ${str}`);
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
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {any} query
 * @return {HebrewCalendar.Options}
 */
export function makeHebcalOptions(db, query) {
  const options = {};
  // map very old "nh=on" to 5 new parameters
  if (query.nh === 'on') {
    Object.keys(negativeOpts).filter((x) => x !== 'nx').forEach((x) => query[x] = 'on');
    delete query.nh;
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
    delete query.m;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof query[key] === 'string' && query[key].length) {
      options[val] = parseInt(query[key], 10);
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
        throw new RangeError(`Sorry, invalid year ${query.year}`);
      } else if (options.isHebrewYear && options.year < 3762) {
        throw new RangeError('Sorry, Hebrew year must be 3762 or later');
      } else if (options.year < 1) {
        throw new RangeError(`Sorry, invalid Gregorian year ${query.year}`);
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
  if (options.candlelighting) {
    const location = getLocationFromQuery(db, query);
    if (location) {
      options.location = location;
      if (location.getIsrael()) {
        options.il = true;
        if (location.getShortName() === 'Jerusalem') {
          options.candleLightingMins = 40;
          query.b = '40';
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
 * @param {any} query
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
    }
    let il = query.i === 'on';
    if (query.tzid === 'Asia/Jerusalem') {
      il = true;
    } else if (query.tzid[0] === ' ') {
    // hack for client who passes +03:00
      const m = query.tzid.match(/^ (\d\d):00$/);
      if (m && m[1]) {
        query.tzid = 'Etc/GMT+' + parseInt(m[1], 10);
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
        throw new RangeError(`Sorry, ${key}=${query[key]} out of valid range 0-${max}`);
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
  } else if (query.geo === 'pos' && !hasLatLong(query)) {
    throw createError(400, 'Missing or empty latitude/longitude parameters');
  }
  return null;
}

/**
 * @param {any} query
 * @return {string}
 */
function hasLatLong(query) {
  for (const k of ['latitude', 'longitude', 'tzid']) {
    if (typeof query[k] === 'string' && query[k].length === 0) {
      throw createError(400, `Invalid empty parameter '${k}'`);
    }
  }
  if (!empty(query.latitude) && !empty(query.longitude)) {
    return true;
  }
  for (const k of ['ladir', 'lodir'].concat(Object.keys(geoposLegacy))) {
    if (empty(query[k])) {
      throw createError(400, `Missing or empty '${k}' parameter`);
    }
  }
  return true;
}

/**
 * @private
 * @param {any} query
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

  return `${ladeg}°${lamin}′${ladir}, ${lodeg}°${lomin}′${lodir}, ${tzid}`;
}

export const localeMap = {
  'es': 'es',
  'fi': 'fi',
  'fr': 'fr',
  'he': 'he',
  'hu': 'hu',
  'h': 'he',
  'pl': 'pl',
  'ru': 'ru',
};

export const tooltipScript = `<script>
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function (el) {
  return new bootstrap.Tooltip(el);
});
</script>
`;

export const typeaheadScript = `<script src="https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/typeahead.js@0.10.4/dist/typeahead.bundle.min.js"></script>
<script src="/i/hebcal-app-2.4.min.js"></script>
<script>window['hebcal'].createCityTypeahead(false);</script>
`;

export const clipboardScript = `
<script src="https://cdn.jsdelivr.net/npm/clipboard@2.0.6/dist/clipboard.min.js"></script>
<script>
var clipboard = new ClipboardJS('#grabBtn', {
  container: document.getElementsByClassName('modal')[0]
});
var grabBtn = document.querySelector('#grabBtn');
var tooltipBtn=new bootstrap.Tooltip(grabBtn);
clipboard.on('success', function(e) {
  e.trigger.setAttribute('data-bs-original-title','Copied!');
  tooltipBtn.show();
  e.clearSelection();
});
clipboard.on('error', function(e) {
  var modifierKey=/mac/i.test(navigator.userAgent)?'\u2318':'Ctrl-';
  var fallbackMsg='Press '+modifierKey+'C to copy';
  e.trigger.setAttribute('data-bs-original-title',fallbackMsg);
  tooltipBtn.show();
});
</script>
`;

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @param {any} [attrs={}]
 * @return {Object}
 */
export function makeLogInfo(ctx, attrs={}) {
  return Object.assign({
    status: ctx.response.status,
    length: ctx.response.length,
    ip: ctx.get('x-client-ip') || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.get('user-agent'),
    ref: ctx.get('referer'),
    cookie: ctx.get('cookie'),
  }, attrs);
}

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

/**
 * Perform a 302 redirect to `rpath`.
 * @param {any} ctx
 * @param {string} rpath
 */
export function httpRedirect(ctx, rpath) {
  const proto = ctx.get('x-forwarded-proto') || 'http';
  const host = ctx.get('host') || 'www.hebcal.com';
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
 */
export function setDefautLangTz(ctx) {
  const q = processCookieAndQuery(ctx.cookies.get('C'), {}, ctx.request.query);
  let location = getLocationFromQuery(ctx.db, q);
  let cc = 'US';
  let tzid = null;
  if (location !== null) {
    tzid = location.getTzid();
    cc = location.getCountryCode();
  } else {
    // try to infer location fro GeoIP
    const ip = getIpAddress(ctx);
    const geoip = ctx.geoipCity.get(ip);
    if (geoip && typeof geoip.location === 'object' &&
                 typeof geoip.location.time_zone === 'string' &&
                 typeof geoip.location.latitude === 'number' &&
                 typeof geoip.location.longitude === 'number' &&
                 typeof geoip.country === 'object' &&
                 typeof geoip.country.iso_code === 'string') {
      cc = geoip.country.iso_code;
      const gloc = geoip.location;
      tzid = gloc.time_zone;
      location = new Location(gloc.latitude, gloc.longitude, cc === 'IL', tzid, null, cc);
    } else {
      cc = ctx.geoipCountry.get(ip) || 'US';
    }
  }
  const ccDefaults = langTzDefaults[cc] || langTzDefaults['US'];
  ctx.state.lang = q.lg || ccDefaults[0];
  ctx.state.countryCode = cc;
  ctx.state.timezone = tzid || ccDefaults[1];
  ctx.state.location = location;
  ctx.state.il = q.i === 'on' || cc === 'IL' || ctx.state.timezone === 'Asia/Jerusalem';
  ctx.state.q = q;
  return q;
}
