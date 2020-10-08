/* eslint-disable require-jsdoc */
import {HDate, Locale, HebrewCalendar, flags, greg, HolidayEvent, months} from '@hebcal/core';
import {makeAnchor, getHolidayDescription, getEventCategories, getCalendarTitle} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import holidayMeta from './holidays.json';
import dayjs from 'dayjs';
import etag from 'etag';
import {createPdfDoc, renderPdf} from './pdf';
import {getDefaultHebrewYear, addSefariaLinksToLeyning, httpRedirect} from './common';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

dayjs.extend(isSameOrAfter);

const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

const events11years = HebrewCalendar.calendar({
  year: new HDate().getFullYear() - 1,
  isHebrewYear: true,
  numYears: 11,
});
const events11yearsBegin = getFirstOcccurences(events11years);

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
  const year = basename(base.substring(7));
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    throw createError(400, `Invalid holiday year: ${year}`);
  }
  const isHebrewYear = yearNum >= 3761 || year.indexOf('-') !== -1;
  const calendarYear = isHebrewYear ? (yearNum >= 3761 ? yearNum : yearNum + 3761): yearNum;
  const options = {
    year: calendarYear,
    addHebrewDates: true,
    isHebrewYear,
    il: ctx.state.il,
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

const holidayYearRe = /^([a-z-]+)-(\d{4})$/;

export async function holidayDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const matches = base.match(holidayYearRe);
  const year = matches && +matches[2];
  const holiday = matches === null ? holidays.get(base) : holidays.get(matches[1]);
  if (typeof holiday !== 'string') {
    throw createError(404, `Holiday not found: ${base}`);
  }
  const holidayAnchor = makeAnchor(holiday);
  const il = ctx.state.il;
  const meta = getHolidayMeta(holiday, year, il);
  const holidayBegin = holiday === OMER_TITLE ? makeOmerEvents(year) :
    year ? getFirstOcccurences(HebrewCalendar.calendar({
      year: year - 3,
      isHebrewYear: false,
      numYears: 10,
    })) : events11yearsBegin;
  const category = categories[meta.category] || {};
  const mask = category.flags || 0;
  const now = new Date();
  const occursOn = makeOccursOn(holidayBegin, holiday, mask, now, il);
  const next = year ? occursOn.find((item) => item.d.year() === year) :
    occursOn.find((item) => item.ppf === 'future');
  if (typeof next === 'undefined' && year) {
    httpRedirect(ctx, `/holidays/${holidayAnchor}`);
    return;
  }
  next.ppf = 'current';
  makeHolidayReadings(meta, holiday, year, il, next);
  const isPast = year ? !next.d.isSameOrAfter(dayjs(now), 'd') : false;
  const [nextObserved, nextObservedHtml] = makeNextObserved(next, isPast, il);
  const descrShort = getHolidayDescription(next.event, true);
  const descrMedium = getHolidayDescription(next.event, false);
  const wikipediaText = meta.wikipedia && meta.wikipedia.text;
  const descrLong = wikipediaText || descrMedium;
  const hebrewRe = /([\u0590-\u05FF][\s\u0590-\u05FF]+[\u0590-\u05FF])/g;
  const hebrew = Locale.gettext(holiday, 'he');
  const titleHebrew = Locale.hebrewStripNikkud(hebrew);
  const titleYear = year ? ' ' + year : '';
  const title = `${holiday}${titleYear} - ${descrShort} - ${titleHebrew} | Hebcal Jewish Calendar`;
  const noindex = Boolean(year && (year <= 1752 || year > now.getFullYear() + 100));
  await ctx.render('holiday-detail', {
    title,
    year,
    holiday,
    holidayAnchor,
    hebrew,
    descrShort,
    descrMedium,
    descrLong: descrLong.replace(hebrewRe, `<span lang="he" dir="rtl">$&</span>`),
    categoryId: category.id,
    categoryName: category.name,
    nextObserved,
    nextObservedHtml,
    upcomingHebrewYear: next.hd.getFullYear(),
    occursOn,
    meta,
    noindex,
    jsonLD: noindex ? '{}' : JSON.stringify(getJsonLD(next, descrMedium)),
    il,
  });
}

function getHolidayMeta(holiday, year, il) {
  const meta0 = holidayMeta[holiday];
  if (typeof meta0 === 'undefined' || typeof meta0.about.href === 'undefined') {
    throw createError(500, `Internal error; broken configuration for: ${holiday}`);
  }
  const meta = Object.assign({}, meta0);
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
  return meta;
}

