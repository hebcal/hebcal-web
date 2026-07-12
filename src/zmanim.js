import {Zmanim, isAssurBemlacha} from '@hebcal/core';
import {version} from '@hebcal/core/dist/esm/pkgVersion';
import {empty} from './empty.js';
import {checkFreshETag} from './etag.js';
import {pkg} from './pkg.js';
import {getLocationFromQuery} from './location.js';
import {CACHE_CONTROL_30DAYS} from './cacheControl.js';
import {getStartAndEnd} from './dateUtil.js';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {locationToPlainObj} from '@hebcal/rest-api';
import {ALL_TIMES, getTimes, getTimesForRange } from './zmanimCommon.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const VERSION = version + '-' + pkg.version;

/**
 * @private
 * @param {import('koa').Context} ctx
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
    if (checkFreshETag(ctx, q, {})) {
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
    if (Number.isNaN(dt.getTime())) {
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
 * @param {import('koa').Context} ctx
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
 * @param {import('koa').Context} ctx
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


