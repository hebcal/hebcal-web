import {flags} from '@hebcal/core';
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
  const query = Object.assign({}, ctx.request.query);
  if (query.v !== '1') {
    return;
  }
  cleanQuery(query);
  // only set Last-Modified is there's a numeric year
  if (query.year !== 'now') {
    ctx.lastModified = ctx.launchDate;
  }
  const options = makeHebcalOptions(ctx.db, query);
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  const ics = extension === '.ics';
  const csv = extension === '.csv';
  if (ics || csv) {
    options.numYears = getNumYears(options);
  }
  // etag includes actual year because options.year is never 'now'
  let icalOpt;
  if (ics) {
    icalOpt = makeIcalOpts(options, query);
  }
  ctx.response.etag = eTagFromOptions(ics ? icalOpt : options, {outputType: extension});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const events = makeHebrewCalendar(ctx, options);
  if (!events.length) {
    ctx.throw(400, 'Please select at least one event option');
  }
  if (ics) {
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
