import { HebrewCalendar, HebrewDateEvent, Zmanim, TimedEvent, flags } from '@hebcal/core';
import { HDate, Locale } from '@hebcal/hdate';
import { IcalEvent, eventsToIcalendar } from '@hebcal/icalendar';
import { makeAnchor } from '@hebcal/rest-api';
import createError from 'http-errors';
import { CACHE_CONTROL_7DAYS } from './cacheControl.js';
import { nowInTimezone } from './dateUtil.js';
import { checkFreshETag } from './etag.js';
import { lgToLocale } from './lang.js';
import { getLocationFromQuery } from './location.js';
import { ALL_TIMES, getTimesForRange } from './zmanimCommon.js';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

dayjs.extend(isSameOrBefore);

const TITLE_PREFIX = 'TITLE:';
const MEMO_PREFIX = 'MEMO:';

/**
 * @private
 * @param {import('koa').Context} ctx
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
  if (events.length === 0) {
    // e.g. polar latitudes where sunrise/sunset don't occur on some dates
    ctx.throw(400, `No zmanim available for ${location.getName()}`);
  }
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  if (checkFreshETag(ctx, options, attrs)) {
    return;
  }
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
      if (!Number.isNaN(dt.getTime())) {
        byDate[isoDate].push([dt, zman]);
      }
    }
  }
  const events = [];
  const timeFormat = location.getTimeFormatter();
  const locationName = location.getShortName();
  const locationNameLong = location.getName();
  const geoid = location.getGeoId() || makeAnchor(locationNameLong);
  const options = { location, locale };
  for (const [isoDate, arr] of Object.entries(byDate)) {
    const date = new Date(isoDate);
    const hd = new HDate(date);
    const ev = new HebrewDateEvent(hd, locale);
    const lines = [];
    arr.sort((a, b) => a[0].getTime() - b[0].getTime());
    for (const [dt, zman] of arr) {
      const desc = Locale.lookupTranslation(TITLE_PREFIX + zman, 'en');
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
      if (!Number.isNaN(dt.getTime())) {
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
  const title = Locale.lookupTranslation(TITLE_PREFIX + zman, 'en');
  const ev = new TimedEvent(hd, title, flags.USER_EVENT, dt, location);
  ev.category = zman;
  const memo = Locale.lookupTranslation(MEMO_PREFIX + zman, 'en');
  if (memo) {
    ev.memo = memo;
  }
  ev.alarm = false;
  return ev;
}
