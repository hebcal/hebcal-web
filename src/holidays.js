/* eslint-disable require-jsdoc */
import {HDate, HolidayEvent, Locale} from '@hebcal/core';
import {holidayDescription, makeAnchor, getHolidayDescription, getEventCategories} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';

const holidays = new Map();
for (const key of Object.keys(holidayDescription)) {
  holidays.set(makeAnchor(key), key);
}

const categoryName = {
  major: 'major-holidays',
  minor: 'minor-holidays',
  fast: 'minor-fasts',
  modern: 'modern-holidays',
  shabbat: 'special-shabbatot',
  roshchodes: 'rosh-chodesh',
};

const dummyDate = new HDate();

export async function holidayDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const holiday = holidays.get(base);
  if (typeof holiday !== 'string') {
    throw createError(404, `Sorry, can't find holiday: ${base}`);
  }
  const ev = new HolidayEvent(dummyDate, holiday, 0);
  const descrShort = getHolidayDescription(ev);
  const hebrew = Locale.gettext(holiday, 'he');
  const categories = getEventCategories(ev);
  await ctx.render('holiday-detail', {
    title: `${holiday} - ${descrShort} - ${hebrew} | Hebcal Jewish Calendar`,
    holiday,
    hebrew,
    descrShort,
    category: categoryName[categories[1]],
    descrLong: holidayDescription[holiday],
    next_observed_meta: '',
    next_observed_para: '',
  });
}
