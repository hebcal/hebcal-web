import {Location} from '@hebcal/core';
import {find as geoTzFind} from 'geo-tz';
import createError from 'http-errors';
import {empty} from './empty.js';
import {is5DigitZip, geoposLegacy} from './opts.js';
import {getIpAddress} from './getIpAddress.js';
import {nearestCity} from './nearestCity.js';

/**
 * MaxMind geoIP lookup GeoLite2-Country.mmdb
 * @return {any}
 * @param {any} ctx
 * @param {number} maxAccuracyRadius
 */
export function getLocationFromGeoIp(ctx, maxAccuracyRadius = 500) {
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
 * @param {any} ctx
 * @param {any} q
 * @return {any}
 */
export function getLocationFromQueryOrGeoIp(ctx, q) {
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
