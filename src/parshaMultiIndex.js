import {HebrewCalendar, HDate, months, ParshaEvent} from '@hebcal/core';
import {getLeyningForParshaHaShavua} from '@hebcal/leyning';
import {parshiot54, parshaByBook, torahBookNames} from './parshaCommon.js';
import {getDefaultHebrewYear} from './dateUtil.js';
import dayjs from 'dayjs';

const VEZOT_HABERAKHAH = 'Vezot Haberakhah';

export async function parshaMultiYearIndex(ctx) {
  const dt = new Date();
  const hd = new HDate(dt);
  const todayHebYear = hd.getFullYear();
  const hyear0 = parseInt(ctx.request.query?.year, 10);
  const hyear = hyear0 || getDefaultHebrewYear(hd);
  const q = ctx.request.query;
  const il = q.i === 'on';
  const byParsha = new Map();
  for (const parshaName of parshiot54) {
    byParsha.set(parshaName, new Map());
  }
  for (let yr = hyear - 1; yr <= hyear + 4; yr++) {
    const events = HebrewCalendar.calendar({
      year: yr,
      isHebrewYear: true,
      il,
      noHolidays: true,
      sedrot: true,
    });
    const mday = il ? 22 : 23;
    const pe = new ParshaEvent(new HDate(mday, months.TISHREI, yr), [VEZOT_HABERAKHAH], il);
    events.push(pe);
    for (const ev of events) {
      const reading = getLeyningForParshaHaShavua(ev, il);
      const d = dayjs(ev.getDate().greg());
      const item = {ev, reading, d};
      const parsha = ev.parsha;
      // either 1- or 2-element array
      for (const parshaName of parsha) {
        const map = byParsha.get(parshaName);
        const prev = map.get(yr);
        if (prev) {
          prev.push(item);
        } else {
          map.set(yr, [item]);
        }
      }
    }
  }
  const canonical = new URL('https://www.hebcal.com/sedrot/grid');
  const inverse = new URL(canonical);
  const yearOverride = Boolean(hyear0);
  if (il) {
    canonical.searchParams.set('i', 'on');
  } else {
    inverse.searchParams.set('i', 'on');
  }
  if (yearOverride) {
    canonical.searchParams.set('year', hyear0);
    inverse.searchParams.set('year', hyear0);
  }
  const prev = new URL(canonical);
  prev.searchParams.set('year', hyear - 5);
  const next = new URL(canonical);
  next.searchParams.set('year', hyear + 5);
  const noIndex = hyear < todayHebYear - 20 || hyear > todayHebYear + 100;
  ctx.lastModified = dt;
  await ctx.render('parsha-multi-year-index', {
    il,
    hyear,
    parshaByBook,
    torahBookNames,
    byParsha,
    yearOverride,
    canonical,
    inverse,
    todayHebYear,
    noIndex,
    prev: prev.href,
    next: next.href,
  });
}
