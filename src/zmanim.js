import {Zmanim, TimedEvent, HDate, flags,
  isAssurBemlacha,
  HebrewCalendar, HebrewDateEvent, Locale} from '@hebcal/core';
import {version} from '@hebcal/core/dist/esm/pkgVersion';
import {empty} from './empty.js';
import {getLocationFromQuery,
  CACHE_CONTROL_7DAYS, CACHE_CONTROL_30DAYS,
  pkg,
  lgToLocale, makeETag} from './common.js';
import {nowInTimezone, getStartAndEnd} from './dateUtil.js';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import {eventsToIcalendar, IcalEvent} from '@hebcal/icalendar';
import {locationToPlainObj, makeAnchor} from '@hebcal/rest-api';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

const VERSION = version + '-' + pkg.version;

const TIMES = {
  chatzotNight: 1,
  alotHaShachar: 1,
  misheyakir: 1,
  misheyakirMachmir: 1,
  dawn: 1,
  sunrise: 1,
  seaLevelSunrise: 1,
  sofZmanShmaMGA19Point8: 1,
  sofZmanShmaMGA16Point1: 1,
  sofZmanShmaMGA: 1,
  sofZmanShma: 1,
  sofZmanTfillaMGA19Point8: 1,
  sofZmanTfillaMGA16Point1: 1,
  sofZmanTfillaMGA: 1,
  sofZmanTfilla: 1,
  chatzot: 1,
  minchaGedola: 1,
  minchaGedolaMGA: 1,
  minchaKetana: 1,
  minchaKetanaMGA: 1,
  plagHaMincha: 1,
  seaLevelSunset: 1,
  sunset: 1,
  beinHaShmashos: 1,
  dusk: 1,
};

const TZEIT_TIMES = {
  tzeit7083deg: 7.083,
  tzeit85deg: 8.5,
  tzeit42min: 42,
  tzeit50min: 50,
  tzeit72min: 72,
};

const ALL_TIMES = Object.keys(TIMES).concat(Object.keys(TZEIT_TIMES));

/**
 * @private
 * @param {any} ctx
 */
export async function getZmanim(ctx) {
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  if (q.cfg !== 'json') {
    throw createError(400, 'Parameter cfg=json is required');
  }
  const loc = ctx.state.location = getLocationFromQuery(ctx.db, q);
  if (loc === null) {
    throw createError(400, 'Location is required');
  }
  const locObj = locationToPlainObj(loc);
  const useElevation = q.ue === 'on' || q.ue === '1';
  if (!useElevation) {
    delete locObj.elevation;
  }
  if (q.im === 'on' || q.im === '1') {
    ctx.body = checkMelacha(ctx, q, loc, locObj, useElevation);
    return;
  }
  const {isRange, startD, endD} = myGetStartAndEnd(ctx, q, loc.getTzid());
  if (isRange || !empty(q.date)) {
    ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
    ctx.response.etag = makeETag(ctx, q, {});
    ctx.status = 200;
    if (ctx.fresh) {
      ctx.status = 304;
      return;
    }
  } else {
    expires(ctx);
  }
  const roundMinute = q.sec !== '1';
  if (isRange) {
    const times = getTimesForRange(ALL_TIMES, startD, endD, loc, true, roundMinute, useElevation);
    const start = startD.format('YYYY-MM-DD');
    const end = endD.format('YYYY-MM-DD');
    ctx.body = {
      date: {start, end},
      version: VERSION,
      location: locObj,
      times,
    };
  } else {
    const times = getTimes(ALL_TIMES, startD, loc, true, roundMinute, useElevation);
    const isoDate = startD.format('YYYY-MM-DD');
    ctx.body = {
      date: isoDate,
      version: VERSION,
      location: locObj,
      times,
    };
  }
}

function checkMelacha(ctx, q, loc, locObj, useElevation) {
  const now = new Date();
  ctx.lastModified = now;
  let dt;
  const tzid = loc.getTzid();
  let dateStr = q.dt;
  if (!empty(dateStr) && /^\d\d\d\d-\d\d-\d\d/.test(dateStr)) {
    dateStr = dateStr.trim();
    dt = new Date(dateStr);
    if (isNaN(dt.getTime())) {
      throw createError(400, `Invalid Date: ${dateStr}`);
    }
    if (!dateStr.endsWith('Z')) {
      const ch = dateStr.charAt(dateStr.length - 6);
      if (ch !== '-' && ch !== '+') {
        const offset = Zmanim.timeZoneOffset(tzid, dt);
        dt = new Date(dateStr + offset);
      }
    }
  } else {
    dt = now;
    ctx.set('Cache-Control', 'public, max-age=60, s-maxage=60');
  }
  const ok = isAssurBemlacha(dt, loc, useElevation);
  return {
    date: now.toISOString(),
    version: VERSION,
    location: locObj,
    status: {
      localTime: Zmanim.formatISOWithTimeZone(tzid, dt),
      isAssurBemlacha: ok,
    },
  };
}

