import {HDate, Location, HebrewCalendar, flags} from '@hebcal/core';
import '@hebcal/learning';
import createError from 'http-errors';
import {nearestCity} from './nearestCity.js';
import {getEventCategories} from '@hebcal/rest-api';
import {GregorianDateEvent} from './GregorianDateEvent.js';
import {murmur128Sync} from 'murmurhash3';
import {find as geoTzFind} from 'geo-tz';
import {basename} from 'path';
import {readJSON} from './readJSON.js';
import {empty, off} from './empty.js';
import {isoDateStringToDate} from './dateUtil.js';
import {getIpAddress} from './getIpAddress.js';
import {
  DEFAULT_CANDLE_MINS,
  langTzDefaults,
  langNames,
  lgToLocale,
  localeMap,
  negativeOpts,
  booleanOpts,
  numberOpts,
  geoposLegacy,
  getGeoKeysToRemove,
  locationDefaultCandleMins,
  dailyLearningOpts,
  is5DigitZip,
  processCookieAndQuery,
} from './opts.js';
import {cleanQuery} from './cleanQuery.js';

export const pkg = readJSON('../package.json');
export const DOCUMENT_ROOT = process.env.NODE_ENV === 'production' ? '/var/www/html' : './static';

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
  yzkr: flags.YIZKOR,
  mvch: flags.SHABBAT_MEVARCHIM,
};

/**
 * @param {Object.<string,string>} query
 * @param {Object.<string,string>} [override]
 * @return {Object.<string,string>}
 */
