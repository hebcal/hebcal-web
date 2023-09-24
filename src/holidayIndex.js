/* eslint-disable require-jsdoc */
import {flags, HDate, months, HebrewCalendar, Event} from '@hebcal/core';
import {getHolidayDescription, eventToFullCalendar} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import createError from 'http-errors';
import {basename} from 'path';
import {getDefaultHebrewYear, getNumYears, shortenUrl} from './common';
import {makeDownloadProps} from './makeDownloadProps';
import {categories, getFirstOcccurences, eventToHolidayItem, makeEventJsonLD, OMER_TITLE} from './holidayCommon';
import {holidayDetail} from './holidayDetail';
import {holidayPdf} from './holidayPdf';
import {getHolidayMeta} from './getHolidayMeta';

dayjs.extend(isSameOrAfter);

const DoWtiny = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

export async function holidayYearIndex(ctx) {
  const rpath = ctx.request.path;
  const year = basename(rpath);
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum) || yearNum < 1 || yearNum > 9999) {
    throw createError(400, `Sorry, can't display holidays for year ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const il = ctx.state.il;
  const options = {
    year: calendarYear,
    isHebrewYear,
    il,
  };
  let events0 = HebrewCalendar.calendar(options);
  if (!il) {
    const eventsIlModern = HebrewCalendar.calendar({
      il: true,
      year: calendarYear,
      isHebrewYear,
    }).filter((ev) => ev.getFlags() === (flags.IL_ONLY | flags.MODERN_HOLIDAY));
    events0 = eventsIlModern.concat(events0);
  }
  const events = getFirstOcccurences(events0);
  const items = await makeItems(events, il, isHebrewYear, true);
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
    amp: (q.amp === '1') ? true : undefined,
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
    const url = shortenUrl(ev.url());
    if (url) {
      fc.url = url;
    }
    delete fc.description; // not showing tooltips just yet
    delete fc.hebrew; // not showing tooltips just yet
    delete fc.allDay; // not needed
    return fc;
  });
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

async function makeItems(events, il, showYear, addIsraelAsterisk) {
  const items = {};
  for (const key of Object.keys(categories)) {
    items[key] = [];
  }
  const today = dayjs();
  for (const ev of events) {
    const item = eventToHolidayItem(ev, il);
    const category = item.categories.length === 1 ? item.categories[0] : item.categories[1];
    item.dates = tableCellObserved(item, il, showYear, addIsraelAsterisk);
    item.descrShort = getHolidayDescription(ev, true);
    const descrMedium = getHolidayDescription(ev, false);
    const sentences = descrMedium.split(/\.\s+/).slice(0, 2);
    const firstTwo = sentences.join('. ');
    item.descrMedium = sentences.length == 2 ? firstTwo + '.' : firstTwo;
    const meta = item.meta = await getHolidayMeta(item.name);
    items[category].push(item);
    if (today.isBefore(item.d) && ev.url()) {
      item.jsonLD = makeEventJsonLD(ev, meta, il);
    }
  }
  // insert Days of the Omer
  const hyear = events[0].getDate().getFullYear();
  const omer = makeOmerItem(hyear, il, showYear);
  const minorHolidayIdx = items['minor'].findIndex((item) => item.name === 'Pesach Sheni');
  items['minor'].splice(minorHolidayIdx, 0, omer);
  return items;
}

function makeOmerItem(hyear, il, showYear) {
  const omerEv = new Event(new HDate(16, months.NISAN, hyear),
      OMER_TITLE, flags.OMER_COUNT, {emoji: '㊾'});
  const omer = eventToHolidayItem(omerEv, il);
  omer.href = `/omer/${hyear}`;
  omer.dates = tableCellObserved(omer, il, showYear, false);
  omer.descrShort = getHolidayDescription(omerEv, true);
  omer.descrMedium = getHolidayDescription(omerEv, false);
  return omer;
}

/**
 * @param {any} item
 * @param {boolean} il
 * @param {boolean} isHebrewYear
 * @param {boolean} addIsraelAsterisk
 * @return {string}
 */
function tableCellObserved(item, il, isHebrewYear, addIsraelAsterisk) {
  const f = item.name;
  const mask = item.mask;
  const dur = item.duration;
  const d = item.d;
  const b0 = '<strong>';
  const b1 = '</strong>';
  if (dur === 0) {
    return formatSingleDay(d, isHebrewYear) + shortDayOfWeek(d, 0);
  } else if (!(mask & flags.CHAG)) {
    return formatDatePlusDelta(d, dur, isHebrewYear) + shortDayOfWeek(d, dur);
  } else if (f === 'Rosh Hashana' || f === 'Yom Kippur' || f === 'Simchat Torah') {
    return b0 + formatDatePlusDelta(d, dur, isHebrewYear) + b1 + shortDayOfWeek(d, dur);
  } else {
    const yomTovDays = il ? 1 : 2;
    const asterisk = il && addIsraelAsterisk ? ' <span class="text-success">*</span>' : '';
    switch (f) {
      case 'Shmini Atzeret':
      case 'Shavuot':
        return b0 + formatDatePlusDelta(d, dur, isHebrewYear) + b1 + shortDayOfWeek(d, dur) + asterisk;
      case 'Sukkot':
        const d2 = d.add(il ? 2 : 3, 'd');
        const sukkotChmDays = il ? 5 : 4;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        asterisk +
        '<br>' + formatDatePlusDelta(d2, sukkotChmDays, isHebrewYear) + shortDayOfWeek(d2, sukkotChmDays);
      case 'Pesach':
        const d3 = d.add(il ? 2 : 3, 'd');
        const d6 = d.add(6, 'd');
        const pesachChmDays = il ? 4 : 3;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        asterisk +
        '<br>' + formatDatePlusDelta(d3, pesachChmDays, isHebrewYear) + shortDayOfWeek(d3, pesachChmDays) +
        '<br>' + b0 + formatDatePlusDelta(d6, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d6, yomTovDays);
      default:
        throw createError(500, `Unknown holiday: ${f}`);
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
  return ` <small class="text-body-secondary">${s}</small>`;
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
    let events0 = HebrewCalendar.calendar({
      year: hyear + i - 1,
      isHebrewYear: true,
      il,
    });
    if (!il) {
      const eventsIlModern = HebrewCalendar.calendar({
        il: true,
        year: hyear + i - 1,
        isHebrewYear: true,
      }).filter((ev) => ev.getFlags() === (flags.IL_ONLY | flags.MODERN_HOLIDAY));
      events0 = eventsIlModern.concat(events0);
    }
    const events = getFirstOcccurences(events0);
    const items0 = await makeItems(events, il, false, false);
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
    amp: (q.amp === '1') ? true : undefined,
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
