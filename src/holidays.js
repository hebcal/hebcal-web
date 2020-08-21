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
    throw createError(400, `Bad PDF URL format`);
  }
  const year = base.substring(7, 11);
  const options = {
    year,
    addHebrewDates: true,
  };
  if (year >= 3761) {
    options.isHebrewYear = true;
  }
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
  const events0 = HebrewCalendar.calendar({year});
  const events = getFirstOcccurences(events0);
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
    const beginsWhen = holiday === 'Leil Selichot' ? 'after nightfall' :
      ev.getFlags() === flags.MINOR_FAST ? 'at dawn' : 'at sundown';
    const item = {
      name: holiday,
      id: makeAnchor(holiday),
      descrShort,
      beginsWhen,
      beginsD: beginsWhen === 'at sundown' ? d.subtract(1, 'd') : d,
      d,
      isoDate: d.format('YYYY-MM-DD'),
    };
    items[category].push(item);
  }
  ctx.set('Last-Modified', new Date().toUTCString());
  await ctx.render('holiday-year-index', {
    title: `Jewish Holidays ${year} | Hebcal Jewish Calendar`,
    year,
    categories,
    items,
  });
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
