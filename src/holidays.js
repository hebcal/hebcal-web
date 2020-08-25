/* eslint-disable require-jsdoc */
import {HDate, HolidayEvent, Locale, HebrewCalendar, flags, greg} from '@hebcal/core';
import {makeAnchor, getHolidayDescription, getEventCategories, getCalendarTitle} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import holidayMeta from './holidays.json';
import dayjs from 'dayjs';
import etag from 'etag';
import {createPdfDoc, renderPdf} from './pdf';
import {getDefaultHebrewYear} from './common';

const today = new HDate();

const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

const events11years = HebrewCalendar.calendar({
  year: today.getFullYear() - 1,
  isHebrewYear: true,
  numYears: 11,
});
const holidayBegin = getFirstOcccurences(events11years);

const categories = {
  major: {id: 'major-holidays', name: 'Major holidays', flags: 0},
  minor: {id: 'minor-holidays', name: 'Minor holidays', flags: 0},
  fast: {id: 'minor-fasts', name: 'Minor fasts', flags: flags.MINOR_FAST},
  modern: {id: 'modern-holidays', name: 'Modern holidays', flags: flags.MODERN_HOLIDAY},
  shabbat: {id: 'special-shabbatot', name: 'Special Shabbatot', flags: flags.SPECIAL_SHABBAT},
  roshchodesh: {id: 'rosh-chodesh', name: 'Rosh Chodesh', flags: flags.ROSH_CHODESH},
};

const primarySource = {
  'hebcal.com': 'Hebcal',
  'jewfaq.org': 'Judaism 101',
  'en.wikipedia.org': 'Wikipedia',
};

export async function holidayPdf(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  if (!base.startsWith('hebcal-')) {
    throw createError(400, `Invalid PDF URL format: ${base}`);
  }
  const year = parseInt(base.substring(7), 10);
  const options = {
    year,
    addHebrewDates: true,
    isHebrewYear: year >= 3761,
  };
  const events = HebrewCalendar.calendar(options);
  const title = getCalendarTitle(events, options);
  ctx.set('Last-Modified', new Date().toUTCString());
  ctx.set('Cache-Control', 'max-age=5184000');
  ctx.response.type = 'application/pdf';
  ctx.response.etag = etag(JSON.stringify(options), {weak: true});
  const doc = ctx.body = createPdfDoc(title);
  renderPdf(doc, events, options);
  doc.end();
}

export async function holidayYearIndex(ctx) {
  const rpath = ctx.request.path;
  const year = basename(rpath);
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(400, `Invalid holiday year: ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const options = {
    year: calendarYear,
    isHebrewYear,
  };
  const events0 = HebrewCalendar.calendar(options);
  const events = getFirstOcccurences(events0);
  const items = makeItems(events, isHebrewYear);
  const roshHashana = events.find((ev) => ev.basename() === 'Rosh Hashana');
  ctx.set('Last-Modified', new Date().toUTCString());
  await ctx.render('holiday-year-index', {
    title: `Jewish Holidays ${year} | Hebcal Jewish Calendar`,
    today: dayjs(),
    year,
    isHebrewYear,
    calendarYear,
    categories,
    items,
    RH: dayjs(roshHashana.getDate().greg()),
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
  const d0str = formatSingleDay(d0, false);
  const dayStr = formatSingleDay(d, showYear);
  // eslint-disable-next-line max-len
  return `<time itemprop="startDate" content="${iso}" datetime="${iso}" title="begins at sundown on ${d0str}">${dayStr}</time>`;
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

export async function holidayDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const holiday = holidays.get(base);
  if (typeof holiday !== 'string') {
    throw createError(404, `Sorry, can't find holiday: ${base}`);
  }
  const meta = holidayMeta[holiday];
  if (typeof meta === 'undefined' || typeof meta.about.href === 'undefined') {
    throw createError(500, `Internal error; broken configuration for: ${holiday}`);
  }
  meta.about.name = sourceName(meta.about.href);
  if (meta.wikipedia && meta.wikipedia.href) {
    meta.wikipedia.title = decodeURIComponent(basename(meta.wikipedia.href)).replace(/_/g, ' ');
  }
  if (Array.isArray(meta.books)) {
    for (const book of meta.books) {
      const colon = book.text.indexOf(':');
      book.shortTitle = colon === -1 ? book.text.trim() : book.text.substring(0, colon).trim();
    }
  }
  const category = categories[meta.category] || {};
  const mask = category.flags || 0;
  const ev = new HolidayEvent(today, holiday, mask);
  const descrShort = getHolidayDescription(ev, true);
  const wikipediaText = meta.wikipedia && meta.wikipedia.text;
  const descrMedium = getHolidayDescription(ev, false);
  const descrLong = wikipediaText || descrMedium;
  const hebrew = Locale.gettext(holiday, 'he');
  if (typeof meta.items === 'undefined' && leyning.holidayReadings[holiday]) {
    meta.items = [holiday];
  }
  makeHolidayReadings(holiday, meta);
  const beginsWhen = holiday === 'Leil Selichot' ? 'after nightfall' :
      mask === flags.MINOR_FAST ? 'at dawn' : 'at sundown';
  const nowAbs = greg.greg2abs(new Date());
  const occursOn = holidayBegin
      .filter((ev) => holiday === ev.basename())
      .map((ev) => {
        const hd = ev.getDate();
        const abs = hd.abs();
        const d = dayjs(hd.greg());
        return {
          hd,
          beginsWhen,
          d: beginsWhen === 'at sundown' ? d.subtract(1, 'd') : d,
          desc: ev.render(),
          basename: ev.basename(),
          ppf: abs < nowAbs ? 'past' : 'future',
        };
      });
  const next = occursOn.find((item) => item.ppf === 'future');
  next.ppf = 'current';
  const nextObserved = `begins ${next.beginsWhen} on ` + next.d.format('ddd, D MMMM YYYY');
  ctx.set('Last-Modified', new Date().toUTCString());
  await ctx.render('holiday-detail', {
    title: `${holiday} - ${descrShort} - ${hebrew} | Hebcal Jewish Calendar`,
    holiday,
    holidayAnchor: base,
    hebrew,
    descrShort,
    descrMedium,
    descrLong,
    categoryId: category.id,
    categoryName: category.name,
    next_observed_meta: nextObserved,
    next_observed_para: `<p>${holiday} ${nextObserved}.<p>`,
    occursOn,
    meta,
  });
}

