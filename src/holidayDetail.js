/* eslint-disable require-jsdoc */
import {flags, greg, HDate, HebrewCalendar, Locale, months, HolidayEvent} from '@hebcal/core';
import * as leyning from '@hebcal/leyning';
import {addLinksToLeyning} from './parshaCommon';
import {getHolidayDescription, makeAnchor} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import {empty, httpRedirect, wrapHebrewInSpans, getHaftarahHref, langNames} from './common';
import {categories, holidays, events11yearsBegin, getFirstOcccurences, eventToHolidayItem} from './holidayCommon';
import holidayMeta from './holidays.json';
import {distance, closest} from 'fastest-levenshtein';

const OMER_TITLE = 'Days of the Omer';

const holidayYearRe = /^([a-z-]+)-(\d+)$/;

/**
 * @param {Event[]} events
 * @param {string} holiday
 * @param {boolean} il
 * @return {any[]}
 */
function makeOccursOn(events, holiday, il) {
  const nowAbs = greg.greg2abs(new Date());
  const occursOn = events
      .filter((ev) => holiday === ev.basename())
      .map((ev) => eventToHolidayItem(ev, il));
  for (const item of occursOn) {
    item.ppf = item.endAbs < nowAbs ? 'past' : 'future';
  }
  return occursOn;
}

const allHolidays = Array.from(holidays.keys());

export async function holidayDetail(ctx) {
  const rpath = ctx.request.path;
  const base0 = basename(rpath);
  const base = base0.toLowerCase();
  const matches = base.match(holidayYearRe);
  const dateSuffix = matches && matches[2];
  const year = dateSuffix ? (dateSuffix.length === 8 ? +dateSuffix.substring(0, 4) : +dateSuffix) : null;
  const base1 = matches === null ? base : matches[1];
  const holiday = holidays.get(base1);
  if (typeof holiday !== 'string') {
    const candidate = closest(base1, allHolidays);
    const editDist = distance(base1, candidate);
    if (editDist < 2) {
      httpRedirect(ctx, `/holidays/${candidate}?redir=spelling`);
      return;
    }
    throw createError(404, `Holiday not found: ${base}`);
  }
  const holidayAnchor = makeAnchor(holiday);
  if (year && (year < 100 || year > 9999)) {
    httpRedirect(ctx, `/holidays/${holidayAnchor}`);
    return;
  }
  if (base0 !== base) {
    // fix capitalization
    httpRedirect(ctx, `/holidays/${base}`);
    return;
  }
  const il = ctx.state.il;
  const q = ctx.request.query;
  if (!empty(q.gy)) {
    const year = parseInt(q.gy, 10);
    if (year >= 1000 && year <= 9999) {
      httpRedirect(ctx, `/holidays/${holidayAnchor}-${year}`);
      return;
    }
  }
  const meta = getHolidayMeta(holiday);
  const holidayBegin = holiday === OMER_TITLE ? makeOmerEvents(year) :
    year ? getFirstOcccurences(HebrewCalendar.calendar({
      year: year - 3,
      isHebrewYear: false,
      numYears: 8,
    })) : events11yearsBegin;
  const category = categories[meta.category] || {};
  const occursOn = makeOccursOn(holidayBegin, holiday, il);
  const next = dateSuffix && dateSuffix.length === 8 ?
    occursOn.find((item) => item.d.format('YYYYMMDD') === dateSuffix) :
    year ? occursOn.find((item) => item.d.year() === year) :
      occursOn.find((item) => item.ppf === 'future');
  if (typeof next === 'undefined' && year) {
    httpRedirect(ctx, `/holidays/${holidayAnchor}`);
    return;
  }
  next.ppf = 'current';
  makeHolidayReadings(meta, holiday, year, il, next);
  const [nextObserved, nextObservedHtml] = makeNextObserved(next, year, il);
  const descrShort = getHolidayDescription(next.event, true);
  const descrMedium = appendPeriod(getHolidayDescription(next.event, false));
  const wikipediaText = appendPeriod(meta.wikipedia && meta.wikipedia.text);
  const descrLong = wikipediaText || descrMedium;
  const hebrew = Locale.gettext(holiday, 'he');
  const titleHebrew = Locale.hebrewStripNikkud(hebrew);
  const titleYear = year ? ' ' + year : '';
  const title = `${holiday}${titleYear} - ${descrShort} - ${titleHebrew} | Hebcal Jewish Calendar`;
  const now = new Date();
  const noindex = Boolean(year && (year <= 1752 || year > now.getFullYear() + 100));
  const upcomingHebrewYear = next.hd.getFullYear();
  const translations0 = Object.keys(langNames)
      .map((lang) => Locale.lookupTranslation(holiday, lang))
      .filter((s) => typeof s === 'string')
      .concat(holiday);
  const translations = Array.from(new Set(translations0)).sort();
  await ctx.render('holidayDetail', {
    title,
    year,
    holiday,
    holidayAnchor,
    hebrew,
    descrShort,
    descrMedium,
    descrLong: wrapHebrewInSpans(descrLong),
    categoryId: category.id,
    categoryName: category.name,
    currentItem: next,
    nextObserved,
    nextObservedHtml,
    upcomingHebrewYear,
    occursOn,
    meta,
    noindex,
    jsonLD: noindex ? '{}' : JSON.stringify(getJsonLD(next, descrMedium)),
    il,
    chanukahItems: holiday === 'Chanukah' ? makeChanukahItems(upcomingHebrewYear) : null,
    translations,
  });
}

