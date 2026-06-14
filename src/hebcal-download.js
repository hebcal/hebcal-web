import {HDate, Event, Zmanim, flags} from '@hebcal/core';
import {IcalEvent, icalEventsToString} from '@hebcal/icalendar';
import {eventsToCsv, getCalendarTitle, makeAnchor} from '@hebcal/rest-api';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf.js';
import {basename} from 'node:path';
import {makeETag, checkFreshETag} from './etag.js';
import {makeHebcalOptions, makeHebrewCalendar, getNumYears} from './calendar.js';
import {yearIsOutsideGregRange, yearIsOutsideHebRange} from './dateUtil.js';
import {cleanQuery} from './cleanQuery.js';
import {localeMap} from './lang.js';
import {makeIcalOpts} from './urlArgs.js';
import {addIcalParshaMemo, addCsvParshaMemo} from './parshaCommon.js';
import {murmur128HexSync} from 'murmurhash3';

export const maxEventsIcsSub = 2399;

function makeTruncationNoticeEvent(lastEvent) {
  const noticeDate = lastEvent.getDate().next();
  const ev = new Event(noticeDate, 'Hebcal calendar feed truncated', flags.USER_EVENT);
  ev.alarm = false;
  ev.memo = 'Your Hebcal calendar subscription exceeded the maximum number of events and has been truncated. ' +
    'Visit https://www.hebcal.com/home/1398/number-of-years-in-calendar-feed-subscriptions to learn more about the feed length limit.';
  return ev;
}

/**
 * @param {Event[]} events
 * @param {boolean} isSubscription
 * @param {HDate} today
 * @return {Event[]}
 */
export function limitIcsFeedLength(events, isSubscription, today) {
  if (isSubscription && events.length > maxEventsIcsSub) {
    const startAbs = today.abs() - 12 * 7; // 12 weeks ago;
    const filteredEvts = events.filter((ev) => ev.getDate().abs() >= startAbs);
    if (filteredEvts.length > maxEventsIcsSub) {
      const truncated = filteredEvts.slice(0, maxEventsIcsSub);
      truncated.push(makeTruncationNoticeEvent(truncated.at(-1)));
      return truncated;
    }
    return filteredEvts;
  }
  return events;
}

/**
 * @param {import('koa').Context} ctx
 */
