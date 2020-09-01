/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, months, ParshaEvent, Locale} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import {addSefariaLinksToLeyning} from './common';
import dayjs from 'dayjs';

const sedrot = new Map();
for (const key of Object.keys(leyning.parshiyot)) {
  const anchor = makeAnchor(key);
  sedrot.set(anchor, key);
  sedrot.set(anchor.replace(/-/g, ''), key);
}

const doubled = new Map();
for (const [name, reading] of Object.entries(leyning.parshiyot)) {
  if (reading.combined) {
    const [p1, p2] = name.split('-');
    doubled.set(p1, name);
    doubled.set(p2, name);
  }
}

const parshaYearRe = /^([a-z-]+)-(\d{4})$/;

export async function parshaDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const matches = base.match(parshaYearRe);
  const year = matches && +matches[2];
  const parshaAnchor = matches === null ? base : matches[1];
  const parshaName = sedrot.get(parshaAnchor);
  if (typeof parshaName !== 'string') {
    throw createError(404, `Parsha not found: ${base}`);
  }
  const dt = new Date();
  const hd = new HDate(dt);
  const hyear = hd.getFullYear();
  const q = ctx.request.query;
  const il = q.i === 'on';
  const parsha = Object.assign({anchor: parshaAnchor, name: parshaName}, leyning.parshiyot[parshaName]);
  /** @todo needs to be adjusted for combined, which are all num >= 100 */
  parsha.ordinal = Locale.ordinal(parsha.num);
  const options = {
    noHolidays: true,
    sedrot: true,
    il: il,
  };
  if (year) {
    options.year = year;
  } else {
    options.start = dt;
    options.end = new Date(dt.getTime() + (365 * 24 * 60 * 60 * 1000));
  }
  const events = HebrewCalendar.calendar(options);
  const parshaEv = getParshaEvent(parshaName, events, il, hyear);
  const reading = leyning.getLeyningForParshaHaShavua(parshaEv);
  addSefariaLinksToLeyning(reading.fullkriyah, false);
  const cycleStartYear = leyning.Triennial.getCycleStartYear(hyear);
  const triennial = il ? null : leyning.getTriennialForParshaHaShavua(parshaEv);
  // addSefariaLinksToLeyning(tri, false);
  await ctx.render('parsha-detail', {
    title: `${parsha.name} - Torah Portion - ${parsha.hebrew} | Hebcal Jewish Calendar`,
    parsha,
    reading,
    il,
    d: dayjs(parshaEv.getDate().greg()),
    triennial,
    jsonLD: '{}',
    year: year,
  });
}

function getParshaEvent(parshaName, events, il, hyear) {
  if (parshaName === 'Vezot Haberakhah') {
    const mday = il ? 22 : 23;
    return new ParshaEvent(new HDate(mday, months.TISHREI, hyear), [parshaName]);
  }
  const desc = 'Parashat ' + parshaName;
  const event = events.find((ev) => ev.getDesc() === desc);
  if (!event) {
    const pair = doubled.get(parshaName);
    if (pair) {
      const descPair = 'Parashat ' + pair;
      const event2 = events.find((ev) => ev.getDesc() === descPair);
      return event2;
    } else {
      const [p1, p2] = parshaName.split('-');
      const descFirst = 'Parashat ' + p1;
      const event3 = events.find((ev) => ev.getDesc() === descFirst);
      return event3;
    }
  }
  return event;
}
