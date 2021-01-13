/* eslint-disable require-jsdoc */
import {flags, HDate, HebrewCalendar} from '@hebcal/core';
import {getEventCategories, getHolidayDescription, makeAnchor} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import createError from 'http-errors';
import {basename} from 'path';
import {getDefaultHebrewYear} from './common';
import {categories, getFirstOcccurences} from './holidayCommon';
import {holidayDetail} from './holidayDetail';
import {holidayPdf} from './holidayPdf';

dayjs.extend(isSameOrAfter);

export async function holidayYearIndex(ctx) {
  const rpath = ctx.request.path;
  const year = basename(rpath);
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(400, `Invalid holiday year: ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const il = ctx.state.il;
  const options = {
    year: calendarYear,
    isHebrewYear,
    il,
  };
  const events0 = HebrewCalendar.calendar(options);
  const events = getFirstOcccurences(events0);
  const items = makeItems(events, isHebrewYear);
  const roshHashana = events.find((ev) => ev.basename() === 'Rosh Hashana');
  await ctx.render('holiday-year-index', {
    title: `Jewish Holidays ${year} | Hebcal Jewish Calendar`,
    today: dayjs(),
    year,
    year4: +year.substring(0, 4),
    isHebrewYear,
    calendarYear,
    categories,
    items,
    RH: dayjs(roshHashana.getDate().greg()),
    il,
  });
}

function makeItems(events, showYear) {
  const items = {};
  for (const key of Object.keys(categories)) {
    items[key] = [];
  }
  for (const ev of events) {
    const descrShort = getHolidayDescription(ev, true);
    const eventCategories = getEventCategories(ev);
    const category = eventCategories.length === 1 ? eventCategories[0] : eventCategories[1];
    const holiday = ev.basename();
    const d = dayjs(ev.getDate().greg());
    const item = {
      name: holiday,
      id: makeAnchor(holiday),
      descrShort,
      dates: tableCellObserved(ev, d, showYear),
      d,
    };
    items[category].push(item);
  }
  return items;
}

/**
 * @param {Event} ev
 * @param {dayjs.Dayjs} d
 * @param {boolean} isHebrewYear
 * @return {string}
 */
function tableCellObserved(ev, d, isHebrewYear) {
  const f = ev.basename();
  const mask = ev.getFlags();
  const b0 = '<strong>';
  const b1 = '</strong>';
  if (f === 'Chanukah') {
    return formatDatePlusDelta(d, 7, isHebrewYear) + shortDayOfWeek(d, 7);
  } else if (f === 'Leil Selichot' || mask & flags.MINOR_FAST) {
    return formatSingleDay(d, isHebrewYear) + shortDayOfWeek(d, 0);
  } else if (f === 'Purim' || f === 'Tish\'a B\'Av' || !(mask & flags.CHAG)) {
    return formatSingleDayHtml(d, isHebrewYear) + shortDayOfWeek(d, 0);
  } else {
    switch (f) {
      case 'Shavuot':
      case 'Rosh Hashana':
        return b0 + formatDatePlusDelta(d, 1, isHebrewYear) + b1 + shortDayOfWeek(d, 1);
      case 'Yom Kippur':
      case 'Shmini Atzeret':
      case 'Simchat Torah':
        return b0 + formatSingleDayHtml(d, isHebrewYear) + b1 + shortDayOfWeek(d, 0);
      case 'Sukkot':
        const d2 = d.add(2, 'd');
        return b0 + formatDatePlusDelta(d, 1, isHebrewYear) + b1 + shortDayOfWeek(d, 1) +
        '<br>' + formatDatePlusDelta(d2, 4, isHebrewYear) + shortDayOfWeek(d2, 4);
      case 'Pesach':
        const d3 = d.add(2, 'd');
        const d6 = d.add(6, 'd');
        return b0 + formatDatePlusDelta(d, 1, isHebrewYear) + b1 + shortDayOfWeek(d, 1) +
        '<br>' + formatDatePlusDelta(d3, 3, isHebrewYear) + shortDayOfWeek(d3, 3) +
        '<br>' + b0 + formatDatePlusDelta(d6, 1, isHebrewYear) + b1 + shortDayOfWeek(d6, 1);
    }
  }
}

const DoWtiny = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

/**
 * @param {dayjs.Dayjs} d
 * @param {number} delta
 * @return {string}
 */
function shortDayOfWeek(d, delta) {
  let s = DoWtiny[d.day()];
  if (delta) {
    const d2 = d.add(delta, 'd');
    s += '‑' + DoWtiny[d2.day()];
  }
  return ` <small class="text-muted">${s}</small>`;
}

/**
 * @param {dayjs.Dayjs} d1
 * @param {dayjs.Dayjs} d2
 * @param {boolean} showYear
 * @return {string}
 */
function formatDateRange(d1, d2, showYear) {
  const iso = d2.format('YYYY-MM-DD');
  const day2str = d1.month() === d2.month() ? String(d2.date()) : formatSingleDay(d2, false);
  const str = formatSingleDayHtml(d1, false) + '‑' + `<time datetime="${iso}">${day2str}</time>`;
  return showYear ? str + ', ' + d2.year() : str;
}

/**
 * @param {dayjs.Dayjs} d
 * @param {boolean} showYear
 * @return {string}
 */
function formatSingleDayHtml(d, showYear) {
  const d0 = d.subtract(1, 'd');
  const iso = d.format('YYYY-MM-DD');
  const d0str = formatSingleDay(d0, true);
  const dayStr = formatSingleDay(d, showYear);
  // eslint-disable-next-line max-len
  return `<time datetime="${iso}" title="begins at sundown on ${d0str}">${dayStr}</time>`;
}

/**
 * @param {dayjs.Dayjs} d
 * @param {boolean} showYear
 * @return {string}
 */
function formatSingleDay(d, showYear) {
  return d.format(showYear ? 'MMM D, YYYY' : 'MMM D');
}

/**
 * @param {dayjs.Dayjs} d
 * @param {number} delta
 * @param {boolean} showYear
 * @return {string}
 */
function formatDatePlusDelta(d, delta, showYear) {
  const d2 = d.add(delta, 'd');
  return formatDateRange(d, d2, showYear);
}

const NUM_YEARS = 6;

const rchNames = [
  'Cheshvan',
  'Kislev',
  'Tevet',
  'Sh\'vat',
  'Adar',
  'Adar I',
  'Adar II',
  'Nisan',
  'Iyyar',
  'Sivan',
  'Tamuz',
  'Av',
  'Elul',
];

export async function holidayMainIndex(ctx) {
  const dt = new Date();
  const hyear = getDefaultHebrewYear(new HDate(dt));
  const tishrei1 = new HDate(1, 'Tishrei', hyear);
  const items = {};
  for (const catId of Object.keys(categories)) {
    items[catId] = {};
  }
  const rch = items['roshchodesh'];
  rchNames.forEach((month) => rch[`Rosh Chodesh ${month}`] = Array(NUM_YEARS));
  const il = ctx.state.il;
  for (let i = 0; i < NUM_YEARS; i++) {
    const events0 = HebrewCalendar.calendar({
      year: hyear + i - 1,
      isHebrewYear: true,
      il,
    });
    const events = getFirstOcccurences(events0);
    const items0 = makeItems(events, false);
    for (const [catId, items1] of Object.entries(items0)) {
      for (const item of items1) {
        if (!Array.isArray(items[catId][item.name])) {
          items[catId][item.name] = Array(NUM_YEARS);
        }
        items[catId][item.name][i] = item;
      }
    }
  }
  await ctx.render('holiday-main-index', {
    title: 'Jewish Holidays | Hebcal Jewish Calendar',
    RH: dayjs(tishrei1.greg()),
    today: dayjs(dt),
    hyear,
    categories,
    items,
    il,
  });
}

export async function holidaysApp(ctx) {
  ctx.set('Last-Modified', ctx.launchUTCString);
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const rpath = ctx.request.path;
  ctx.state.il = ctx.request.query.i === 'on';
  if (rpath === '/holidays/') {
    await holidayMainIndex(ctx);
  } else if (rpath.endsWith('.pdf')) {
    await holidayPdf(ctx);
  } else {
    const charCode = rpath.charCodeAt(10);
    if (charCode >= 48 && charCode <= 57) {
      await holidayYearIndex(ctx);
    } else {
      await holidayDetail(ctx);
    }
  }
}