function makeHolidayReadings(holiday, meta) {
  if (!Array.isArray(meta.items)) {
    return;
  }
  meta.reading = meta.reading || {};
  for (const item of meta.items) {
    const reading = leyning.getLeyningForHolidayKey(item);
    if (typeof reading !== 'undefined') {
      if (reading.fullkriyah) {
        for (const [num, aliyah] of Object.entries(reading.fullkriyah)) {
          reading.fullkriyah[num].num = num == 'M' ? 'maf' : num;
          const begin = aliyah.b.split(':');
          const end = aliyah.e.split(':');
          const endChapVerse = begin[0] === end[0] ? end[1] : aliyah.e;
          const verses = `${aliyah.b}-${endChapVerse}`;
          reading.fullkriyah[num].verses = `${aliyah.k} ${verses}`;
          const sefariaVerses = verses.replace(/:/g, '.');
          const url = `https://www.sefaria.org/${aliyah.k}.${sefariaVerses}?lang=bi&aliyot=0`;
          reading.fullkriyah[num].href = url;
        }
      }
      meta.reading[item] = reading;
      const hebrew = Locale.lookupTranslation(item, 'he');
      if (typeof hebrew === 'string') {
        meta.reading[item].hebrew = hebrew;
      }
      meta.reading[item].id = makeAnchor(item);
      if (meta.links && meta.links.torah && meta.links.torah[item]) {
        meta.reading[item].torahHref = meta.links.torah[item];
      } else if (meta.about.torah) {
        meta.reading[item].torahHref = meta.about.torah;
      }
      if (meta.links && meta.links.haftara && meta.links.haftara[item]) {
        meta.reading[item].haftaraHref = meta.links.haftara[item];
      } else if (meta.about.haftara) {
        meta.reading[item].haftaraHref = meta.about.haftara;
      }
      if (item.startsWith(holiday)) {
        if (meta.items.length === 1 || item === holiday) {
          meta.reading[item].shortName = 'Tanakh';
        } else if (item.startsWith(holiday) && item.indexOf('Chol ha-Moed') !== -1) {
          meta.reading[item].shortName = item.substring(holiday.length + 1);
        } else if (item.startsWith(`${holiday} (`)) {
          meta.reading[item].shortName = item.substring(holiday.length + 2, item.length - 1);
        } else {
          meta.reading[item].shortName = 'Day ' + item.substring(holiday.length + 1);
        }
      } else {
        meta.reading[item].shortName = item;
      }
    }
  }
}

function getFirstOcccurences(events) {
  let prevYear = -1;
  let seen = new Set();
  const result = [];
  for (const ev of events) {
    const hd = ev.getDate();
    const hy = hd.getFullYear();
    if (hy != prevYear) {
      prevYear = hy;
      seen = new Set();
    }
    const subj = ev.getDesc();
    if (subj.startsWith('Erev ') ||
        (subj.startsWith('Chanukah: ') && subj != 'Chanukah: 2 Candles')) {
      continue;
    }
    const holiday = ev.basename();
    if (seen.has(holiday)) {
      continue;
    }
    seen.add(holiday);
    result.push(ev);
  }
  return result;
}

function sourceName(href) {
  const slashslash = href.indexOf('//');
  const endSlash = href.indexOf('/', slashslash + 2);
  const domain0 = href.substring(slashslash + 2, endSlash);
  const domain = domain0.startsWith('www.') ? domain0.substring(4) : domain0;
  return primarySource[domain] || domain;
}

const NUM_YEARS = 6;

export async function holidayMainIndex(ctx) {
  const dt = new Date();
  const hyear = getDefaultHebrewYear(new HDate(dt));
  const tishrei1 = new HDate(1, 'Tishrei', hyear);
  const items = {};
  for (const catId of Object.keys(categories)) {
    items[catId] = {};
  }
  for (let i = 0; i < NUM_YEARS; i++) {
    const events0 = HebrewCalendar.calendar({
      year: hyear + i - 1,
      isHebrewYear: true,
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
  });
}
