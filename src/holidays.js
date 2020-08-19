/* eslint-disable require-jsdoc */
import {HDate, HolidayEvent, Locale, HebrewCalendar, flags, greg} from '@hebcal/core';
import {makeAnchor, getHolidayDescription} from '@hebcal/rest-api';
// import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import holidayMeta from './holidays.json';
import dayjs from 'dayjs';

const today = new HDate();

const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

const holidayBegin = getFirstOcccurences();

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
  const category = categories[meta.category] || {};
  const mask = category.flags || 0;
  const ev = new HolidayEvent(today, holiday, mask);
  const descrShort = getHolidayDescription(ev, true);
  const wikipediaText = meta.wikipedia && meta.wikipedia.text;
  const descrMedium = getHolidayDescription(ev, false);
  const descrLong = wikipediaText || descrMedium;
  const hebrew = Locale.gettext(holiday, 'he');
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
  await ctx.render('holiday-detail', {
    title: `${holiday} - ${descrShort} - ${hebrew} | Hebcal Jewish Calendar`,
    holiday,
    hebrew,
    descrShort,
    descrMedium,
    descrLong,
    categoryId: category.id,
    categoryName: category.name,
    next_observed_meta: nextObserved,
    next_observed_para: `<p>${holiday} ${nextObserved}.<p>`,
    occursOn,
    wikipedia: meta.wikipedia,
    readMore: {
      name: sourceName(meta.about.href),
      href: meta.about.href,
    },
  });
}

function getFirstOcccurences() {
  const events = HebrewCalendar.calendar({
    year: today.getFullYear() - 1,
    isHebrewYear: true,
    numYears: 11,
  });
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
