import {HebrewCalendar, HDate, Event, Zmanim, flags} from '@hebcal/core';
import {IcalEvent, icalEventsToString} from '@hebcal/icalendar';
import {eventsToCsv, getCalendarTitle, makeAnchor} from '@hebcal/rest-api';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf.js';
import {basename} from 'path';
import {makeHebcalOptions, makeHebrewCalendar, eTagFromOptions,
  cleanQuery,
  makeIcalOpts, getNumYears, localeMap} from './common.js';
import {lookupParshaMeta} from './parshaCommon.js';
import {murmur128HexSync} from 'murmurhash3';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  const query = {...ctx.request.query};
  if (query.v !== '1') {
    return;
  }
  cleanQuery(query);
  const options = makeHebcalOptions(ctx.db, query);
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  const ics = extension === '.ics';
  const csv = extension === '.csv';
  if (ics || csv) {
    options.numYears = getNumYears(options);
  }
  const events = makeHebrewCalendar(ctx, options);
  // set Last-Modified date to the date of the first calendar
  // event, unless that would be in the future
  const firstEvDt = events.length > 0 ? events[0].getDate().greg() : new Date();
  ctx.lastModified = firstEvDt > ctx.launchDate ? ctx.launchDate : firstEvDt;
  // etag includes actual year because options.year is never 'now'
  const opts = {...query, ...options};
  ctx.response.etag = eTagFromOptions(opts, {extension});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  if (ics) {
    const icalOpt = makeIcalOpts(options, query);
    if (!icalOpt.title) {
      icalOpt.title = getCalendarTitle(events, icalOpt);
    }
    if (!icalOpt.calendarColor) {
      icalOpt.calendarColor = '#800002';
    }
    icalOpt.utmSource = query.utm_source || 'ical';
    icalOpt.utmMedium = query.utm_medium || 'icalendar';
    icalOpt.utmCampaign = query.utm_campaign || 'ical-' + campaignName(events, icalOpt);
    if (!query.subscribe) {
      ctx.response.attachment(basename(path));
    }
    if (options.sedrot) {
      addParshaMemos(events);
    }
    if (options.omer && options.location) {
      addLocationOmerAlarms(options, events);
    }
    ctx.response.type = 'text/calendar; charset=utf-8';
    icalOpt.dtstamp = IcalEvent.makeDtstamp(new Date());
    const zeroEvents = events.length === 0;
    const events2 = zeroEvents ? makeDummyEvent(ctx) : events;
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
    const byteOrderMark = locale == 'en' ? '' : '\uFEFF';
    ctx.body = byteOrderMark + csv;
  } else if (extension == '.pdf') {
    if (!events.length) {
      ctx.remove('Cache-Control');
      ctx.remove('ETag');
      ctx.throw(400, 'Please select at least one event option');
    }
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.response.type = 'application/pdf';
    const title = getCalendarTitle(events, options);
    const doc = ctx.body = createPdfDoc(title, options);
    options.utmSource = query.utm_source || 'pdf';
    options.utmMedium = query.utm_medium || 'document';
    options.utmCampaign = query.utm_campaign || 'pdf-' + campaignName(events, options);
    renderPdf(doc, events, options);
    doc.end();
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

const PARSHA_SPECIAL_MASK = flags.SPECIAL_SHABBAT | flags.ROSH_CHODESH;

function addCsvParshaMemos(events, options) {
  const il = options.il;
  const locale = options.locale;
  for (const ev of events.filter((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA)) {
    const hd = ev.getDate();
    const holidays0 = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    const holidays1 = holidays0.filter((ev) => Boolean(ev.getFlags() & PARSHA_SPECIAL_MASK));
    if (holidays1.length) {
      ev.memo = holidays1.map((ev) => ev.render(locale)).join(' + ');
    } else {
      const tommorow = hd.next().getDate();
      if (tommorow === 30 || tommorow === 1) {
        ev.memo = 'Machar Chodesh';
      }
    }
  }
}

function addParshaMemos(events) {
  for (const ev of events.filter((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA)) {
    const parshaName = ev.getDesc().substring(9);
    const meta = lookupParshaMeta(parshaName);
    const memo = meta.summaryHtml?.html;
    if (memo) {
      ev.memo = memo;
    }
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
    if (!isNaN(millis)) {
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
