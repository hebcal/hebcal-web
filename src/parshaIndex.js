/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, ParshaEvent} from '@hebcal/core';
import * as leyning from '@hebcal/leyning';
import {setDefautLangTz, getSunsetAwareDate} from './common';
import {parshaByBook, torahBookNames} from './parshaCommon';
import dayjs from 'dayjs';

export async function parshaIndex(ctx) {
  const q = setDefautLangTz(ctx);
  const {dt, afterSunset} = getSunsetAwareDate(q, ctx.state.location);
  const hd0 = new HDate(dt);
  const hd = afterSunset ? hd0.next() : hd0;
  const saturday = hd.onOrAfter(6);
  const hyear = saturday.getFullYear();
  const il = q.i === 'on';
  const [parshaDia, parshaDiaHref] = getParsha(saturday, false);
  const [parshaIsrael, parshaIsraelHref] = getParsha(saturday, true);
  const israelDiasporaDiffer = (parshaDia !== parshaIsrael);
  await ctx.render('parsha-index', {
    il,
    saturday: dayjs(saturday.greg()),
    hyear,
    triCycleStartYear: leyning.Triennial.getCycleStartYear(hyear),
    parsha: il ? parshaIsrael : parshaDia,
    parshaHref: il ? parshaIsraelHref : parshaDiaHref,
    parshaByBook,
    torahBookNames,
    parshaDia,
    parshaDiaHref,
    parshaIsrael,
    parshaIsraelHref,
    israelDiasporaDiffer,
  });
}

function getParsha(hd, il) {
  const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
  const parsha0 = sedra.lookup(hd);
  const parsha = parsha0.parsha.join('-');
  if (parsha0.chag) {
    const events = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    if (events.length > 0) {
      const ev = events[0];
      return [ev.basename(), ev.url()];
    } else {
      // is this possible?
      return [parsha, null];
    }
  } else {
    const pe = new ParshaEvent(hd, parsha0.parsha, il);
    const parshaHref = pe.url();
    return ['Parashat ' + parsha, parshaHref];
  }
}
