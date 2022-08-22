/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, flags, Locale} from '@hebcal/core';
import {getLeyningKeyForEvent, getLeyningForHoliday,
  getLeyningForParshaHaShavua, Triennial} from '@hebcal/leyning';
import dayjs from 'dayjs';
import {basename} from 'path';
import {makeAnchor} from '@hebcal/rest-api';
import {localeMap} from './common';
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
  const lang = q.lg || 's';
  const events0 = HebrewCalendar.calendar({
    sedrot: true,
    year: hyear,
    isHebrewYear: true,
    il,
    locale: lang,
  });
  const events = events0.filter((ev) => ev.getDesc() !== 'Rosh Chodesh Tevet');
  const parshaEvents = events.filter((ev) => ev.getFlags() === flags.PARSHA_HASHAVUA);
  const parshaDates = parshaEvents.reduce((set, ev) => {
    set.add(ev.getDate().toString());
    return set;
  }, new Set());

  const locale0 = Locale.getLocaleName();
  const locale = localeMap[locale0] || 'en';
  const items = [];
  for (const ev of events) {
    const isParsha = ev.getFlags() === flags.PARSHA_HASHAVUA;
    const hd = ev.getDate();
    if (!isParsha && parshaDates.has(hd.toString())) {
      continue;
    }
    const reading = isParsha ?
      getLeyningForParshaHaShavua(ev, il) :
      getLeyningForHoliday(ev, il);
    if (!reading) {
      continue;
    }
    const key = getLeyningKeyForEvent(ev, il);
    const desc = ev.basename();
    const title0 = ev.render('en');
    const title = isParsha ? title0.substring(title0.indexOf(' ') + 1) : Locale.gettext(key, lang);
    const hebrew0 = Locale.lookupTranslation(key, 'he') || ev.render('he');
    const hebrew = isParsha ? hebrew0.substring(hebrew0.indexOf(' ') + 1) : hebrew0;
    const item = {
      event: ev,
      anchor: makeAnchor(desc),
      title,
      hebrew,
      d: dayjs(hd.greg()).locale(locale),
      hd,
      reading,
    };
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
  });
}
