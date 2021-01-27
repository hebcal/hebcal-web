import {Zmanim} from '@hebcal/core';
import {toISOStringWithTimezone} from '@hebcal/rest-api';
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
  tzeit: 1,
  chatzotNight: 1,
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
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: loc.getTzid(),
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
  });
  if (isRange) {
    const times = {};
    for (const func of Object.keys(TIMES)) {
      times[func] = {};
    }
    times.tzeit7083 = {};
    for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
      const dt = d.toDate();
      const t = getTimes(dt, loc, timeFormat);
      const isoDate = dt.toISOString().substring(0, 10);
      for (const [key, val] of Object.entries(t)) {
        times[key][isoDate] = val;
      }
    }
    ctx.body = {location: loc, times};
  } else {
    const dt = startD.toDate();
    const t = getTimes(dt, loc, timeFormat);
    const isoDate = dt.toISOString().substring(0, 10);
    ctx.body = {location: loc, date: isoDate, times: t};
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
 * @param {Date} dt
 * @param {Location} location
 * @param {Intl.DateTimeFormat} timeFormat
 * @return {Object<string,string>}
 */
function getTimes(dt, location, timeFormat) {
  const tzid = location.getTzid();
  const times = {};
  const zman = new Zmanim(dt, location.getLatitude(), location.getLongitude());
  for (const func of Object.keys(TIMES)) {
    const val = zman[func]();
    times[func] = toISOStringWithTimezone(val, formatTime(timeFormat, val), tzid);
  }
  const tzeit7 = zman.tzeit(7.083);
  times['tzeit7083'] = toISOStringWithTimezone(tzeit7, formatTime(timeFormat, tzeit7), tzid);
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
 * @param {Intl.DateTimeFormat} timeFormat
 * @param {Date} dt
 * @return {string}
 */
function formatTime(timeFormat, dt) {
  const time = timeFormat.format(dt);
  const hm = time.split(':');
  if (hm[0] === '24') {
    return '00:' + hm[1];
  }
  return time;
}