export function urlArgsObj(query, override={}) {
  const q = {...query, ...override};
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
 * @return {import('@hebcal/core').CalOptions}
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
  if ((options.mask & flags.ROSH_CHODESH) &&
      (options.mask & flags.SPECIAL_SHABBAT) &&
      (options.mask & flags.PARSHA_HASHAVUA)) {
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
  if (!empty(query.start)) {
    options.start = isoDateStringToDate(query.start);
  }
  if (!empty(query.end)) {
    options.end = isoDateStringToDate(query.end);
  }
  if ((options.start && !options.end) || (options.end && !options.start)) {
    throw createError(400, `If one of 'start' or 'end' is specified, both are required`);
  }
  if (options.start && options.end) {
    delete query.year;
    delete query.month;
    delete query.yt;
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
      } else if (!options.isHebrewYear && options.year < -3759) {
        throw createError(400, 'Sorry, Gregorian year must be -3759 or later');
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
    // map very old a=on to lg=a
    query.lg = 'a';
    delete query.a;
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
  const mm = query.mm || '0';
  options.hebrewMonths = (mm === '1' || mm === '2');
  options.gematriyaNumerals = (mm === '2');
  return options;
}

/**
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {Location}
 */
export function getLocationFromQuery(db, query) {
  let cityTypeahead = query['city-typeahead'];
  if (typeof cityTypeahead === 'string') {
    cityTypeahead = cityTypeahead.trim();
  }
  if (is5DigitZip(cityTypeahead)) {
    query.zip = cityTypeahead;
  } else if (!empty(cityTypeahead) && empty(query.zip) && / \d\d\d\d\d$/.test(cityTypeahead)) {
    query.zip = cityTypeahead.substring(cityTypeahead.length - 5);
  }
  if (!empty(query.geonameid)) {
    const geonameid = parseInt(query.geonameid, 10);
    const location = db.lookupGeoname(geonameid);
    if (location == null) {
      throw createError(404, `Sorry, can't find geonameid: ${query.geonameid}`);
    }
    query.geonameid = geonameid;
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
    const tzid = query.tzid;
    const tz0 = tzid[0];
    if (tzid === 'Asia/Jerusalem') {
      il = true;
    } else if (tz0 === ' ' || tz0 === '-' || tz0 === '+') {
      // hack for client who passes +03:00 or -02:00 ("+" url-decodes to " ")
      const m = /^([ +-])(\d\d):00$/.exec(tzid);
      if (m?.[2]) {
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

export const CACHE_CONTROL_1_YEAR = cacheControl(365);
export const CACHE_CONTROL_IMMUTABLE = CACHE_CONTROL_1_YEAR + ', immutable';
export const CACHE_CONTROL_30DAYS = cacheControl(30);
export const CACHE_CONTROL_7DAYS = cacheControl(7);

/**
 * @param {number} days
 * @return {string}
 */
export function cacheControl(days) {
  const seconds = Math.trunc(days * 24 * 60 * 60);
  return `public, max-age=${seconds}, s-maxage=${seconds}`;
}

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
      const sep = rpath.indexOf('?') === -1 ? '?' : '&';
      url += `${sep}utm_source=${utmSource}`;
      ctx.append('Vary', 'Referer');
    }
  }
  ctx.redirect(url);
}

/**
 * @param {any} ctx
 * @param {import('@hebcal/core').CalOptions} options
 * @return {Event[]}
 */
export function makeHebrewCalendar(ctx, options) {
  let events;
  // stash away values to avoid warning
  const yomTovOnly = options.yomTovOnly;
  const noMinorHolidays = options.noMinorHolidays;
  const addAlternateDates = options.addAlternateDates;
  const addAlternateDatesForEvents = options.addAlternateDatesForEvents;
  const hebrewMonths = options.hebrewMonths;
  const gematriyaNumerals = options.gematriyaNumerals;
  if (yomTovOnly) {
    delete options.yomTovOnly;
  }
  if (noMinorHolidays) {
    delete options.noMinorHolidays;
  }
  if (!hebrewMonths) {
    // No need for Hebrew dates when the whole calendar is fully Hebrew
    options.addHebrewDatesForEvents = addAlternateDatesForEvents;
    options.addHebrewDates = addAlternateDates;
  }
  // Always remove alternate properties - library doesn't recognize them
  delete options.addAlternateDates;
  delete options.addAlternateDatesForEvents;
  delete options.hebrewMonths;
  delete options.gematriyaNumerals;
  try {
    events = HebrewCalendar.calendar(options);

    // When using Hebrew months with Hebrew year mode, splitByHebrewMonth()
    // intentionally includes Tishrei of the next year for printed calendars
    // (useful as a backup when distributed yearly by mail).
    // Generate events for that extra month so it's not empty.
    if (hebrewMonths && options.isHebrewYear && options.year && !options.start && !options.end) {
      const nextYear = options.year + 1;
      const tishrei = 7; // Tishrei is month 7
      // Use explicit start/end dates to get ONLY Tishrei, not the whole year
      const tishreiStart = new HDate(1, tishrei, nextYear);
      const tishreiEnd = new HDate(30, tishrei, nextYear); // Tishrei always has 30 days
      const optsNextTishrei = {
        ...options,
        start: tishreiStart.greg(),
        end: tishreiEnd.greg(),
        isHebrewYear: false, // Using Gregorian date range
      };
      events = events.concat(HebrewCalendar.calendar(optsNextTishrei));
    }
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
  if (hebrewMonths) {
    options.hebrewMonths = true;
  }
  if (gematriyaNumerals) {
    options.gematriyaNumerals = true;
  }
  if (addAlternateDates) {
    options.addAlternateDates = addAlternateDates;
  }
  if (addAlternateDatesForEvents) {
    options.addAlternateDatesForEvents = addAlternateDatesForEvents;
  }

  // When Hebrew months are selected and user wants alternate dates,
  // add Gregorian date events (reverse of normal behavior)
  if (hebrewMonths && (options.addAlternateDates || options.addAlternateDatesForEvents)) {
    // Build a map of dates that have events
    // Key is absolute day number, value is {hd, events[]}
    const dateMap = new Map();
    for (const ev of events) {
      const hd = ev.getDate();
      const dateKey = hd.abs();
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {hd, events: []});
      }
      dateMap.get(dateKey).events.push(ev);
    }

    // If addAlternateDates, we need to add Gregorian dates for ALL days in range
    if (options.addAlternateDates && events.length > 0) {
      // Find the date range from the events
      const firstDate = events[0].getDate();
      const lastDate = events.at(-1).getDate();

      // Iterate over all days in the range
      let currentHd = firstDate;
      while (currentHd.abs() <= lastDate.abs()) {
        const dateKey = currentHd.abs();
        if (!dateMap.has(dateKey)) {
          // No events on this day, but we need to add a Gregorian date
          dateMap.set(dateKey, {hd: currentHd, events: []});
        }
        currentHd = currentHd.next();
      }
    }

    // Now build the final events array with Gregorian dates inserted
    const newEvents = [];
    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a - b);

    for (const dateKey of sortedDates) {
      const {hd, events: eventsOnDay} = dateMap.get(dateKey);

      // Add Gregorian date event if:
      // - addAlternateDates is true (all days), OR
      // - addAlternateDatesForEvents is true AND there are events on this day
      if (options.addAlternateDates || (options.addAlternateDatesForEvents && eventsOnDay.length > 0)) {
        newEvents.push(new GregorianDateEvent(hd));
      }

      // Add all events for this day
      newEvents.push(...eventsOnDay);
    }

    events = newEvents;
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
    // eslint-disable-next-line no-unused-vars
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
 * @param {any} ctx
 * @param {Object.<string,string>} options
 * @param {Object.<string,string>} attrs
 * @return {string}
 */
export function makeETag(ctx, options, attrs) {
  const vers = {core: HebrewCalendar.version(), web: pkg.version};
  const etagObj = {...vers, ...options, ...attrs, path: ctx.request.path};
  const utm = Object.keys(etagObj).filter((k) => k.startsWith('utm_'));
  for (const key of utm) {
    delete etagObj[key];
  }
  const enc = ctx.get('accept-encoding');
  if (enc) {
    if (enc.indexOf('br') !== -1) {
      etagObj.br = 1;
    } else if (enc.indexOf('gzip') !== -1) {
      etagObj.gzip = 1;
    }
  }
  const str = JSON.stringify(etagObj);
  const base64String = murmur128SyncBase64(str);
  return `W/"${base64String}"`;
}

function murmur128SyncBase64(str) {
  const arr4 = murmur128Sync(str);
  const int32Array = new Uint32Array(arr4);
  const buffer = Buffer.from(int32Array.buffer);
  const base64String = buffer.toString('base64url');
  return base64String;
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

const maxNumYear = {
  candlelighting: 4,
  sedrot: 5,
  omer: 5,
  addAlternateDatesForEvents: 4,
  addAlternateDates: 2,
  dailyLearning: 2,
};

/**
 * Parse HebcalOptions to determine ideal numYears
 * @param {import('@hebcal/core').CalOptions} options
 * @return {number}
 */
export function getNumYears(options) {
  if (options.numYears) {
    return options.numYears;
  }
  let numYears = 7;
  // omer + sedrot adds 101 events
  if (options.omer && options.sedrot) {
    numYears = 4;
  }
  // Shabbat plus alternate dates every day can get very big
  const addAlternateDates = options.addAlternateDates;
  if (options.candlelighting) {
    if (addAlternateDates) {
      numYears = 2;
    } else if (options.addAlternateDatesForEvents) {
      numYears = 3;
    }
  }
  // possibly reduce further
  for (const [key, ny] of Object.entries(maxNumYear)) {
    if (options[key] && ny < numYears) {
      numYears = ny;
    }
  }
  // reduce duration if 2+ daily options are specified
  const daily = (addAlternateDates ? 1 : 0) +
    Object.keys(options.dailyLearning || {}).length;
  if (daily > 1) {
    numYears = 1;
  }
  return numYears;
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
 * @param {import('@hebcal/core').CalOptions} options
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

/**
 * @param {number} year
 * @return {boolean}
 */
export function yearIsOutsideGregRange(year) {
  return isNaN(year) || year < 100 || year > 2999;
}

/**
 * @param {number} year
 * @return {boolean}
 */
export function yearIsOutsideHebRange(year) {
  return isNaN(year) || year < 3860 || year > 6759;
}

export function throw410(ctx) {
  ctx.throw(410,
      `The requested resource ${ctx.request.path} is no longer available on this server ` +
      `and there is no forwarding address. Please remove all references to this resource.`);
}