/**
 * @private
 * @param {any} ctx
 * @param {Object.<string,string>} q
 * @param {string} tzid
 * @return {any}
 */
function myGetStartAndEnd(ctx, q, tzid) {
  try {
    const startAndEnd = getStartAndEnd(q, tzid);
    return startAndEnd;
  } catch (err) {
    ctx.throw(400, err);
  }
}

/**
 * @param {string[]} names
 * @param {dayjs.Dayjs} startD
 * @param {dayjs.Dayjs} endD
 * @param {Location} loc
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @param {boolean} useElevation
 * @return {any}
 */
function getTimesForRange(names, startD, endD, loc, formatAsString, roundMinute, useElevation) {
  const times = {};
  for (const func of names) {
    times[func] = {};
  }
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const t = getTimes(names, d, loc, formatAsString, roundMinute, useElevation);
    const isoDate = d.format('YYYY-MM-DD');
    for (const [key, val] of Object.entries(t)) {
      times[key][isoDate] = val;
    }
  }
  return times;
}

/**
 * @private
 * @param {string[]} names
 * @param {dayjs.Dayjs} d
 * @param {Location} location
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @param {boolean} useElevation
 * @return {Object<string,string>}
 */
function getTimes(names, d, location, formatAsString, roundMinute, useElevation) {
  const times = {};
  const zman = new Zmanim(location, d.toDate(), useElevation);
  for (const name of names) {
    if (TIMES[name]) {
      if (typeof zman[name] !== 'function') {
        throw createError(500, `Internal error: Zmanim.${name} is not a function`);
      }
      if (name.startsWith('seaLevel')) {
        if (useElevation) {
          times[name] = zman[name]();
        }
      } else {
        times[name] = zman[name]();
      }
    } else if (typeof TZEIT_TIMES[name] === 'number') {
      const num = TZEIT_TIMES[name];
      times[name] = name.endsWith('deg') ? zman.tzeit(num) : zman.sunsetOffset(num, roundMinute);
    }
  }
  if (roundMinute) {
    for (const [name, dt] of Object.entries(times)) {
      times[name] = Zmanim.roundTime(dt);
    }
  }
  if (formatAsString) {
    const tzid = location.getTzid();
    for (const [name, dt] of Object.entries(times)) {
      times[name] = isNaN(dt.getTime()) ? null : Zmanim.formatISOWithTimeZone(tzid, dt);
    }
  }
  return times;
}

/**
 * @param {any} ctx
 */