function appendPeriod(str) {
  if (!str) return str;
  if (str.charAt(str.length - 1) !== '.') return str + '.';
  return str;
}

/**
 * @param {any} item
 * @param {number} year
 * @param {boolean} il
 * @return {string[]}
 */
function makeNextObserved(item, year, il) {
  const now = dayjs();
  const isPast = year ? !item.d.isSameOrAfter(now, 'd') : false;
  const verb = isPast ? (item.duration ? 'began' : 'occurred') : (item.duration ? 'begins' : 'occurs');
  const dateStrShort = item.d.format('D-MMM-YYYY');
  const beginsWhen = isPast ? '' : ` ${item.beginsWhen}`;
  const where = (item.basename === 'Shavuot' || item.basename === 'Pesach') ?
    (il ? ' in 🇮🇱' : ' in the Diaspora') : '';
  const nextObserved = `${verb}${where}${beginsWhen} on ${dateStrShort}`;
  const iso = item.d.format('YYYY-MM-DD');
  const dateStrLong = item.d.format('dddd, D MMMM YYYY');
  // eslint-disable-next-line max-len
  const nextObservedHtml = `${verb}${where}${beginsWhen} on <strong class="text-burgundy"><time datetime="${iso}">${dateStrLong}</time></strong>`;
  if (!item.duration) {
    return [nextObserved, nextObservedHtml];
  }
  const end = item.endD;
  const isPast2 = year ? !end.isSameOrAfter(now, 'd') : false;
  const endVerb = isPast2 ? 'ended' : 'ends';
  const endWhen = isPast2 ? '' : ' at nightfall';
  const endObservedPrefix = ` and ${endVerb}${endWhen} on `;
  const endIso = end.format('YYYY-MM-DD');
  const endObserved = endObservedPrefix + end.format('D-MMM-YYYY');
  const endObservedHtml = endObservedPrefix + `<strong class="text-burgundy"><time datetime="${endIso}">` +
    end.format('dddd, D MMMM YYYY') + '</time></strong>';
  return [nextObserved + endObserved, nextObservedHtml + endObservedHtml];
}

function getJsonLD(item, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': item.basename + ' ' + item.d.format('YYYY'),
    'startDate': item.d.format('YYYY-MM-DD'),
    'endDate': item.endD.format('YYYY-MM-DD'),
    'description': description,
    'location': {
      '@type': 'VirtualLocation',
      'url': item.event.url(),
    },
  };
}

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
 * @param {number} hyear
 * @return {any[]}
 */
