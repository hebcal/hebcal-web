import {HDate, Location} from '@hebcal/core';

const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

const negativeOpts = {
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

const cookieOpts = ['geo', 'zip', 'geonameid', 'lg'].concat(
    Object.keys(numberOpts), Object.keys(booleanOpts));

/**
 * @param {string} val
 * @return {boolean}
 */
export function empty(val) {
  return typeof val == 'undefined' || !val.length;
}

/**
   * @param {string} val
   * @return {boolean}
   */
export function off(val) {
  return typeof val == 'undefined' || val == 'off' || val == '0';
}

/**
 * @param {any} query
 * @return {string}
 */
export function makeCookie(query) {
  let ck = 't=' + Math.floor(Date.now() / 1000);
  for (const key of cookieOpts) {
    if (typeof query[key] === 'string' && query[key].length !== 0) {
      ck += '&' + key + '=' + query[key];
    }
  }
  return ck;
}

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {any} query
 * @return {HebcalOptions}
 */
export function makeHebcalOptions(db, query) {
  const options = {};
  for (const [key, val] of Object.entries(booleanOpts)) {
    if (typeof query[key] == 'string' &&
      (query[key] == 'on' || query[key] == '1')) {
      options[val] = true;
    }
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (off(query[key])) {
      options[val] = true;
    }
  }
  if (typeof query.nh == 'undefined' && typeof query.maj == 'undefined') {
    options.noHolidays = true;
  }
  // legacy: before we had maj/min/mod/ss/mf, we only had nh/nx.
  // disable minor holidays only if we are sure it's not an old URL
  if ((query.nh != 'on' || query.nx != 'on') && off(query.min)) {
    options.noMinorHolidays = true;
  }
  // Before we parse numberOpts, check for tzeit preference
  if (options.havdalahTzeit) {
    delete query.m;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof query[key] == 'string' && query[key].length) {
      options[val] = +query[key];
    }
  }
  if (!empty(query.yt)) {
    options.isHebrewYear = Boolean(query.yt == 'H');
  }
  if (!empty(query.year)) {
    if (query.year == 'now') {
      options.year = options.isHebrewYear ? new HDate().getFullYear() : new Date().getFullYear();
    } else {
      options.year = +query.year;
    }
  }
  if (!empty(query.month)) {
    const month = +query.month;
    if (month >= 1 && month <= 12) {
      options.month = month;
    }
  }
  if (options.ashkenazi && empty(query.lg)) {
    query.lg = 'a';
  }
  if (!empty(query.lg)) {
    const lg = query.lg;
    options.locale = lgToLocale[lg] || lg;
    if (lg == 'ah' || lg == 'sh') {
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

/**
 * @param {any} db
 * @param {any} query
 * @param {boolean} il
 * @return {Location}
 */
export function getLocationFromQuery(db, query, il) {
  let location;
  if (!empty(query.zip)) {
    location = db.lookupZip(query.zip);
    if (location == null) {
      throw new Error(`Sorry, can't find ZIP code ${query.zip}`);
    }
    query.geo = 'zip';
  } else if (!empty(query.city)) {
    location = db.lookupLegacyCity(query.city);
    if (location == null) {
      throw new Error(`Invalid legacy city ${query.city}`);
    }
    query.geo = 'geoname';
    query.geonameid = location.getGeoId();
  } else if (!empty(query.geonameid)) {
    location = db.lookupGeoname(+query.geonameid);
    if (location == null) {
      throw new Error(`Sorry, can't find geonameid ${query.geonameid}`);
    }
    query.geo = 'geoname';
  } else if (query.geo == 'pos') {
    if (!empty(query.latitude) && !empty(query.longitude)) {
      if (empty(query.tzid)) {
        throw new Error('Timezone required');
      }
      if (query.tzid == 'Asia/Jerusalem') {
        il = true;
      }
      location = new Location(+query.latitude, +query.longitude, il, query.tzid);
    } else {
      let tzid = query.tzid;
      if (empty(tzid) && !empty(query.tz) && !empty(query.dst)) {
        tzid = Location.legacyTzToTzid(query.tz, query.dst);
        if (!tzid && query.dst == 'none') {
          const tz = +query.tz;
          const plus = tz > 0 ? '+' : '';
          tzid = `Etc/GMT${plus}${tz}`;
        }
      }
      if (!tzid) {
        throw new Error('Timezone required');
      }
      for (const [key, max] of Object.entries(geoposLegacy)) {
        if (empty(query[key]) || +query[key] > max) {
          throw new RangeError(`Sorry, ${key}=${query[key]} out of valid range 0-${max}`);
        }
      }
      let latitude = +query.ladeg + (+query.lamin / 60.0);
      let longitude = +query.lodeg + (+query.lomin / 60.0);
      if (query.ladir == 's') {
        latitude *= -1;
      }
      if (query.lodir == 'w') {
        longitude *= -1;
      }
      if (tzid == 'Asia/Jerusalem') {
        il = true;
      }
      location = new Location(latitude, longitude, il, tzid);
    }
  }
  return location;
}