function expires(ctx) {
  const tzid = ctx.state.location.getTzid();
  const today = dayjs.tz(new Date(), tzid);
  const dt = today.toDate();
  ctx.lastModified = dt;
  const tomorrow = today.add(1, 'd');
  const exp = dayjs.tz(tomorrow.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

const ZMAN_NAMES = {
  chatzotNight: [
    'Chatzot HaLailah',
    'Sunset plus 6 halachic hours',
  ],
  alotHaShachar: [
    'Alot haShachar',
    'Sun is 16.1° below the horizon in the morning',
  ],
  misheyakir: [
    'Misheyakir',
    'Earliest talis & tefillin. Sun is 11.5° below the horizon in the morning',
  ],
  misheyakirMachmir: [
    'Misheyakir Machmir',
    'Earliest talis & tefillin. Sun is 10.2° below the horizon in the morning',
  ],
  dawn: [
    'Dawn',
    'Civil dawn. Sun is 6° below the horizon in the morning',
  ],
  sunrise: [
    'Sunrise',
    'Upper edge of the Sun appears over the eastern horizon in the morning (0.833° above horizon)',
  ],
  seaLevelSunrise: [
    'Sunrise (Sea Level)',
    'Upper edge of the Sun appears over the eastern horizon in the morning (0.833° above horizon)',
  ],
  sofZmanShma: [
    'Kriat Shema, sof zeman (Gra)',
    'Latest Shema (Gra). Sunrise plus 3 halachic hours, according to the Gra',
  ],
  sofZmanTfilla: [
    'Tefilah, sof zeman (Gra)',
    'Latest Shacharit (Gra). Sunrise plus 4 halachic hours, according to the Gra',
  ],
  sofZmanShmaMGA: [
    'Kriat Shema, sof zeman (MGA) 72 min',
    'Latest Shema (MGA). Sunrise plus 3 halachic hours, according to Magen Avraham. ' +
    'Based on the opinion of the MGA that the day is calculated from dawn being fixed ' +
    '72 minutes before sea-level sunrise, and nightfall is fixed 72 minutes after sea-level sunset',
  ],
  sofZmanShmaMGA16Point1: [
    'Kriat Shema, sof zeman (MGA) 16.1°',
    'Latest Shema (MGA). Sunrise plus 3 halachic hours, according to Magen Avraham. ' +
    'Based on the opinion of the MGA that the day is calculated from ' +
    'dawn to nightfall with both being 16.1° below the horizon',
  ],
  sofZmanShmaMGA19Point8: [
    'Kriat Shema, sof zeman (MGA) 19.8°',
    'Latest Shema (MGA). Sunrise plus 3 halachic hours, according to Magen Avraham. ' +
    'Based on the opinion of the MGA that the day is calculated from ' +
    'dawn to nightfall with both being 19.8° below the horizon',
  ],
  sofZmanTfillaMGA: [
    'Tefilah, sof zeman (MGA) 72 min',
    'Latest Shacharit (MGA). Sunrise plus 4 halachic hours, according to Magen Avraham. ' +
    'Based on the opinion of the MGA that the day is calculated from dawn being fixed ' +
    '72 minutes before sea-level sunrise, and nightfall is fixed 72 minutes after sea-level sunset',
  ],
  sofZmanTfillaMGA16Point1: [
    'Tefilah, sof zeman (MGA) 16.1°',
    'Latest Shacharit (MGA). Sunrise plus 4 halachic hours, according to Magen Avraham. ',
    'Based on the opinion of the MGA that the day is calculated from ' +
    'dawn to nightfall with both being 16.1° below the horizon',
  ],
  sofZmanTfillaMGA19Point8: [
    'Tefilah, sof zeman (MGA) 19.8°',
    'Latest Shacharit (MGA). Sunrise plus 4 halachic hours, according to Magen Avraham. ',
    'Based on the opinion of the MGA that the day is calculated from ' +
    'dawn to nightfall with both being 19.8° below the horizon',
  ],
  chatzot: [
    'Chatzot hayom',
    'Midday. Sunrise plus 6 halachic hours',
  ],
  minchaGedola: [
    'Mincha Gedolah (Gra)',
    'Earliest Mincha. Sunrise plus 6.5 halachic hours',
  ],
  minchaGedolaMGA: [
    'Mincha Gedolah (MGA)',
    'Earliest Mincha. Sunrise plus 6.5 halachic hours, according to Magen Avraham',
  ],
  minchaKetana: [
    'Mincha Ketanah (Gra)',
    'Preferable earliest time to recite Minchah. Sunrise plus 9.5 halachic hours',
  ],
  minchaKetanaMGA: [
    'Mincha Ketanah (MGA)',
    'Preferable earliest time to recite Minchah. Sunrise plus 9.5 halachic hours, according to Magen Avraham',
  ],
  plagHaMincha: [
    'Plag HaMincha',
    'Sunrise plus 10.75 halachic hours',
  ],
  seaLevelSunset: [
    'Sunset (Sea Level)',
    'Upper edge of the Sun disappears below the western horizon in the evening (0.833° below horizon)',
  ],
  sunset: [
    'Sunset',
    'Upper edge of the Sun disappears below the western horizon in the evening (0.833° below horizon)',
  ],
  dusk: [
    'Dusk',
    'Civil dusk. Sun is 6° below the horizon in the evening',
  ],
  beinHaShmashos: [
    'Bein Hashemashot',
    'Twilight. 13.5 minutes prior to tzeit (nightfall) when the sun is 7.083° below horizon',
  ],
  tzeit7083deg: [
    'Tzeit 7.083°',
    'Nightfall. When 3 medium stars are observable in the night sky with the naked eye (sun 7.083° below the horizon)',
  ],
  tzeit85deg: [
    'Tzeit 8.5°',
    'Nightfall. When 3 small stars are observable in the night sky with the naked eye (sun 8.5° below the horizon)',
  ],
  tzeit42min: [
    'Tzeit 42 min',
    'Nightfall. When 3 medium stars are observable in the night sky with the naked eye (fixed 42 minutes after sunset)',
  ],
  tzeit50min: [
    'Tzeit 50 min',
    'Nightfall. When 3 small stars are observable in the night sky with the naked eye (fixed 42 minutes after sunset)',
  ],
  tzeit72min: [
    'Tzeit 72 min (Rabbeinu Tam)',
    'Nightfall. When 3 small stars are observable in the night sky with the naked eye (fixed 72 minutes after sunset)',
  ],
};

/**
 * @private
 * @param {any} ctx
 */
export async function zmanimIcalendar(ctx) {
  const query = ctx.request.query;
  const location = getLocationFromQuery(ctx.db, query);
  if (location === null) {
    throw createError(400, 'Location is required');
  }
  const today = nowInTimezone(location.getTzid());
  const riseSetOnly = ctx.request.path.startsWith('/sunrs');
  const zmanimAllDay = ctx.request.path.startsWith('/zmanim2');
  const startD = today.subtract(1, 'day');
  const duration = zmanimAllDay ? 90 : riseSetOnly ? 365 : 60;
  const endD = today.add(duration, 'day');
  const names = riseSetOnly ? ['sunrise', 'sunset'] : ALL_TIMES;
  const times = getTimesForRange(names, startD, endD, location, false, true);
  const lg = query.lg;
  const locale = lgToLocale[lg] || lg || 's';
  const events = zmanimAllDay ? makeAllDayEvents(times, location, locale) : makeEvents(times, location);
  const titlePrefix = riseSetOnly ? 'Sunrise and Sunset' : 'Hebcal Zmanim';
  const caldesc = riseSetOnly ?
    'Times for ' + location.getName() :
    'Halachic times for ' + location.getName();
  const options = {
    location,
    title: `${titlePrefix} ${location.getShortName()}`,
    publishedTTL: 'P7D',
    caldesc,
    locale,
  };
  const attrs = {
    dt: today.format('YYYY-MM-DD'),
    icalv: IcalEvent.version(),
  };
  ctx.response.etag = makeETag(ctx, options, attrs);
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.response.type = 'text/calendar; charset=utf-8';
  ctx.body = await eventsToIcalendar(events, options);
}

/**
 * @private
 * @param {any} times
 * @param {Location} location
 * @param {string} locale
 * @return {Event[]}
 */
function makeAllDayEvents(times, location, locale) {
  const byDate = {};
  for (const [zman, map] of Object.entries(times)) {
    for (const [isoDate, dt] of Object.entries(map)) {
      byDate[isoDate] = byDate[isoDate] || [];
      if (!isNaN(dt.getTime())) {
        byDate[isoDate].push([dt, zman]);
      }
    }
  }
  const events = [];
  const timeFormat = location.getTimeFormatter();
  const locationName = location.getShortName();
  const locationNameLong = location.getName();
  const geoid = location.getGeoId() || makeAnchor(locationNameLong);
  const options = {location, locale};
  for (const [isoDate, arr] of Object.entries(byDate)) {
    const date = new Date(isoDate);
    const hd = new HDate(date);
    const ev = new HebrewDateEvent(hd, locale);
    const lines = [];
    arr.sort((a, b) => a[0].getTime() - b[0].getTime());
    for (const [dt, zman] of arr) {
      const desc = ZMAN_NAMES[zman][0];
      const time = Zmanim.formatTime(dt, timeFormat);
      const str = HebrewCalendar.reformatTimeStr(time, 'pm', options);
      const hourMin = str.split(':');
      const prefix = hourMin[0].length === 2 ? '' : ' ';
      lines.push(prefix + str + ' ' + Locale.gettext(desc, locale));
    }
    ev.memo = lines.join('\n') + '\n\n' + locationNameLong;
    ev.alarm = false;
    ev.location = location;
    ev.locationName = locationName;
    const startDate = IcalEvent.formatYYYYMMDD(date);
    ev.uid = `hebcal-zmanim2-${startDate}-${geoid}`;
    events.push(ev);
  }
  return events;
}

/**
 * @private
 * @param {any} times
 * @param {Location} location
 * @return {TimedEvent[]}
 */
function makeEvents(times, location) {
  const events = [];
  for (const [zman, map] of Object.entries(times)) {
    for (const [isoDate, dt] of Object.entries(map)) {
      if (!isNaN(dt.getTime())) {
        const ev = makeTimedEvent(isoDate, zman, dt, location);
        events.push(ev);
      }
    }
  }
  events.sort((a, b) => a.eventTime - b.eventTime);
  return events;
}

/**
 * @private
 * @param {string} isoDate
 * @param {string} zman
 * @param {Date} dt
 * @param {Location} location
 * @return {TimedEvent}
 */
function makeTimedEvent(isoDate, zman, dt, location) {
  const hd = new HDate(new Date(isoDate));
  const desc0 = ZMAN_NAMES[zman];
  const desc = Array.isArray(desc0) && desc0.length === 2 ? desc0 : [zman, ''];
  const ev = new TimedEvent(hd, desc[0], flags.USER_EVENT, dt, location);
  ev.category = zman;
  ev.memo = desc[1];
  ev.alarm = false;
  return ev;
}
