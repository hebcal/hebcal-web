import {Zmanim, TimedEvent, HDate, flags} from '@hebcal/core';
import {empty, getLocationFromQuery, getStartAndEnd, nowInTimezone} from './common';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {locationToPlainObj} from '@hebcal/rest-api';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

const TIMES = {
  chatzotNight: 1,
  alotHaShachar: 1,
  misheyakir: 1,
  misheyakirMachmir: 1,
  dawn: 1,
  sunrise: 1,
  sofZmanShma: 1,
  sofZmanShmaMGA: 1,
  sofZmanTfilla: 1,
  sofZmanTfillaMGA: 1,
  chatzot: 1,
  minchaGedola: 1,
  minchaKetana: 1,
  plagHaMincha: 1,
  sunset: 1,
  dusk: 1,
};

const TZEIT_TIMES = {
  tzeit7083deg: 7.083,
  tzeit85deg: 8.5,
  tzeit42min: 42,
  tzeit50min: 50,
  tzeit72min: 72,
};

/**
 * @private
 * @param {any} ctx
 */
export async function getZmanim(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  if (q.cfg !== 'json') {
    throw createError(400, 'Parameter cfg=json is required');
  }
  const loc = ctx.state.location = getLocationFromQuery(ctx.db, q);
  if (loc === null) {
    throw createError(400, 'Location is required');
  }
  const {isRange, startD, endD} = myGetStartAndEnd(ctx, q, loc.getTzid());
  if (isRange || !empty(q.date)) {
    ctx.set('Cache-Control', 'max-age=2592000');
    ctx.lastModified = new Date();
  } else {
    expires(ctx);
  }
  const locObj = locationToPlainObj(loc);
  const roundMinute = q.sec === '1' ? false : true;
  if (isRange) {
    const times = getTimesForRange(startD, endD, loc, true, roundMinute);
    const start = startD.format('YYYY-MM-DD');
    const end = endD.format('YYYY-MM-DD');
    ctx.body = {date: {start, end}, location: locObj, times};
  } else {
    const times = getTimes(startD, loc, true, roundMinute);
    const isoDate = startD.format('YYYY-MM-DD');
    ctx.body = {date: isoDate, location: locObj, times};
  }
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
 * @param {dayjs.Dayjs} startD
 * @param {dayjs.Dayjs} endD
 * @param {Location} loc
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @return {any}
 */
function getTimesForRange(startD, endD, loc, formatAsString, roundMinute) {
  const times = {};
  for (const func of Object.keys(TIMES).concat(Object.keys(TZEIT_TIMES))) {
    times[func] = {};
  }
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const t = getTimes(d, loc, formatAsString, roundMinute);
    const isoDate = d.format('YYYY-MM-DD');
    for (const [key, val] of Object.entries(t)) {
      times[key][isoDate] = val;
    }
  }
  return times;
}

/**
 * @private
 * @param {dayjs.Dayjs} d
 * @param {Location} location
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @return {Object<string,string>}
 */
