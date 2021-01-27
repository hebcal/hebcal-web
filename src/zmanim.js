import {Zmanim} from '@hebcal/core';
import {toISOStringWithTimezone} from '@hebcal/rest-api';
import {empty, isoDateStringToDate, getLocationFromQuery} from './common';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);


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

/**
 * @private
 * @param {any} ctx
 */
export async function getZmanim(ctx) {
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  const q = ctx.request.query;
  const dateStr = q.date;
  const isToday = empty(dateStr);
  const dt = isToday ? new Date() : isoDateStringToDate(dateStr);
  const isoDate = dt.toISOString().substring(0, 10);
  const loc = ctx.state.location = getLocationFromQuery(ctx.db, q);
  if (loc === null) {
    throw createError(400, 'Location is required');
  }
  if (isToday) {
    expires(ctx);
  } else {
    ctx.set('Cache-Control', 'max-age=2592000');
  }
  const zman = new Zmanim(dt, loc.getLatitude(), loc.getLongitude());
  const times = {};
  const tzid = loc.getTzid();
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
  });
  for (const func of Object.keys(TIMES)) {
    times[func] = {};
  }
  for (const func of Object.keys(TIMES)) {
    const val = zman[func]();
    times[func][isoDate] = toISOStringWithTimezone(val, formatTime(timeFormat, val), tzid);
  }
  const tzeit7 = zman.tzeit(7.083);
  times['tzeit7083'] = {};
  times['tzeit7083'][isoDate] = toISOStringWithTimezone(tzeit7, formatTime(timeFormat, tzeit7), tzid);
  ctx.body = {location: loc, times};
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
