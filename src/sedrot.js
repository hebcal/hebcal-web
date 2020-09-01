/* eslint-disable require-jsdoc */
import {HebrewCalendar} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import {addSefariaLinksToLeyning} from './common';

const sedrot = new Map();
for (const key of Object.keys(leyning.parshiyot)) {
  const anchor = makeAnchor(key);
  sedrot.set(anchor, key);
  sedrot.set(anchor.replace(/-/g, ''), key);
}

const parshaYearRe = /^([a-z-]+)-(\d{4})$/;

export async function parshaDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const matches = base.match(parshaYearRe);
  const year = matches && +matches[2];
  const parshaName = matches === null ? sedrot.get(base) : sedrot.get(matches[1]);
  if (typeof parshaName !== 'string') {
    throw createError(404, `Parsha not found: ${base}`);
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  const parsha = Object.assign({name: parshaName}, leyning.parshiyot[parshaName]);
  const events = HebrewCalendar.calendar({noHolidays: true, sedrot: true, il: il, numYears: 20});
  const desc = 'Parashat ' + parshaName;
  const parshaEv = events.find((ev) => ev.getDesc() === desc);
  const reading = leyning.getLeyningForParshaHaShavua(parshaEv);
  addSefariaLinksToLeyning(reading.fullkriyah, false);
  const triennial = leyning.getTriennialForParshaHaShavua(parshaEv);
  // addSefariaLinksToLeyning(tri, false);
  await ctx.render('parsha-detail', {
    title: `${parsha.name} - Torah Portion - ${parsha.hebrew} | Hebcal Jewish Calendar`,
    parsha,
    reading,
    triennial,
    jsonLD: '{}',
    year: year,
  });
}
