import {HebrewCalendar} from '@hebcal/core';
import {getCalendarTitle} from '@hebcal/rest-api';
import etag from 'etag';
import createError from 'http-errors';
import {basename} from 'path';
import {createPdfDoc, renderPdf} from './pdf';

/**
 * @param {any} ctx
 */
export async function holidayPdf(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  if (!base.startsWith('hebcal-')) {
    throw createError(400, `Invalid PDF URL format: ${base}`);
  }
  const year = basename(base.substring(7));
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(400, `Invalid holiday year: ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761) : yearNum;
  const options = {
    year: calendarYear,
    addHebrewDates: true,
    isHebrewYear,
    il: ctx.state.il,
    // used for ETag
    outputType: '.pdf',
    version: HebrewCalendar.version(),
  };
  const events = HebrewCalendar.calendar(options);
  const title = getCalendarTitle(events, options);
  ctx.set('Cache-Control', 'max-age=5184000');
  ctx.response.type = 'application/pdf';
  ctx.response.etag = etag(JSON.stringify(options), {weak: true});
  const doc = ctx.body = createPdfDoc(title);
  renderPdf(doc, events, options);
  doc.end();
}
