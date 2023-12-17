/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, flags} from '@hebcal/core';
import {getLeyningKeyForEvent} from '@hebcal/leyning';
import {Triennial} from '@hebcal/triennial';
import dayjs from 'dayjs';
import {basename} from 'path';
import {localeMap, shortenUrl, lgToLocale} from './common';
import {downloadHref2} from './makeDownloadProps';
import createError from 'http-errors';

export async function parshaYear(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const todayHebYear = new HDate().getFullYear();
  const hyear = parseInt(base, 10) || todayHebYear;
  if (hyear < 2 || hyear > 32000) {
    throw createError(400, 'Hebrew year must be in range 2-32000');
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  const lang = lgToLocale[q.lg || 's'] || q.lg;
  const events = HebrewCalendar.calendar({
    sedrot: true,
    year: hyear,
    isHebrewYear: true,
    il,
    noHolidays: true,
  });
  const locale = localeMap[lang] || 'en';
  const items = [];
  for (const ev of events) {
    const item = makeItem(ev, locale, il, lang);
    items.push(item);
  }
  const dlfilename = `hebcal_${hyear}h.ics`;
  const q0 = {
    v: '1',
    s: 'on',
    i: il ? 'on' : 'off',
    year: String(hyear),
    yt: 'H',
    ny: 1,
  };
  const dlhref = downloadHref2(q0, dlfilename);
  await ctx.render('parsha-year', {
    hyear,
    il,
    items,
    todayHebYear,
    dlfilename,
    dlhref,
    triCycleStartYear: hyear >= 5744 ? Triennial.getCycleStartYear(hyear) : null,
    lang,
    locale,
  });
}

function makeItem(ev, locale, il, lang) {
  const hd = ev.getDate();
  const d = dayjs(hd.greg()).locale(locale);
  const title0 = ev.render('en');
  const title = title0.substring(title0.indexOf(' ') + 1);
  const hebrew0 = ev.render('he');
  const hebrew = hebrew0.substring(hebrew0.indexOf(' ') + 1);
  const holidays0 = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  const holidays = holidays0.map((ev) => {
    const mask = ev.getFlags();
    const item = {
      title: ev.render(lang),
    };
    const url = ev.url();
    if (url) {
      item.url = shortenUrl(url);
    }
    if (mask & flags.ROSH_CHODESH) {
      return item;
    } else if (mask & flags.SHABBAT_MEVARCHIM) {
      item.title = item.title.substring(item.title.indexOf(' ') + 1);
      return item;
    }
    const key = getLeyningKeyForEvent(ev, il);
    if (key) {
      item.title = key;
    }
    return item;
  });
  const item = {
    event: ev,
    title,
    hebrew,
    d,
    hd,
    url: shortenUrl(ev.url()),
    holidays,
  };
  return item;
}
