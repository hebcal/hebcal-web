import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, getCalendarTitle, makeAnchor} from '@hebcal/rest-api';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf';
import {basename} from 'path';
import {makeHebcalOptions, makeHebrewCalendar, eTagFromOptions,
  empty, getNumYears} from './common';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== '1') {
    return;
  }
  // only set Last-Modified is there's a numeric year
  if (query.year !== 'now') {
    ctx.lastModified = ctx.launchDate;
  }
  const options = makeHebcalOptions(ctx.db, query);
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  if (extension == '.ics' || extension == '.csv') {
    options.numYears = getNumYears(options);
  }
  // etag includes actual year because options.year is never 'now'
  ctx.response.etag = eTagFromOptions(options, {outputType: extension});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const events = makeHebrewCalendar(ctx, options);
  if (!events.length) {
    ctx.throw(400, 'Please select at least one event option');
  }
  if (extension == '.ics') {
    if (query.emoji === '1' || query.emoji === 'on') {
      options.emoji = true;
    }
    for (const key of ['title', 'caldesc', 'publishedTTL']) {
      if (!empty(query[key])) {
        options[key] = query[key];
      }
    }
    options.calendarColor = '#800002';
    options.utmSource = query.utm_source || 'ical';
    options.utmMedium = query.utm_medium || 'icalendar';
    options.utmCampaign = query.utm_campaign || 'ical-' + campaignName(events, options);
    if (!query.subscribe) {
      ctx.response.attachment(basename(path));
    }
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = await eventsToIcalendar(events, options);
  } else if (extension == '.csv') {
    const csv = eventsToCsv(events, options);
    ctx.response.attachment(basename(path));
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = csv;
  } else if (extension == '.pdf') {
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
 * @param {HebrewCalendar.Options} options
 * @return {string}
 */
function campaignName(events, options) {
  const title = getCalendarTitle(events, options);
  return makeAnchor(title.substring(title.indexOf(' ') + 1));
}
