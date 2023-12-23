/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, flags, months, ParshaEvent} from '@hebcal/core';
import {getLeyningKeyForEvent} from '@hebcal/leyning';
import dayjs from 'dayjs';
import {basename} from 'path';
import {localeMap, shortenUrl, lgToLocale, getNumYears} from './common.js';
import {makeDownloadProps} from './makeDownloadProps.js';
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
  const locale = localeMap[lang] || 'en';
  const sedra = HebrewCalendar.getSedra(hyear, il);
  const startAbs = sedra.getFirstSaturday();
  const endAbs = HDate.hebrew2abs(hyear + 1, months.TISHREI, 1);
  const events = [];
  for (let abs = startAbs; abs < endAbs; abs += 7) {
    const parsha = sedra.lookup(abs);
    if (parsha.chag) {
      const holidays = HebrewCalendar.getHolidaysOnDate(abs, il) || [];
      events.push(...holidays);
    } else {
      const ev = new ParshaEvent(new HDate(abs), parsha.parsha, il);
      events.push(ev);
    }
  }
  const items = events.map((ev) => makeItem(ev, locale, il, lang));
  const dlfilename = `hebcal_${hyear}h.ics`;
  const q0 = {
    v: '1',
    s: 'on',
    i: il ? 'on' : 'off',
    year: String(hyear),
    yt: 'H',
    ny: 1,
  };

  const options = {year: hyear, isHebrewYear: true, noHolidays: true, sedrot: true};
  makeDownloadProps(ctx, q0, options);
  ctx.state.url.title = 'Shabbat Torah Readings';
  ctx.state.downloadAltTitle = `${hyear} only`;
  ctx.state.numYears = getNumYears(options);
  ctx.state.currentYear = todayHebYear;
  delete ctx.state.filename.pdf;

  const noIndex = hyear < todayHebYear - 20 || hyear > todayHebYear + 100;

  await ctx.render('parsha-year', {
    hyear,
    il,
    items,
    todayHebYear,
    noIndex,
    dlfilename,
    lang,
    locale,
    q: q0,
    prev: `/sedrot/${hyear - 1}?i=${il?'on':'off'}`,
    next: `/sedrot/${hyear + 1}?i=${il?'on':'off'}`,
  });
}

function makeItem(ev, locale, il, lang) {
  const hd = ev.getDate();
  const d = dayjs(hd.greg()).locale(locale);
  const mask = ev.getFlags();
  const isParsha = Boolean(mask & flags.PARSHA_HASHAVUA);
  const title0 = ev.render('en');
  const title = isParsha ? title0.substring(title0.indexOf(' ') + 1) : title0;
  const item = {
    event: ev,
    title,
    d,
    hd,
    url: shortenUrl(ev.url()),
    holidays: [],
  };
  if (isParsha) {
    const holidays0 = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    const holidays1 = holidays0.filter((ev) => !(ev.getFlags() & flags.SHABBAT_MEVARCHIM));
    item.holidays = holidays1.map((ev) => holidayEvToItem(ev, il, lang));
    const roshChodeshToday = holidays1.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
    if (!roshChodeshToday) {
      const tommorow = hd.next().getDate();
      if (tommorow === 30 || tommorow === 1) {
        item.holidays.push({title: 'Machar Chodesh'});
      }
    }
  }
  return item;
}

function holidayEvToItem(ev, il, lang) {
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
}
