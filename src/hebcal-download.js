import {eventsToIcalendarStream} from '@hebcal/icalendar';
import {eventsToCsv, getCalendarTitle, getEventCategories} from '@hebcal/rest-api';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from './pdf';
import {PassThrough} from 'stream';
import etag from 'etag';
import {basename} from 'path';
import {makeHebcalOptions, makeHebrewCalendar} from './common';

const maxNumYear = {
  candlelighting: 4,
  omer: 4,
  addHebrewDatesForEvents: 3,
  addHebrewDates: 2,
  dafyomi: 2,
};

/**
 * Parse HebcalOptions to determine ideal numYears
 * @param {HebcalOptions} options
 * @return {number}
 */
function getNumYears(options) {
  if (options.numYears) {
    return options.numYears;
  }

  if ((!options.isHebrewYear && options.year < 2016) ||
      (options.isHebrewYear && options.year < 5776)) {
    return 1;
  }

  let numYears = 5;
  for (const [key, ny] of Object.entries(maxNumYear)) {
    if (options[key] && ny < numYears) {
      numYears = ny;
    }
  }
  // Shabbat plus Hebrew Event every day can get very big
  const hebrewDates = options.addHebrewDates || options.addHebrewDatesForEvents;
  if (options.candlelighting && hebrewDates) {
    numYears = 2;
  }
  // reduce size of file for truly crazy people who specify both Daf Yomi and Hebrew Date every day
  if (options.dafyomi && hebrewDates) {
    numYears = 1;
  }
  return numYears;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebcalDownload(ctx) {
  const query = ctx.request.query;
  if (query.v !== '1') {
    return;
  }
  let options;
  try {
    options = makeHebcalOptions(ctx.db, query);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const path = ctx.request.path;
  const extension = path.substring(path.length - 4);
  if (extension == '.ics' || extension == '.csv') {
    options.numYears = getNumYears(options);
  }
  let events = makeHebrewCalendar(ctx, options);
  if (options.noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  if (!events.length) {
    ctx.throw(400, 'Please select at least one event option');
  }
  ctx.set('Last-Modified', ctx.launchUTCString);
  if (extension == '.ics') {
    if (!query.subscribe) {
      ctx.response.attachment(basename(path));
    }
    ctx.response.type = 'text/calendar; charset=utf-8';
    const pt = ctx.body = new PassThrough();
    eventsToIcalendarStream(pt, events, options);
  } else if (extension == '.csv') {
    const ical = eventsToCsv(events, options);
    ctx.response.attachment(basename(path));
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  } else if (extension == '.pdf') {
    ctx.response.type = 'application/pdf';
    ctx.response.etag = etag(JSON.stringify(options), {weak: true});
    const title = getCalendarTitle(events, options);
    const doc = ctx.body = createPdfDoc(title);
    renderPdf(doc, events, options);
    doc.end();
  }
}
