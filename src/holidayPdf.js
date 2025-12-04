import {HebrewCalendar} from '@hebcal/core';
import {getCalendarTitle} from '@hebcal/rest-api';
import createError from 'http-errors';
import {basename} from 'path';
import {createPdfDoc, renderPdf} from './pdf.js';
import {lgToLocale, localeMap, makeETag, cacheControl,
  yearIsOutsideGregRange, yearIsOutsideHebRange, throw410} from './common.js';

const CACHE_CONTROL_60DAYS = cacheControl(60);

/**
 * @param {any} ctx
 */
export async function holidayPdf(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  if (!base.startsWith('hebcal-')) {
    throw createError(404, `Invalid PDF URL format: ${base}`);
  }
  const year = basename(base.substring(7));
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(404, `Invalid holiday year: ${year}`);
  } else if (yearNum < 1 || yearNum > 32000) {
    throw createError(400, `Invalid year number: ${yearNum}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761) : yearNum;
  if ((isHebrewYear && yearIsOutsideHebRange(calendarYear)) ||
      (!isHebrewYear && yearIsOutsideGregRange(calendarYear))) {
    throw410(ctx);
  }
  const query = ctx.request.query;
  const lg = lgToLocale[query.lg || 's'] || query.lg;
  const locale = localeMap[lg] || 'en';
  const options = {
    year: calendarYear,
    addAlternateDates: true,
    isHebrewYear,
    locale,
    il: ctx.state.il,
  };
  ctx.set('Cache-Control', CACHE_CONTROL_60DAYS);
  ctx.response.type = 'application/pdf';
  ctx.response.etag = makeETag(ctx, options, {outputType: '.pdf'});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const events = HebrewCalendar.calendar(options);
  const title = getCalendarTitle(events, options);
  const doc = ctx.body = createPdfDoc(title, options);
  renderPdf(doc, events, options);
  doc.end();
}
