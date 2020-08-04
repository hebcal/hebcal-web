import {HDate, Location} from '@hebcal/core';
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
  return `https://download.hebcal.com/v2/${type}/${encoded}/${filename}`;
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
  const prevCookie = ctx.cookies.get('C');
  if (prevCookie) {
    const prev = prevCookie.substring(prevCookie.indexOf('&'));
    const current = newCookie.substring(newCookie.indexOf('&'));
    if (prev === current) {
      return false;
    }
  }
  ctx.set('Cache-Control', 'private');
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
 * @param {any} query
 * @return {any}
 */
export function processCookieAndQuery(cookieString, defaults, query) {
  const ck = querystring.parse(cookieString || '');
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
  return Object.assign(ck, defaults, query);
}

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {any} query
 * @return {HebcalOptions}
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
    const location = getLocationFromQuery(db, query, options.il);
    if (location) {
      options.location = location;
      if (location.getIsrael()) {
        options.il = true;
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
 * @param {boolean} il
 * @return {Location}
 */
export function getLocationFromQuery(db, query, il) {
  if (!empty(query.geonameid)) {
    const location = db.lookupGeoname(parseInt(query.geonameid, 10));
    if (location == null) {
      throw createError(404, `Sorry, can't find geonameid ${query.geonameid}`);
    }
    query.geo = 'geoname';
    return location;
  } else if (!empty(query.zip)) {
    const location = db.lookupZip(query.zip);
    if (location == null) {
      throw createError(404, `Sorry, can't find ZIP code ${query.zip}`);
    }
    query.geo = 'zip';
    return location;
  } else if (!empty(query.city)) {
    const location = db.lookupLegacyCity(query.city);
    if (location == null) {
      throw createError(404, `Invalid legacy city ${query.city}`);
    }
    query.geo = 'geoname';
    query.geonameid = location.getGeoId();
    return location;
  } else if (query.geo === 'pos') {
    if (!empty(query.latitude) && !empty(query.longitude)) {
      if (empty(query.tzid)) {
        throw createError(400, 'Timezone required');
      }
      if (query.tzid === 'Asia/Jerusalem') {
        il = true;
      }
      query.tzid = tzidMap[query.tzid] || query.tzid;
      const latitude = parseFloat(query.latitude);
      const longitude = parseFloat(query.longitude);
      const cityName = query['city-typeahead'] || makeGeoCityName(latitude, longitude, query.tzid);
      return new Location(latitude, longitude, il, query.tzid, cityName);
    } else {
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
      if (tzid === 'Asia/Jerusalem') {
        il = true;
      }
      tzid = tzidMap[tzid] || tzid;
      query.latitude = latitude;
      query.longitude = longitude;
      query.tzid = tzid;
      const cityName = query['city-typeahead'] || makeGeoCityName(latitude, longitude, tzid);
      return new Location(latitude, longitude, il, tzid, cityName);
    }
  }
  return null;
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

export const tooltipScript = `<script>
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function (el) {
  return new bootstrap.Tooltip(el);
});
</script>
`;

export const typeaheadScript = `<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/typeahead.js/0.10.4/typeahead.bundle.min.js"></script>
<script src="https://www.hebcal.com/i/hebcal-app-1.9.min.js"></script>
<script>window['hebcal'].createCityTypeahead(false);</script>
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
    ip: ctx.request.headers['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.headers['user-agent'],
    ref: ctx.request.headers['referer'],
    cookie: ctx.request.headers['cookie'],
  }, attrs);
}