function getTimes(d, location, formatAsString, roundMinute) {
  const times = {};
  const zman = new Zmanim(d.toDate(), location.getLatitude(), location.getLongitude());
  for (const func of Object.keys(TIMES)) {
    times[func] = zman[func]();
  }
  for (const [name, num] of Object.entries(TZEIT_TIMES)) {
    times[name] = name.endsWith('deg') ? zman.tzeit(num) : zman.sunsetOffset(num, roundMinute);
  }
  if (roundMinute) {
    for (const [name, dt] of Object.entries(times)) {
      times[name] = Zmanim.roundTime(dt);
    }
  }
  if (formatAsString) {
    const tzid = location.getTzid();
    for (const [name, dt] of Object.entries(times)) {
      times[name] = Zmanim.formatISOWithTimeZone(tzid, dt);
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
    'Midnight - Chatzot',
    'Sunset plus 6 halachic hours',
  ],
  alotHaShachar: [
    'Dawn - Alot haShachar',
    'Sun is 16.1° below the horizon in the morning',
  ],
  misheyakir: [
    'Earliest talis & tefillin - Misheyakir',
    'Sun is 11.5° below the horizon in the morning',
  ],
  misheyakirMachmir: [
    'Earliest talis & tefillin - Misheyakir Machmir',
    'Sun is 10.2° below the horizon in the morning',
  ],
  dawn: [
    'Civl dawn',
    'Sun is 6° below the horizon in the morning',
  ],
  sunrise: [
    'Sunrise',
    'Upper edge of the Sun appears over the eastern horizon in the morning (0.833° above horizon)',
  ],
  sofZmanShma: [
    'Latest Shema (Gra)',
    'Sunrise plus 3 halachic hours, according to the Gra',
  ],
  sofZmanTfilla: [
    'Latest Shacharit (Gra)',
    'Sunrise plus 4.5 halachic hours, according to the Gra',
  ],
  sofZmanShmaMGA: [
    'Latest Shema (MGA)',
    'Sunrise plus 3 halachic hours, according to Magen Avraham',
  ],
  sofZmanTfillaMGA: [
    'Latest Shacharit (MGA)',
    'Sunrise plus 4.5 halachic hours, according to Magen Avraham',
  ],
  chatzot: [
    'Midday - Chatzot',
    'Sunrise plus 6 halachic hours',
  ],
  minchaGedola: [
    'Earliest Mincha - Mincha Gedola',
    'Sunrise plus 6.5 halachic hours',
  ],
  minchaKetana: [
    'Preferable earliest time to recite Minchah - Mincha Ketana',
    'Sunrise plus 9.5 halachic hours',
  ],
  plagHaMincha: [
    'Plag haMincha',
    'Sunrise plus 10.75 halachic hours',
  ],
  sunset: [
    'Sunset',
    'When the upper edge of the Sun disappears below the horizon (0.833° below horizon)',
  ],
  dusk: [
    'Civil dusk',
    'Sun is 6° below the horizon in the evening',
  ],
  tzeit7083deg: [
    'Nightfall (3 medium stars) - Tzeit 7.083°',
    'When 3 medium stars are observable in the night sky with the naked eye (sun 7.083° below the horizon)',
  ],
  tzeit85deg: [
    'Nightfall (3 small stars) - Tzeit 8.5°',
    'When 3 small stars are observable in the night sky with the naked eye (sun 8.5° below the horizon)',
  ],
  tzeit42min: [
    'Nightfall (3 medium stars) - Tzeit 42 minutes',
    'When 3 small stars are observable in the night sky with the naked eye (fixed 42 minutes after sunset)',
  ],
  tzeit50min: [
    'Nightfall (3 small stars) - Tzeit 50 minutes',
    'When 3 small stars are observable in the night sky with the naked eye (fixed 42 minutes after sunset)',
  ],
  tzeit72min: [
    'Nightfall (Rabbeinu Tam) - Tzeit 72 minutes',
    'When 3 small stars are observable in the night sky with the naked eye (fixed 72 minutes after sunset)',
  ],
};

/**
 * @private
 * @param {any} ctx
 */
export async function zmanimIcalendar(ctx) {
  const location = getLocationFromQuery(ctx.db, ctx.request.query);
  if (location === null) {
    throw createError(400, 'Location is required');
  }
  const today = nowInTimezone(location.getTzid());
  const startD = today.subtract(2, 'day');
  const endD = today.add(4, 'day');
  const times = getTimesForRange(startD, endD, location, false, true);
  const events = [];
  for (const [zman, map] of Object.entries(times)) {
    for (const [isoDate, dt] of Object.entries(map)) {
      const hd = new HDate(new Date(isoDate));
      const desc0 = ZMAN_NAMES[zman];
      const desc = Array.isArray(desc0) && desc0.length === 2 ? desc0 : [zman, ''];
      const ev = new TimedEvent(hd, desc[0], flags.USER_EVENT, dt, location);
      ev.category = zman;
      ev.memo = desc[1];
      events.push(ev);
    }
  }
  events.sort((a, b) => a.eventTime - b.eventTime);
  const options = {
    location,
    title: `Hebcal Zmanim ${location.getShortName()}`,
    publishedTTL: 'PT1D',
  };
  ctx.set('Cache-Control', 'max-age=86400');
  ctx.lastModified = new Date();
  ctx.response.type = 'text/calendar; charset=utf-8';
  ctx.body = await eventsToIcalendar(events, options);
}
