import {HebrewCalendar, HDate} from '@hebcal/core';
import {getLeyningForParshaHaShavua} from '@hebcal/leyning';
import {parshiot54, parshaByBook, torahBookNames} from './parshaCommon';
import {getDefaultHebrewYear} from './common';
import dayjs from 'dayjs';

// eslint-disable-next-line require-jsdoc
export async function parshaMultiYearIndex(ctx) {
  const dt = new Date();
  const hd = new HDate(dt);
  const hyear = getDefaultHebrewYear(hd);
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
    for (const ev of events) {
      const reading = getLeyningForParshaHaShavua(ev, il);
      const d = dayjs(ev.getDate().greg());
      const item = {ev, reading, d};
      const parsha = ev.parsha;
      // either 1- or 2-element array
      for (const parshaName of parsha) {
        const map = byParsha.get(parshaName);
        map.set(yr, item);
      }
    }
  }
  await ctx.render('parsha-multi-year-index', {
    il,
    hyear,
    parshaByBook,
    torahBookNames,
    byParsha,
  });
}
