/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, ParshaEvent} from '@hebcal/core';
import {Triennial} from '@hebcal/leyning';
import {setDefautLangTz, getSunsetAwareDate, langNames, expiresSaturdayNight} from './common';
import {parshaByBook, torahBookNames, lookupParshaMeta} from './parshaCommon';
import dayjs from 'dayjs';

const myLangNames = Object.assign({
  en: langNames.s,
  ashkenazi: langNames.a,
  he: ['עברית', 'Hebrew'],
}, langNames);
delete myLangNames.s;
delete myLangNames.h;
delete myLangNames.a;
delete myLangNames['he-x-NoNikud'];

export async function parshaIndex(ctx) {
  const q = setDefautLangTz(ctx);
  const {dt, afterSunset} = getSunsetAwareDate(q, ctx.state.location);
  expiresSaturdayNight(ctx, new Date(), ctx.state.timezone);
  const hd0 = new HDate(dt);
  const hd = afterSunset ? hd0.next() : hd0;
  const saturday = hd.onOrAfter(6);
  const hyear = saturday.getFullYear();
  const il = q.i === 'on';
  const [parshaDia, parshaDiaHref, metaDia] = getParsha(saturday, false);
  const [parshaIsrael, parshaIsraelHref, metaIL] = getParsha(saturday, true);
  const israelDiasporaDiffer = (parshaDia !== parshaIsrael);
  ctx.state.lang = 'en';
  const parsha = il ? parshaIsrael : parshaDia;
  const parshaHref = il ? parshaIsraelHref : parshaDiaHref;
  const meta = il ? metaIL : metaDia;
  const nextSaturday = new HDate(saturday.abs() + 7);
  const [parshaNext, parshaNextHref, metaNext] = getParsha(nextSaturday, il);
  const jsonLD = [
    makeParshaJsonLD(saturday, parsha, parshaHref, meta),
    makeParshaJsonLD(nextSaturday, parshaNext, parshaNextHref, metaNext),
  ];
  await ctx.render('parsha-index', {
    title: `Weekly Torah Portion - Parashat haShavua - Hebcal`,
    il,
    saturday: dayjs(saturday.greg()),
    hyear,
    triCycleStartYear: Triennial.getCycleStartYear(hyear),
    parsha,
    parshaHref,
    parshaByBook,
    torahBookNames,
    parshaDia,
    parshaDiaHref,
    parshaIsrael,
    parshaIsraelHref,
    israelDiasporaDiffer,
    langNames: myLangNames,
    meta,
    jsonLD,
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
      return [ev.basename(), ev.url(), undefined];
    } else {
      // is this possible?
      return [parsha, null, undefined];
    }
  } else {
    const pe = new ParshaEvent(hd, parsha0.parsha, il);
    const parshaHref = pe.url();
    const meta = lookupParshaMeta(parsha);
    return [parsha, parshaHref, meta];
  }
}

function makeParshaJsonLD(hd, parsha, parshaHref, meta) {
  const d = dayjs(hd.greg());
  const isoDate = d.format('YYYY-MM-DD');
  const jsonLD = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': `Parashat ${parsha}`,
    'startDate': isoDate,
    'endDate': isoDate,
    'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
    'location': {
      '@type': 'VirtualLocation',
      'url': parshaHref,
    },
  };
  const desc = meta?.summaryHtml?.html;
  if (desc) {
    jsonLD.description = desc;
  }
  return jsonLD;
}
