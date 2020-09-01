/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, months, ParshaEvent, Locale, Sedra} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import {addSefariaLinksToLeyning} from './common';
import dayjs from 'dayjs';

export async function parshaIndex(ctx) {
  const saturday = dayjs().day(6);
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const q = ctx.request.query;
  const il = q.i === 'on';
  const sedra = new Sedra(hyear, il);
  const parsha0 = sedra.lookup(hd);
  const parsha = parsha0.chag ? null : parsha0.parsha.join('-');
  const parshaHref = parsha0.chag ? null : makeAnchor(parsha);
  await ctx.render('parsha-index', {
    title: 'Torah Readings | Hebcal Jewish Calendar',
    il,
    saturday,
    parsha,
    parshaHref,
  });
}

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
  const hyear = year ? year + 3760 : hd.getFullYear();
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
  let triennial;
  if (!il) {
    // const tri = leyning.getTriennial(hyear);
    const cycleStartYear = leyning.Triennial.getCycleStartYear(hyear);
    triennial = leyning.getTriennialForParshaHaShavua(parshaEv);
    addSefariaLinksToLeyning(triennial, false);
  }
  await ctx.render('parsha-detail', {
    title: `${parsha.name} - Torah Portion - ${parsha.hebrew} | Hebcal Jewish Calendar`,
    parsha,
    reading,
    il,
    d: dayjs(parshaEv.getDate().greg()),
    triennial,
    jsonLD: '{}',
    year: year,
    ortUrl: makeBibleOrtUrl(parsha),
  });
}

/**
 * @param {string} book
 * @return {number}
 */
function getBookId(book) {
  switch (book.toLowerCase()) {
    case 'genesis': return 1;
    case 'exodus': return 2;
    case 'leviticus': return 3;
    case 'numbers': return 4;
    case 'deuteronomy': return 5;
    default: return 0;
  }
}

function makeBibleOrtUrl(parsha) {
  const chapVerse = parsha.fullkriyah['1'].b;
  const [chapter, verse] = chapVerse.split(':');
  const book = getBookId(parsha.book);
  // eslint-disable-next-line max-len
  return `http://www.bible.ort.org/books/torahd5.asp?action=displaypage&book=${book}&chapter=${chapter}&verse=${verse}&portion=${parsha.num}`;
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
