/* eslint-disable require-jsdoc */
import {HDate, HolidayEvent, Locale, flags} from '@hebcal/core';
import {makeAnchor, getHolidayDescription} from '@hebcal/rest-api';
// import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import holidayMeta from './holidays.json';

const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

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

const dummyDate = new HDate();

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
  const mask = category.flag || 0;
  const ev = new HolidayEvent(dummyDate, holiday, mask);
  const descrShort = getHolidayDescription(ev, true);
  const wikipediaText = meta.wikipedia && meta.wikipedia.text;
  const descrLong = wikipediaText || getHolidayDescription(ev, false);
  const hebrew = Locale.gettext(holiday, 'he');
  await ctx.render('holiday-detail', {
    title: `${holiday} - ${descrShort} - ${hebrew} | Hebcal Jewish Calendar`,
    holiday,
    hebrew,
    descrShort,
    descrLong,
    categoryId: category.id,
    categoryName: category.name,
    next_observed_meta: '',
    next_observed_para: '',
    wikipedia: meta.wikipedia,
    readMore: {
      name: sourceName(meta.about.href),
      href: meta.about.href,
    },
  });
}

function sourceName(href) {
  const slashslash = href.indexOf('//');
  const endSlash = href.indexOf('/', slashslash + 2);
  const domain0 = href.substring(slashslash + 2, endSlash);
  const domain = domain0.startsWith('www.') ? domain0.substring(4) : domain0;
  return primarySource[domain] || domain;
}
