/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, ParshaEvent, Sedra} from '@hebcal/core';
import * as leyning from '@hebcal/leyning';
import {getTodayDate} from './common';
import {parshaByBook, torahBookNames} from './parshaCommon';
import dayjs from 'dayjs';

export async function parshaIndex(ctx) {
  const q = ctx.request.query;
  const dt = getTodayDate(q);
  const saturday = dayjs(dt).day(6);
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const il = q.i === 'on';
  const sedra = new Sedra(hyear, il);
  const parsha0 = sedra.lookup(hd);
  let parsha = null;
  let parshaHref = null;
  if (parsha0.chag) {
    const events = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    if (events.length > 0) {
      parsha = events[0].basename();
      parshaHref = events[0].url();
    }
  } else {
    parsha = parsha0.parsha.join('-');
    const pe = new ParshaEvent(hd, parsha0.parsha, il);
    parshaHref = pe.url();
  }
  await ctx.render('parsha-index', {
    il,
    saturday,
    hyear,
    triCycleStartYear: leyning.Triennial.getCycleStartYear(hyear),
    parsha,
    parshaHref,
    parshaByBook,
    torahBookNames,
  });
}