export async function hebcalDownload(ctx) {
  const query = {...ctx.request.query};
  if (query.v !== '1') {
    return;
  }
  cleanQuery(query);
  const options = makeHebcalOptions(ctx.db, query);
  if (typeof options.year === 'number' &&
      ((options.isHebrewYear && yearIsOutsideHebRange(options.year)) ||
      (!options.isHebrewYear && yearIsOutsideGregRange(options.year)))) {
    ctx.throw(410, `No calendar for year ${options.year}`);
  }
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  const ics = extension === '.ics';
  const csv = extension === '.csv';
  if (ics || csv) {
    options.numYears = getNumYears(options);
  }
  // don't set a Last-Modified date; we'll rely on etag for cache consistency
  // etag includes actual year because options.year is never 'now'
  const opts = {...query, ...options};
  const attrs = {extension};
  if (ics) {
    attrs.icalv = IcalEvent.version();
  }
  if (checkFreshETag(ctx, opts, attrs)) {
    return;
  }
  const events = makeHebrewCalendar(ctx, options);
  if (ics) {
    const icalOpt = makeIcalOpts(options, query);
    if (!icalOpt.title) {
      icalOpt.title = getCalendarTitle(events, icalOpt);
    }
    if (!icalOpt.calendarColor) {
      icalOpt.calendarColor = '#800002';
    }
    icalOpt.utmSource = query.utm_source;
    icalOpt.utmMedium = query.utm_medium;
    icalOpt.utmCampaign = query.utm_campaign || 'ical-' + campaignName(events, icalOpt);
    const isAttachment = !query.subscribe;
    if (isAttachment) {
      ctx.response.attachment(basename(path));
    }
    if (options.sedrot) {
      events.forEach(addIcalParshaMemo);
    }
    if (options.omer && options.location) {
      addLocationOmerAlarms(options, events);
    }
    ctx.response.type = 'text/calendar; charset=utf-8';
    const now = new Date();
    icalOpt.dtstamp = IcalEvent.makeDtstamp(now);
    const zeroEvents = events.length === 0;
    const today = new HDate(now);
    const events1 = limitIcsFeedLength(events, !isAttachment, today);
    if (events1.length !== events.length) {
      const sunday = today.onOrBefore(0).abs();
      attrs.sunday = sunday;
      ctx.response.etag = makeETag(ctx, opts, attrs);
      if (ctx.fresh) {
        ctx.status = 304;
        return;
      }
    }
    const events2 = zeroEvents ? makeDummyEvent(ctx) : events1;
    if (zeroEvents) {
      icalOpt.publishedTTL = false;
    }
    const icals = events2.map((ev) => new IcalEvent(ev, icalOpt));
    ctx.body = await icalEventsToString(icals, icalOpt);
  } else if (csv) {
    if (options.sedrot) {
      addCsvParshaMemos(events, options);
    }
    const csv = eventsToCsv(events, options);
    ctx.response.attachment(basename(path));
    ctx.response.type = 'text/x-csv; charset=utf-8';
    const locale = localeMap[options.locale] || 'en';
    const byteOrderMark = locale === 'en' ? '' : '\uFEFF';
    ctx.body = byteOrderMark + csv;
  } else if (extension === '.pdf') {
    if (!events.length) {
      ctx.remove('Cache-Control');
      ctx.remove('ETag');
      ctx.throw(400, 'Please select at least one event option');
    }
    ctx.remove('Vary');
    ctx.compress = false;
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.response.type = 'application/pdf';
    const title = getCalendarTitle(events, options);
    const doc = ctx.body = createPdfDoc(title, options);
    options.utmSource = query.utm_source; // OK if undefined
    options.utmMedium = query.utm_medium; // OK if undefined
    options.utmCampaign = query.utm_campaign || 'pdf-' + campaignName(events, options);
    renderPdf(doc, events, options, query);
    doc.end();
  } else {
    ctx.status = 404;
    ctx.remove('Cache-Control');
    ctx.remove('ETag');
    ctx.response.type = 'text/plain';
    ctx.body = 'Invalid download format: ' + extension + '\n';
  }
}

function makeDummyEvent(ctx) {
  const dt = new Date();
  const ev = new Event(new HDate(dt), 'Calendar contains no events', flags.USER_EVENT);
  const id = murmur128HexSync(ctx.request.url);
  const isoDateStr = IcalEvent.formatYYYYMMDD(dt);
  ev.uid = `hebcal-${isoDateStr}-${id}-dummy`;
  ev.alarm = false;
  ev.memo = 'To create a new Hebcal holiday calendar, visit https://www.hebcal.com/hebcal';
  ctx.set('Cache-Control', 'max-age=86400');
  ctx.remove('ETag');
  return [ev];
}

function addCsvParshaMemos(events, options) {
  const il = options.il;
  const locale = options.locale;
  for (const ev of events.filter((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA)) {
    addCsvParshaMemo(ev, il, locale);
  }
}

function addLocationOmerAlarms(options, events) {
  const location = options.location;
  const geoid = location.getGeoId();
  const locationName = location.getShortName();
  for (const ev of events.filter((ev) => ev.getFlags() & flags.OMER_COUNT)) {
    const hd = ev.getDate().prev();
    const dow = hd.getDay();
    const zman = new Zmanim(location, hd, options.useElevation);
    const alarm = dow === 5 ? zman.sunsetOffset(-30) :
        dow === 6 ? zman.tzeit(8.5) : zman.dusk();
    const millis = alarm.getTime();
    if (!Number.isNaN(millis)) {
      ev.alarm = alarm;
      ev.locationName = locationName;
      if (geoid) {
        ev.uid = `hebcal-omer-${hd.getFullYear()}-day${ev.omer}-${geoid}`;
      }
    }
  }
}

/**
 * @private
 * @param {Event[]} events
 * @param {import('@hebcal/core').CalOptions} options
 * @return {string}
 */
function campaignName(events, options) {
  const opts = {...options, preferAsciiName: true};
  const title = getCalendarTitle(events, opts);
  return makeAnchor(title.substring(title.indexOf(' ') + 1));
}
