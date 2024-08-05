import {flags, HebrewCalendar} from '@hebcal/core';
import {getHolidayDescription} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import {getHolidayMeta} from './getHolidayMeta.js';
import {
  categories,
  eventToHolidayItem,
  getFirstOcccurences,
  makeQueryAndDownloadProps,
  makeEventJsonLD,
} from './holidayCommon.js';

async function makeItems(events, il, showYear, addIsraelAsterisk) {
  const items = {};
  for (const key of Object.keys(categories)) {
    items[key] = [];
  }
  const today = dayjs();
  for (const ev of events) {
    const item = eventToHolidayItem(ev, il);
    const category = item.categories.length === 1 ? item.categories[0] : item.categories[1];
    item.descrShort = getHolidayDescription(ev, true);
    const descrMedium = getHolidayDescription(ev, false) || ev.memo || '';
    const sentences = descrMedium.split(/\.\s+/).slice(0, 2);
    const firstTwo = sentences.join('. ');
    item.descrMedium = sentences.length == 2 ? firstTwo + '.' : firstTwo;
    const meta = item.meta = await getHolidayMeta(item.name);
    items[category].push(item);
    if (today.isBefore(item.d) && ev.url()) {
      item.jsonLD = makeEventJsonLD(ev, meta, il);
    }
  }
  return items;
}

export async function holidayYearIndex(ctx) {
  const rpath = ctx.request.path;
  const year = basename(rpath);
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(404, `Sorry, year ${year} is not numeric`);
  } else if (yearNum < 1 || yearNum > 9999) {
    throw createError(400, `Sorry, can't display holidays for year ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const il = ctx.state.il;
  const options = {
    year: calendarYear,
    isHebrewYear,
    il,
    // shabbatMevarchim: true,
  };
  let events0 = HebrewCalendar.calendar(options);
  if (!il) {
    const eventsIlModern = HebrewCalendar.calendar({
      il: true,
      year: calendarYear,
      isHebrewYear,
    }).filter((ev) => ev.getFlags() === (flags.IL_ONLY | flags.MODERN_HOLIDAY));
    events0 = eventsIlModern.concat(events0);
    events0.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  }
  const events = getFirstOcccurences(events0);
  const items = await makeItems(events, il, isHebrewYear, true);
  const roshHashana = events.find((ev) => ev.basename() === 'Rosh Hashana');
  const q = makeQueryAndDownloadProps(ctx, {...options, numYears: 5});
  const greg1 = isHebrewYear ? calendarYear - 3761 : yearNum;
  const greg2 = isHebrewYear ? calendarYear - 3760 : yearNum;
  await ctx.render('holiday-year-index', {
    today: dayjs(),
    year: year.padStart(4, '0'),
    greg1,
    greg2,
    prev: isHebrewYear ? `${greg1 - 1}-${greg1}` : yearNum - 1,
    next: isHebrewYear ? `${greg2}-${greg2 + 1}` : yearNum + 1,
    isHebrewYear,
    calendarYear,
    categories,
    items,
    RH: dayjs(roshHashana.getDate().greg()),
    il,
    locationName: il ? 'Israel' : 'the Diaspora',
    iSuffix: il ? '?i=on' : '',
    q,
    isoDateStart: dayjs(events0[0].getDate().greg()).format('YYYY-MM') + '-01',
    options,
    amp: (q.amp === '1') ? true : undefined,
  });
}
