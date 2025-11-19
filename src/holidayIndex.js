import {flags, HDate, months, HebrewCalendar, Event} from '@hebcal/core';
import {getHolidayDescription} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {getDefaultHebrewYear} from './dateUtil.js';
import {httpRedirect, makeETag, yearIsOutsideHebRange} from './common.js';
import {categories, getFirstOcccurences, eventToHolidayItem, makeEventJsonLD,
  OMER_TITLE, makeQueryAndDownloadProps} from './holidayCommon.js';
import {getHolidayMeta} from './getHolidayMeta.js';

const DoWtiny = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

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
      case 'Sukkot': {
        const d2 = d.add(il ? 2 : 3, 'd');
        const sukkotChmDays = il ? 5 : 4;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        asterisk +
        '<br>' + formatDatePlusDelta(d2, sukkotChmDays, isHebrewYear) + shortDayOfWeek(d2, sukkotChmDays);
      }
      case 'Pesach': {
        const d3 = d.add(il ? 2 : 3, 'd');
        const d6 = d.add(6, 'd');
        const pesachChmDays = il ? 4 : 3;
        return b0 + formatDatePlusDelta(d, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d, yomTovDays) +
        asterisk +
        '<br>' + formatDatePlusDelta(d3, pesachChmDays, isHebrewYear) + shortDayOfWeek(d3, pesachChmDays) +
        '<br>' + b0 + formatDatePlusDelta(d6, yomTovDays, isHebrewYear) + b1 + shortDayOfWeek(d6, yomTovDays);
      }
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
  const hyear0 = parseInt(ctx.request.query?.year, 10);
  const hyear = hyear0 || getDefaultHebrewYear(new HDate(dt));
  if (yearIsOutsideHebRange(hyear)) {
    return httpRedirect(ctx, `/holidays/?redir=year`);
  }
  ctx.response.etag = makeETag(ctx, ctx.request.query, {hyear});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
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
  const canonical = new URL('https://www.hebcal.com/holidays/');
  const inverse = new URL(canonical);
  const yearOverride = Boolean(hyear0);
  if (il) {
    canonical.searchParams.set('i', 'on');
  } else {
    inverse.searchParams.set('i', 'on');
  }
  if (yearOverride) {
    canonical.searchParams.set('year', hyear0);
    inverse.searchParams.set('year', hyear0);
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
    yearOverride,
    canonical,
    inverse,
  });
}
