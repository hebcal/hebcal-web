import {Zmanim} from '@hebcal/core';
import {empty, isoDateStringToDate, getLocationFromQuery} from './common';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

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
  sofZmanTfilla: 1,
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

const MAX_DAYS = 45;

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
  const {isRange, startD, endD} = getStartAndEnd(q);
  const loc = ctx.state.location = getLocationFromQuery(ctx.db, q);
  if (loc === null) {
    throw createError(400, 'Location is required');
  }
  if (isRange || !empty(q.date)) {
    ctx.set('Cache-Control', 'max-age=2592000');
  } else {
    expires(ctx);
  }
  if (isRange) {
    const times = {};
    for (const func of Object.keys(TIMES).concat(Object.keys(TZEIT_TIMES))) {
      times[func] = {};
    }
    for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
      const t = getTimes(d, loc);
      const isoDate = d.format('YYYY-MM-DD');
      for (const [key, val] of Object.entries(t)) {
        times[key][isoDate] = val;
      }
    }
    ctx.body = {location: loc, times};
  } else {
    const times = getTimes(startD, loc);
    const isoDate = startD.format('YYYY-MM-DD');
    ctx.body = {location: loc, date: isoDate, times};
  }
}

// eslint-disable-next-line require-jsdoc
function getStartAndEnd(q) {
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
  const startD = isRange ? isoToDayjs(q.start) : empty(q.date) ? dayjs() : isoToDayjs(q.date);
  let endD = isRange ? isoToDayjs(q.end) : empty(q.date) ? dayjs() : isoToDayjs(q.date);
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
 * @param {string} str
 * @return {dayjs.Dayjs}
 */
function isoToDayjs(str) {
  return dayjs(isoDateStringToDate(str));
}

/**
 * @private
 * @param {dayjs.Dayjs} d
 * @param {Location} location
 * @return {Object<string,string>}
 */
function getTimes(d, location) {
  const tzid = location.getTzid();
  const times = {};
  const zman = new Zmanim(d.toDate(), location.getLatitude(), location.getLongitude());
  for (const func of Object.keys(TIMES)) {
    const dt = zman[func]();
    if (!isNaN(dt.getTime())) {
      times[func] = formatTime(Zmanim.roundTime(dt), tzid);
    }
  }
  for (const [name, num] of Object.entries(TZEIT_TIMES)) {
    if (name.endsWith('deg')) {
      const dt = zman.tzeit(num);
      if (!isNaN(dt.getTime())) {
        times[name] = formatTime(Zmanim.roundTime(dt), tzid);
      }
    } else if (name.endsWith('min')) {
      const dt = zman.sunsetOffset(num);
      if (!isNaN(dt.getTime())) {
        times[name] = formatTime(dt, tzid);
      }
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
  ctx.set('Last-Modified', dt.toUTCString());
  const tomorrow = today.add(1, 'd');
  const exp = dayjs.tz(tomorrow.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

/**
 * @private
 * @param {Date} dt
 * @param {string} tzid
 * @return {string}
 */
function formatTime(dt, tzid) {
  const d = dayjs.tz(dt, tzid);
  return d.format();
}
