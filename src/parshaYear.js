/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, flags, Locale} from '@hebcal/core';
import * as leyning from '@hebcal/leyning';
import dayjs from 'dayjs';
import {basename} from 'path';
import {makeAnchor} from '@hebcal/rest-api';
import {localeMap, downloadHref} from './common';

export async function parshaYear(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const todayHebYear = new HDate().getFullYear();
  const hyear = parseInt(base, 10) || todayHebYear;
  const q = ctx.request.query;
  const il = q.i === 'on';
  const lang = q.lg || 's';
  const events = HebrewCalendar.calendar({
    sedrot: true,
    year: hyear,
    isHebrewYear: true,
    il,
    locale: lang,
  });
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
      leyning.getLeyningForParshaHaShavua(ev, il) :
      leyning.getLeyningForHoliday(ev, il);
    if (!reading) {
      continue;
    }
    const key = leyning.getLeyningKeyForEvent(ev, il);
    const desc = ev.basename();
    const title0 = ev.render();
    const title = isParsha ? title0.substring(title0.indexOf(' ') + 1) : Locale.gettext(key, lang);
    const hebrew0 = ev.render('he');
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
  const dlhref = downloadHref(q0, dlfilename);
  await ctx.render('parsha-year', {
    hyear,
    il,
    items,
    todayHebYear,
    dlfilename,
    dlhref,
    triCycleStartYear: hyear >= 5744 ? leyning.Triennial.getCycleStartYear(hyear) : null,
  });
}
