import {Event, HDate, Location, flags} from '@hebcal/core';
import {IcalEvent, icalEventsToString} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import {makeIcalEvents} from './icalCommon.js';
import {basename} from 'node:path';
import {murmur128HexSync} from '@hebcal/murmurhash3';
import {checkFreshETag} from './etag.js';
import {makeIcalOpts} from './urlArgs.js';
import {getMaxYahrzeitId,
  getAnniversaryTypes,
  YAHRZEIT,
  makeCalendarTitle,
  getYahrzeitDetailsFromDb} from './yahrzeitCommon.js';
import {makeYahrzeitEvents, getDateRange, makeEditMemo} from './yahrzeitEvents.js';

/**
 * @param {import('koa').Context} ctx
 */
async function getDetailsFromDb(ctx) {
  const id = ctx.request.path.substring(4, 30);
  const obj = await getYahrzeitDetailsFromDb(ctx, id);
  ctx.state.relcalid = id;
  return obj;
}

const maxEventsIcsSub = 1200;

const REMINDER_DURATION_MINUTES = 15;

/**
 * @param {string} str iCalendar local date-time, e.g. "20260101T143000"
 * @param {number} minutesToAdd
 * @return {string}
 */
function addMinutesToIcalDateTimeStr(str, minutesToAdd) {
  const year = +str.slice(0, 4);
  const month = +str.slice(4, 6) - 1;
  const day = +str.slice(6, 8);
  const hour = +str.slice(9, 11);
  const minute = +str.slice(11, 13);
  const second = +str.slice(13, 15);
  const dt = new Date(year, month, day, hour, minute + minutesToAdd, second);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}` +
    `T${pad2(dt.getHours())}${pad2(dt.getMinutes())}${pad2(dt.getSeconds())}`;
}

/**
 * @param {import('koa').Context} ctx
 */
export async function yahrzeitDownload(ctx) {
  const rpath = ctx.request.path;
  const details = rpath.startsWith('/v3') ? await getDetailsFromDb(ctx) : {};
  const query = {...details, ...ctx.request.query};
  // Collapse to the first value associated to a given query parameter
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      query[key] = value[0];
    }
  }
  const vv = query.v;
  if (vv?.[0] !== 'y') {
    return;
  }
  if (ctx.state.ulid) {
    query.ulid = ctx.state.ulid;
  }
  const extension = rpath.substring(rpath.length - 4);
  const ics = extension === '.ics';
  const csv = extension === '.csv';
  const {today, startYear, endYear} = getDateRange(query);
  const sunday = today.onOrBefore(0).abs();
  const attrs = {startYear, endYear, extension};
  const isAttachment = query.dl == '1';
  if (ics) {
    attrs.icalv = IcalEvent.version();
    if (!isAttachment) {
      attrs.sunday = sunday;
    }
  }
  if (checkFreshETag(ctx, query, attrs)) {
    return;
  }

  let reminder = query.yrem !== '0' && query.yrem !== 'off';
  if (csv) {
    reminder = false;
  }
  const maxId = getMaxYahrzeitId(query);
  const events0 = await makeYahrzeitEvents(maxId, query, reminder);
  const startAbs = sunday - 12 * 7; // 12 weeks ago
  const events = !ics || isAttachment ? events0 : events0.filter((ev) => ev.getDate().abs() >= startAbs);

  if (isAttachment) {
    ctx.response.attachment(basename(rpath));
  }
  if (ics) {
    ctx.response.type = 'text/calendar; charset=utf-8';
    const caldesc = makeCalendarTitle(query, Number.POSITIVE_INFINITY);
    const title = makeCalendarTitle(query, 64);
    const opts = {
      yahrzeit: true,
      emoji: true,
      title: title,
      caldesc: caldesc === title ?
        'Personal anniversaries from Hebcal.com' :
        'Hebcal ' + caldesc,
      relcalid: ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null,
      publishedTTL: 'P1D',
      sequence: +(query.seq) || 1,
      locale: 'en',
    };
    const icalOpt = makeIcalOpts(opts, query);
    icalOpt.dtstamp = IcalEvent.makeDtstamp(new Date());
    // Hack for Google Calendar which doesn't understand iCalendar floating times
    const typesSet = getAnniversaryTypes(query);
    const doLocation = reminder && typesSet.has(YAHRZEIT);
    if (doLocation) {
      if (query.i === 'on') {
        icalOpt.location = Location.lookup('Jerusalem');
      } else if (ctx.get('user-agent') === 'Google-Calendar-Importer') {
        icalOpt.location = makeLocation(query);
      }
    }
    const zeroEvents = events.length === 0;
    const events1 = events.length > maxEventsIcsSub && !isAttachment ? events.slice(0, maxEventsIcsSub) : events;
    const events2 = zeroEvents ? makeDummyEvent(ctx) : events1;
    if (zeroEvents) {
      icalOpt.publishedTTL = false;
    }
    const icals = makeIcalEvents(events2, icalOpt);
    for (const icalEv of icals) {
      if (doLocation) {
        icalEv.locationName = undefined;
      }
      // Yahrzeit reminder events are the only timed events on this calendar;
      // give them a 15-minute DURATION instead of 0-minute (DTEND===DTSTART)
      // for stricter RFC 5545 compatibility.
      if (icalEv.timed) {
        icalEv.endDate = addMinutesToIcalDateTimeStr(icalEv.startDate, REMINDER_DURATION_MINUTES);
      }
    }
    ctx.append('Vary', 'User-Agent');
    ctx.body = await icalEventsToString(icals, icalOpt);
  } else if (csv) {
    const euro = Boolean(query.euro);
    const csv = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = '\uFEFF' + csv;
  } else {
    ctx.status = 404;
    ctx.remove('ETag');
    ctx.remove('Cache-Control');
    ctx.response.type = 'text/plain';
    ctx.body = 'Invalid download format: ' + extension + '\n';
  }
}

function makeLocation(query) {
  const tzo = Number.parseInt(query.tzo, 10);
  if (Number.isNaN(tzo)) {
    return Location.lookup('New York');
  }
  const tz = tzo / -60;
  let tzid;
  if (tz <= -4 && tz >= -10) {
    tzid = Location.legacyTzToTzid(tz, 'usa');
  } else if (tz <= 2 && tz >= -2) {
    tzid = Location.legacyTzToTzid(tz, 'eu');
  } else {
    tzid = Location.legacyTzToTzid(tz, 'none');
  }
  return new Location(0, 0, false, tzid, '');
}

function makeDummyEvent(ctx) {
  const dt = new Date();
  const ev = new Event(new HDate(dt), 'Calendar contains no events', flags.USER_EVENT);
  const url = ctx.request.url;
  const id = ctx.state.relcalid || murmur128HexSync(url);
  const isoDateStr = IcalEvent.formatYYYYMMDD(dt);
  ev.uid = `yahrzeit-${isoDateStr}-${id}-dummy`;
  ev.alarm = false;
  if (ctx.state.relcalid) {
    const id = ctx.state.relcalid;
    ev.memo = makeEditMemo(id);
  } else {
    ev.memo = 'To create a new Hebcal Yahrzeit + Anniversary Calendar, visit https://www.hebcal.com/yahrzeit';
  }
  ctx.set('Cache-Control', 'max-age=86400');
  ctx.remove('ETag');
  return [ev];
}