function makeHolidayReadings(meta, holiday, year, il, next) {
  meta.reading = meta.reading || {};
  if (year) {
    const events = HebrewCalendar.calendar({
      year: next.event.getDate().getFullYear(),
      isHebrewYear: true,
      il,
    }).filter((ev) => holiday === ev.basename());
    meta.items = [];
    for (const ev of events) {
      const reading = getReadingForHoliday(ev, il);
      if (typeof reading !== 'undefined') {
        const key = leyning.getLeyningKeyForEvent(ev, il) || ev.getDesc();
        meta.items.push(key);
        makeHolidayReading(holiday, key, meta, reading);
        const hd = reading.hd = ev.getDate();
        reading.d = dayjs(hd.greg());
      }
    }
    if (meta.items.length === 0) {
      delete meta.items;
    }
  } else {
    if (typeof meta.items === 'undefined' && leyning.holidayReadings[holiday]) {
      meta.items = [holiday];
    }
    if (Array.isArray(meta.items)) {
      for (const item of meta.items) {
        const reading = leyning.getLeyningForHolidayKey(item);
        if (typeof reading !== 'undefined') {
          makeHolidayReading(holiday, item, meta, reading);
        }
      }
    }
  }
}

function getReadingForHoliday(ev, il) {
  const hd = ev.getDate();
  const dow = hd.abs() % 7;
  const desc = ev.getDesc();
  if (desc.startsWith('Shabbat ') || (desc.startsWith('Chanukah') && dow === 6)) {
    const parshaEv = HebrewCalendar.calendar({start: hd, end: hd,
      il, noHolidays: true, sedrot: true});
    if (parshaEv.length > 0) {
      return leyning.getLeyningForParshaHaShavua(parshaEv[0], il);
    }
  }
  return leyning.getLeyningForHoliday(ev, il);
}

// Don't include any 1-day duration holidays (it's the default)
const holidayDurationIL = {
  'Rosh Hashana': 2,
  'Chanukah': 8,
  'Sukkot': 7,
  'Pesach': 7,
};

const holidayDurationDiaspora = Object.assign({'Shavuot': 2}, holidayDurationIL);
holidayDurationDiaspora['Pesach'] = 8;

const OMER_TITLE = 'Days of the Omer';
holidayDurationDiaspora[OMER_TITLE] = holidayDurationIL[OMER_TITLE] = 49;

function makeOmerEvents(year) {
  const events = [];
  const hy = year ? year + 3757 : new HDate().getFullYear() - 1;
  for (let i = 0; i < 11; i++) {
    const hd = new HDate(16, months.NISAN, hy + i);
    events.push(new HolidayEvent(hd, OMER_TITLE, flags.OMER_COUNT));
  }
  return events;
}

/**
 * @param {any} item
 * @param {boolean} isPast
 * @param {boolean} il
 * @return {string[]}
 */
function makeNextObserved(item, isPast, il) {
  const verb = isPast ? (item.duration ? 'began' : 'ocurred') : (item.duration ? 'begins' : 'ocurrs');
  const dateStrShort = item.d.format('D-MMM-YYYY');
  const beginsWhen = isPast ? '' : ` ${item.beginsWhen}`;
  let nextObserved = `${verb}${beginsWhen} on ${dateStrShort}`;
  const iso = item.d.format('YYYY-MM-DD');
  const dateStrLong = item.d.format('dddd, D MMMM YYYY');
  // eslint-disable-next-line max-len
  let nextObservedHtml = `${verb}${beginsWhen} on <strong class="text-burgundy"><time datetime="${iso}">${dateStrLong}</time></strong>`;
  if (item.basename === 'Shavuot' || item.basename === 'Pesach') {
    const suffix = il ? ' in Israel' : ' in the Diaspora';
    nextObserved += suffix;
    nextObservedHtml += suffix;
  }
  if (!item.duration) {
    return [nextObserved, nextObservedHtml];
  }
  const endVerb = isPast ? 'ended' : 'ends';
  const endWhen = isPast ? '' : ' at nightfall';
  const endObservedPrefix = ` and ${endVerb}${endWhen} on `;
  const end = item.endD;
  const endIso = end.format('YYYY-MM-DD');
  const endObserved = endObservedPrefix + end.format('D-MMM-YYYY');
  const endObservedHtml = endObservedPrefix + `<strong class="text-burgundy"><time datetime="${endIso}">` +
    end.format('dddd, D MMMM YYYY') + '</time></strong>';
  return [nextObserved + endObserved, nextObservedHtml + endObservedHtml];
}

