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
const doubled = new Map();
for (const [parshaName, reading] of Object.entries(leyning.parshiyot)) {
  const anchor = makeAnchor(parshaName);
  sedrot.set(anchor, parshaName);
  sedrot.set(anchor.replace(/-/g, ''), parshaName);
  if (reading.combined) {
    const [p1, p2] = parshaName.split('-');
    doubled.set(p1, parshaName);
    doubled.set(p2, parshaName);
  }
}

const options15yr = {
  year: new Date().getFullYear() - 1,
  numYears: 15,
  noHolidays: true,
  sedrot: true,
};
const allEvts15yrIsrael = HebrewCalendar.calendar(Object.assign({il: true}, options15yr));
const allEvts15yrDiaspora = HebrewCalendar.calendar(Object.assign({il: false}, options15yr));
const evts15yrIsrael = new Map();
const evts15yrDiaspora = new Map();
for (const parshaName of Object.keys(leyning.parshiyot)) {
  evts15yrIsrael.set(parshaName, get15yrEvents(parshaName, true));
  evts15yrDiaspora.set(parshaName, get15yrEvents(parshaName, false));
}

/**
 * Returns Parsha events during 15 year period that match this parshaName
 * @param {string} parshaName
 * @param {boolean} il
 * @return {Event[]}
 */
function get15yrEvents(parshaName, il) {
  const events = il ? allEvts15yrIsrael : allEvts15yrDiaspora;
  const parsha = leyning.parshiyot[parshaName];
  const prefix = 'Parashat ';
  const descs = [prefix + parshaName];
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    descs.push(prefix + p1, prefix + p2);
  } else {
    const pair = doubled.get(parshaName);
    if (pair) {
      descs.push(prefix + pair);
    }
  }
  return events.filter((ev) => descs.indexOf(ev.getDesc()) !== -1);
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
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    parsha.hebrew = Locale.gettext(p1, 'he') + '־' + Locale.gettext(p2, 'he');
    const n1 = leyning.parshiyot[p1].num;
    parsha.ordinal = Locale.ordinal(n1) + ' and ' + Locale.ordinal(n1 + 1);
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num);
  }
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
  const events15map = il ? evts15yrIsrael : evts15yrDiaspora;
  const events15 = events15map.get(parshaName);
  const items = events15.map((ev) => {
    return {
      desc: ev.getDesc().substring(9),
      d: dayjs(ev.getDate().greg()),
    };
  });
  const parshaEv = getParshaEvent(parshaName, events, il, hyear);
  const reading = leyning.getLeyningForParshaHaShavua(parshaEv, il);
  addSefariaLinksToLeyning(reading.fullkriyah, false);
  let triennial;
  let triYearNum;
  if (!il) {
    // const tri = leyning.getTriennial(hyear);
    const cycleStartYear = leyning.Triennial.getCycleStartYear(hyear);
    triYearNum = 1 + hyear - cycleStartYear;
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
    triYearNum,
    jsonLD: '{}',
    year: year,
    ortUrl: makeBibleOrtUrl(parsha),
    locationName: il ? 'Israel' : 'the Diaspora',
    items,
    sometimesDoubled: parsha.combined || doubled.has(parshaName),
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
    const mday = il ? 21 : 22;
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
