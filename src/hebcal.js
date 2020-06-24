import {hebcal, Location} from '@hebcal/core';
import {eventsToIcalendar, eventsToCsv, getEventCategories} from '@hebcal/icalendar';
import {GeoDb} from './geo';
import pino from 'pino';

const logger = pino();

const negativeOpts = {
  'nx': 'noRoshChodesh',
  'mod': 'noModern',
  'mf': 'noMinorFast',
  'ss': 'noSpecialShabbat',
};

const booleanOpts = {
  'd': 'addHebrewDates',
  'D': 'addHebrewDatesForEvents',
  'o': 'omer',
  'a': 'ashkenazi',
  'c': 'candlelighting',
  'i': 'il',
  's': 'sedrot',
  'F': 'dafyomi',
  'euro': 'euro',
};

const numberOpts = {
  'm': 'havdalahMins',
  'b': 'candleLightingMins',
  'ny': 'numYears',
};

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
const db = new GeoDb(zipsFilename, geonamesFilename);

/**
 * @param {string} val
 * @return {boolean}
 */
function empty(val) {
  return typeof val == 'undefined' || !val.length;
}

const geoposLegacy = {
  ladeg: 90,
  lamin: 60,
  lodeg: 180,
  lomin: 60,
};

const lgToLocale = {
  h: 'he',
  a: 'ashkenazi',
  ah: 'ashkenazi',
  s: 's',
  sh: 's',
};

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== '1') {
    return;
  }
  const options = {};
  for (const [key, val] of Object.entries(booleanOpts)) {
    if (typeof query[key] == 'string' &&
      (query[key] == 'on' || query[key] == '1')) {
      options[val] = true;
    }
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (typeof query[key] == 'undefined' ||
        query[key] == 'off' || query[key] == '0') {
      options[val] = true;
    }
  }
  if (typeof query.nh == 'undefined' && typeof query.maj == 'undefined') {
    options.noHolidays = true;
  }
  // legacy: before we had maj/min/mod/ss/mf, we only had nh/nx.
  // disable minor holidays only if we are sure it's not an old URL
  if (query.nh != 'on' || query.nx != 'on') {
    options.noMinorHolidays = (typeof query.min == 'undefined');
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    if (typeof query[key] == 'string' && query[key].length) {
      options[val] = +query[key];
    }
  }
  if (!empty(query.year) && query.year != 'now') {
    options.year = +query.year;
  }
  if (!empty(query.yt)) {
    options.isHebrewDate = Boolean(query.yt == 'H');
  }
  if (!empty(query.month)) {
    const month = +query.month;
    if (month >= 1 && month <= 12) {
      options.month = month;
    }
  }
  if (!empty(query.lg)) {
    options.locale = lgToLocale[query.lg] || query.lg;
  }
  let location;
  if (!empty(query.zip)) {
    location = db.lookupZip(query.zip);
  } else if (!empty(query.city)) {
    location = db.lookupLegacyCity(query.city);
  } else if (!empty(query.geonameid)) {
    location = db.lookupGeoname(+query.geonameid);
  } else if (query.geo == 'pos') {
    if (!empty(query.latitude) && !empty(query.longitude)) {
      if (empty(query.tzid)) {
        throw new Error('Timezone required');
      }
      if (query.tzid == 'Asia/Jerusalem') {
        options.il = true;
      }
      location = new Location(+query.latitude, +query.longitude, options.il, query.tzid);
    } else {
      let tzid = query.tzid;
      if (empty(tzid) && !empty(query.tz) && !empty(query.dst)) {
        tzid = Location.legacyTzToTzid(query.tz, query.dst);
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
        options.il = true;
      }
      location = new Location(latitude, longitude, options.il, tzid);
    }
  }
  if (location) {
    options.location = location;
  }
  logger.info(options);
  let events = hebcal.hebrewCalendar(options);
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      if (categories.length > 1 && categories[1] == 'minor') {
        return false;
      }
      return true;
    });
  }
  if (ctx.request.path.endsWith('.ics')) {
    const ical = eventsToIcalendar(events, options);
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = ical;
  } else if (ctx.request.path.endsWith('.csv')) {
    const ical = eventsToCsv(events, options);
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}
