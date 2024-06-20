import {Zmanim, flags} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, getCalendarTitle, makeAnchor} from '@hebcal/rest-api';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf.js';
import {basename} from 'path';
import {makeHebcalOptions, makeHebrewCalendar, eTagFromOptions,
  cleanQuery,
  makeIcalOpts, getNumYears, localeMap} from './common.js';
import {lookupParshaMeta} from './parshaCommon.js';

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
  if (!events.length) {
    ctx.throw(400, 'Please select at least one event option');
  }
  // set Last-Modified date to the date of the first calendar
  // event, unless that would be in the future
  const firstEvDt = events[0].getDate().greg();
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
    if (!icalOpt.calendarColor) {
      icalOpt.calendarColor = '#800002';
    }
    icalOpt.utmSource = query.utm_source || 'ical';
    icalOpt.utmMedium = query.utm_medium || 'icalendar';
    icalOpt.utmCampaign = query.utm_campaign || 'ical-' + campaignName(events, icalOpt);
    if (!query.subscribe) {
      ctx.response.attachment(basename(path));
    }
    for (const ev of events) {
      if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
        const parshaName = ev.getDesc().substring(9);
        const meta = lookupParshaMeta(parshaName);
        const memo = meta.summaryHtml?.html;
        if (memo) {
          ev.memo = memo;
        }
      }
    }
    if (options.omer && options.location) {
      addLocationOmerAlarms(options, events);
    }
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = await eventsToIcalendar(events, icalOpt);
  } else if (csv) {
    const csv = eventsToCsv(events, options);
    ctx.response.attachment(basename(path));
    ctx.response.type = 'text/x-csv; charset=utf-8';
    const locale = localeMap[options.locale] || 'en';
    const byteOrderMark = locale == 'en' ? '' : '\uFEFF';
    ctx.body = byteOrderMark + csv;
  } else if (extension == '.pdf') {
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
 * @param {CalOptions} options
 * @return {string}
 */
function campaignName(events, options) {
  const title = getCalendarTitle(events, options);
  return makeAnchor(title.substring(title.indexOf(' ') + 1));
}
