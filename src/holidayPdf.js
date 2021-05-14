import {HebrewCalendar} from '@hebcal/core';
import {getCalendarTitle} from '@hebcal/rest-api';
import createError from 'http-errors';
import {basename} from 'path';
import {createPdfDoc, renderPdf} from './pdf';
import {lgToLocale, localeMap, eTagFromOptions} from './common';

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
  const query = ctx.request.query;
  const lg = lgToLocale[query.lg || 's'] || query.lg;
  const locale = localeMap[lg] || 'en';
  const options = {
    year: calendarYear,
    addHebrewDates: true,
    isHebrewYear,
    locale,
    il: ctx.state.il,
  };
  const events = HebrewCalendar.calendar(options);
  const title = getCalendarTitle(events, options);
  ctx.set('Cache-Control', 'max-age=5184000');
  ctx.response.type = 'application/pdf';
  ctx.response.etag = eTagFromOptions(options, {outputType: '.pdf'});
  const doc = ctx.body = createPdfDoc(title, options);
  renderPdf(doc, events, options);
  doc.end();
}