function makeChanukahItems(hyear) {
  const nowHd = new HDate();
  if (hyear < nowHd.getFullYear()) {
    return null;
  }
  const nowAbs = nowHd.abs();
  const events = HebrewCalendar.calendar({year: hyear, isHebrewYear: true, il: false});
  const items = events
      .filter((ev) => ev.basename() === 'Chanukah')
      .filter((ev) => ev.getDesc() !== 'Chanukah: 8th Day')
      .map((ev) => {
        const hd = ev.getDate();
        const d = dayjs(hd.greg());
        const dow = hd.getDay();
        const when = dow === 5 ? 'before sundown' : dow === 6 ? 'at nightfall' : 'at sundown';
        const candles = typeof ev.chanukahDay === 'number' ? ev.chanukahDay + 1 : 1;
        const abs = hd.abs();
        const ppf = abs === nowAbs ? 'current' : abs < nowAbs ? 'past' : 'future';
        return {hd, d, candles, when, ppf, desc: ev.render(), event: ev};
      });
  return items;
}

/**
 * @param {any} meta
 * @param {string} holiday
 * @param {number} year
 * @param {boolean} il
 * @param {any} next
 */
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
        makeHolidayReading(holiday, key, meta, reading, ev, il);
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
  if (Object.keys(meta.reading).length === 0) {
    delete meta.reading;
  }
}

/**
 * @param {string} holiday
 * @param {string} item
 * @param {any} meta
 * @param {leyning.Leyning} reading
 * @param {Event} ev
 * @param {boolean} il
 */
function makeHolidayReading(holiday, item, meta, reading, ev, il) {
  if (reading.fullkriyah) {
    addLinksToLeyning(reading.fullkriyah, true);
  }
  const itemReading = meta.reading[item] = reading;
  const hebrew = Locale.lookupTranslation(item, 'he');
  if (typeof hebrew === 'string') {
    itemReading.hebrew = hebrew;
  } else if (typeof ev === 'object') {
    itemReading.hebrew = ev.render('he');
  }
  itemReading.id = makeAnchor(item);
  if (meta.links && meta.links.torah && meta.links.torah[item]) {
    itemReading.torahHref = meta.links.torah[item];
  } else if (meta.about.torah) {
    itemReading.torahHref = meta.about.torah;
  } else if (itemReading.summary) {
    itemReading.torahHref = getHaftarahHref(itemReading.summary) + '&aliyot=0';
  }
  if (meta.links && meta.links.haftara && meta.links.haftara[item]) {
    itemReading.haftaraHref = meta.links.haftara[item];
  } else if (meta.about.haftara) {
    itemReading.haftaraHref = meta.about.haftara;
  } else if (itemReading.haftara) {
    itemReading.haftaraHref = getHaftarahHref(itemReading.haftara);
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
  if (ev && ev.getDate().getDay() === 6 &&
      (holiday === 'Chanukah' || ev.getFlags() & flags.SPECIAL_SHABBAT)) {
    const hd = ev.getDate();
    const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
    const parsha = sedra.lookup(hd);
    if (!parsha.chag) {
      itemReading.parsha = parsha.parsha;
    }
  }
}

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {leyning.Leyning}
 */
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

const primarySource = {
  'hebcal.com': 'Hebcal',
  'jewfaq.org': 'Judaism 101',
  'en.wikipedia.org': 'Wikipedia',
};

function sourceName(href) {
  const slashslash = href.indexOf('//');
  const endSlash = href.indexOf('/', slashslash + 2);
  const domain0 = href.substring(slashslash + 2, endSlash);
  const domain = domain0.startsWith('www.') ? domain0.substring(4) : domain0;
  return primarySource[domain] || domain;
}

function getHolidayMeta(holiday) {
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