/**
 * @param {Event[]} events
 * @param {string} holiday
 * @param {number} mask
 * @param {Date} now
 * @param {boolean} il
 * @return {any[]}
 */
function makeOccursOn(events, holiday, mask, now, il) {
  const beginsWhen = holiday === 'Leil Selichot' ? 'after nightfall' :
    mask === flags.MINOR_FAST ? 'at dawn' : 'at sundown';
  const nowAbs = greg.greg2abs(now);
  const holidayDuration = il ? holidayDurationIL : holidayDurationDiaspora;
  const duration0 = (mask === flags.MINOR_FAST || holiday === 'Leil Selichot') ? 0 :
    (holidayDuration[holiday] || 1);
  const occursOn = events
      .filter((ev) => holiday === ev.basename())
      .map((ev) => {
        const hd = ev.getDate();
        const d0 = dayjs(hd.greg());
        const d = beginsWhen === 'at sundown' ? d0.subtract(1, 'd') : d0;
        const duration = mask === flags.ROSH_CHODESH && hd.getDate() === 30 ? 2 : duration0;
        const endAbs = duration ? hd.abs() + duration - 1 : hd.abs();
        return {
          id: makeAnchor(holiday),
          hd,
          beginsWhen,
          d,
          duration,
          endD: d.add(duration, 'd'),
          hdRange: hebrewDateRange(hd, duration),
          desc: ev.render(),
          basename: ev.basename(),
          ppf: endAbs < nowAbs ? 'past' : 'future',
          event: ev,
        };
      });
  return occursOn;
}

function hebrewDateRange(hd, duration) {
  if (duration <= 1) {
    return hd.toString();
  }
  const end = new HDate(hd.abs() + duration - 1);
  const startMonth = hd.getMonthName();
  const startMday = hd.getDate();
  const endMonth = end.getMonthName();
  if (startMonth === endMonth) {
    return `${startMday}-${end.getDate()} ${startMonth} ${hd.getFullYear()}`;
  }
  return `${startMday} ${startMonth} - ${end.toString()}`;
}

function makeHolidayReading(holiday, item, meta, reading) {
  if (reading.fullkriyah) {
    addSefariaLinksToLeyning(reading.fullkriyah, true);
  }
  const itemReading = meta.reading[item] = reading;
  const hebrew = Locale.lookupTranslation(item, 'he');
  if (typeof hebrew === 'string') {
    itemReading.hebrew = hebrew;
  }
  itemReading.id = makeAnchor(item);
  if (meta.links && meta.links.torah && meta.links.torah[item]) {
    itemReading.torahHref = meta.links.torah[item];
  } else if (meta.about.torah) {
    itemReading.torahHref = meta.about.torah;
  }
  if (meta.links && meta.links.haftara && meta.links.haftara[item]) {
    itemReading.haftaraHref = meta.links.haftara[item];
  } else if (meta.about.haftara) {
    itemReading.haftaraHref = meta.about.haftara;
  }
  if (item.startsWith(holiday)) {
    if (meta.items.length === 1 || item === holiday) {
      itemReading.shortName = 'Tanakh';
    } else if (item.startsWith(holiday) && item.indexOf('Chol ha-Moed') !== -1) {
      itemReading.shortName = item.substring(holiday.length + 1);
    } else if (item.startsWith(`${holiday} (`)) {
      itemReading.shortName = item.substring(holiday.length + 2, item.length - 1);
    } else {
      itemReading.shortName = 'Day ' + item.substring(holiday.length + 1);
    }
  } else {
    itemReading.shortName = item;
  }
}

/**
 * @param {Event[]} events
 * @return {Event[]}
 */
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

function getJsonLD(item, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': item.basename,
    'startDate': item.d.format('YYYY-MM-DD'),
    'endDate': item.endD.format('YYYY-MM-DD'),
    'description': description,
    'eventAttendanceMode': 'https://schema.org/MixedEventAttendanceMode',
    'eventStatus': 'https://schema.org/EventScheduled',
    'location': {
      '@type': 'VirtualLocation',
      'url': item.event.url(),
    },
  };
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
