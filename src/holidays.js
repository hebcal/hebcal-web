/* eslint-disable require-jsdoc */
import {flags, HDate, HebrewCalendar} from '@hebcal/core';
import {getEventCategories, getHolidayDescription, eventToFullCalendar} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import createError from 'http-errors';
import {basename} from 'path';
import {getDefaultHebrewYear, getNumYears} from './common';
import {makeDownloadProps} from './makeDownloadProps';
import {categories, getFirstOcccurences, eventToHolidayItem} from './holidayCommon';
import {holidayDetail} from './holidayDetail';
import {holidayPdf} from './holidayPdf';

dayjs.extend(isSameOrAfter);

const DoWtiny = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

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
  const items = makeItems(events, il, isHebrewYear);
  const roshHashana = events.find((ev) => ev.basename() === 'Rosh Hashana');
  const q = makeQueryAndDownloadProps(ctx, {...options, numYears: 5});
  const greg1 = isHebrewYear ? calendarYear - 3761 : yearNum;
  const greg2 = isHebrewYear ? calendarYear - 3760 : yearNum;
  const fcEvents = greg1 <= 1752 ? [] : makeFullCalendarEvents(options);
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
    DoWtiny,
    q,
    fcEvents,
    options,
  });
}

function makeFullCalendarEvents(options) {
  const fcOptions = Object.assign({addHebrewDatesForEvents: true}, options);
  const events2 = HebrewCalendar.calendar(fcOptions);
  const il = options.il;
  const fcEvents = events2.map((ev) => {
    const fc = eventToFullCalendar(ev, null, il);
    const emoji = ev.getEmoji();
    if (emoji) {
      fc.title += '\u00a0' + emoji;
    }
    fc.url = ev.url();
    return fc;
  });
  const hebcalPrefix = 'https://www.hebcal.com/';
  for (const fce of fcEvents) {
    delete fce.description; // not showing tooltips just yet
    delete fce.hebrew; // not showing tooltips just yet
    delete fce.allDay; // not needed
    if (typeof fce.url === 'string' && fce.url.startsWith(hebcalPrefix)) {
      fce.url = fce.url.substring(hebcalPrefix.length - 1);
      const utm = fce.url.indexOf('utm_source=');
      if (utm !== -1) {
        fce.url = fce.url.substring(0, utm - 1);
      }
    }
  }
  return fcEvents;
}

function makeQueryAndDownloadProps(ctx, options) {
  const q = Object.assign({v: '1', ny: 5}, ctx.request.query);
  for (const k of ['maj', 'min', 'nx', 'mod', 'mf', 'ss']) {
    q[k] = 'on';
  }
  q.i = ctx.state.il ? 'on' : 'off';
  const year = options.year;
  q.year = String(year);
  const isHebYr = options.isHebrewYear;
  q.yt = isHebYr ? 'H' : 'G';
  makeDownloadProps(ctx, q, options);
  ctx.state.downloadAltTitle = `${year} only`;
  ctx.state.numYears = getNumYears(options);
  const today = isHebYr ? new HDate() : new Date();
  ctx.state.currentYear = today.getFullYear();
  delete ctx.state.filename.pdf;
  return q;
}

function makeItems(events, il, showYear) {
  const items = {};
  for (const key of Object.keys(categories)) {
    items[key] = [];
  }
  for (const ev of events) {
    const eventCategories = getEventCategories(ev);
    const category = eventCategories.length === 1 ? eventCategories[0] : eventCategories[1];
    const item = eventToHolidayItem(ev, il);
    item.dates = tableCellObserved(item, il, showYear);
    item.descrShort = getHolidayDescription(ev, true);
    items[category].push(item);
  }
  return items;
}

/**
 * @param {any} item
 * @param {boolean} il
 * @param {boolean} isHebrewYear
 * @return {string}
 */
function tableCellObserved(item, il, isHebrewYear) {
  const f = item.name;
  const mask = item.mask;
  const dur = item.duration;
  const d = item.d;
  const b0 = '<strong>';
  const b1 = '</strong>';
  if (f === 'Chanukah') {
    return formatDatePlusDelta(d, dur, isHebrewYear) + shortDayOfWeek(d, dur);
  } else if (f === 'Leil Selichot' || mask & flags.MINOR_FAST) {
    return formatSingleDay(d, isHebrewYear) + shortDayOfWeek(d, 0);
  } else if (f === 'Purim' || f === 'Tish\'a B\'Av' || !(mask & flags.CHAG)) {
    return formatDatePlusDelta(d, dur, isHebrewYear) + shortDayOfWeek(d, dur);
  } else {
    const yomTovDays = il ? 1 : 2;
    switch (f) {
      case 'Shavuot':
      case 'Rosh Hashana':
      case 'Yom Kippur':
      case 'Shmini Atzeret':
      case 'Simchat Torah':
        return b0 + formatDatePlusDelta(d, dur, isHebrewYear) + b1 + shortDayOfWeek(d, dur);
      case 'Sukkot':
        const d2 = d.add(il ? 2 : 3, 'd');
        const sukkotChmDays = il ? 5 : 4;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        '<br>' + formatDatePlusDelta(d2, sukkotChmDays, isHebrewYear) + shortDayOfWeek(d2, sukkotChmDays);
      case 'Pesach':
        const d3 = d.add(il ? 2 : 3, 'd');
        const d6 = d.add(6, 'd');
        const pesachChmDays = il ? 4 : 3;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        '<br>' + formatDatePlusDelta(d3, pesachChmDays, isHebrewYear) + shortDayOfWeek(d3, pesachChmDays) +
        '<br>' + b0 + formatDatePlusDelta(d6, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d6, yomTovDays);
    }
  }
}

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
  const iso = d.format('YYYY-MM-DD');
  const dayStr = formatSingleDay(d, showYear);
  return `<time datetime="${iso}">${dayStr}</time>`;
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
    const items0 = makeItems(events, il, false);
    for (const [catId, items1] of Object.entries(items0)) {
      for (const item of items1) {
        if (!Array.isArray(items[catId][item.name])) {
          items[catId][item.name] = Array(NUM_YEARS);
        }
        items[catId][item.name][i] = item;
      }
    }
  }
  const q = makeQueryAndDownloadProps(ctx, {
    year: hyear,
    isHebrewYear: true,
    il,
    numYears: 5,
  });
  await ctx.render('holiday-main-index', {
    RH: dayjs(tishrei1.greg()),
    today: dayjs(dt),
    hyear,
    categories,
    items,
    il,
    q,
  });
}

export async function holidaysApp(ctx) {
  ctx.lastModified = ctx.launchDate;
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
