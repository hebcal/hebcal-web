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
  year: new Date().getFullYear() - 2,
  numYears: 16,
  noHolidays: true,
  sedrot: true,
};
const allEvts15yrIsrael = HebrewCalendar.calendar(Object.assign({il: true}, options15yr));
const allEvts15yrDiaspora = HebrewCalendar.calendar(Object.assign({il: false}, options15yr));
const items15yrIsrael = new Map();
const items15yrDiaspora = new Map();
for (const parshaName of Object.keys(leyning.parshiyot)) {
  items15yrIsrael.set(parshaName, get15yrEvents(parshaName, true));
  items15yrDiaspora.set(parshaName, get15yrEvents(parshaName, false));
}

function eventToItem(ev) {
  const desc = ev.getDesc().substring(9);
  return {
    event: ev,
    desc: desc,
    anchor: makeAnchor(desc),
    d: dayjs(ev.getDate().greg()),
    hyear: ev.getDate().getFullYear(),
  };
}

/**
 * Returns Parsha events during 15 year period that match this parshaName
 * @param {string} parshaName
 * @param {boolean} il
 * @return {any}
 */
function get15yrEvents(parshaName, il) {
  const allEvents = il ? allEvts15yrIsrael : allEvts15yrDiaspora;
  const prefix = 'Parashat ';
  const descs = [prefix + parshaName];
  const pair = doubled.get(parshaName);
  if (pair) {
    descs.push(prefix + pair);
  }
  const events = allEvents.filter((ev) => descs.indexOf(ev.getDesc()) !== -1);
  const items = events.map(eventToItem);
  return {items};
}

const parshaDateRe = /^([a-z-]+)-(\d{8})$/;

export async function parshaDetail(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const matches = base.match(parshaDateRe);
  const date = matches && matches[2];
  const parshaAnchor = matches === null ? base : matches[1];
  const parshaName0 = sedrot.get(parshaAnchor);
  if (typeof parshaName0 !== 'string') {
    throw createError(404, `Parsha not found: ${base}`);
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  const parshaEv = getParshaEvent(il, date, parshaName0);
  if (!parshaEv) {
    throw createError(500, `Internal error: ${parshaName0}`);
  }
  const parshaName = date ? parshaEv.getDesc().substring(9) : parshaName0;
  const parsha = Object.assign(
      {name: parshaName, anchor: makeAnchor(parshaName)},
      leyning.parshiyot[parshaName]);
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    parsha.hebrew = Locale.gettext(p1, 'he') + '־' + Locale.gettext(p2, 'he');
    const n1 = leyning.parshiyot[p1].num;
    parsha.ordinal = Locale.ordinal(n1) + ' and ' + Locale.ordinal(n1 + 1);
    parsha.p1 = p1;
    parsha.p2 = p2;
    parsha.p1anchor = makeAnchor(p1);
    parsha.p2anchor = makeAnchor(p2);
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num);
  }
  const items15map = il ? items15yrIsrael : items15yrDiaspora;
  const items0 = items15map.get(parshaName);
  const items = items0.items;
  const reading = leyning.getLeyningForParshaHaShavua(parshaEv, il);
  addSefariaLinksToLeyning(reading.fullkriyah, false);
  const triennial = {};
  if (!il && parshaName !== 'Vezot Haberakhah') {
    if (date) {
      const reading = leyning.getTriennialForParshaHaShavua(parshaEv, true);
      triennial.reading = reading.aliyot;
      triennial.yearNum = reading.yearNum + 1;
      addSefariaLinksToLeyning(triennial.reading, false);
    } else {
      const hyear = parshaEv.getDate().getFullYear();
      const tri = leyning.getTriennial(hyear);
      triennial.readings = Array(3);
      for (let yr = 0; yr < 3; yr++) {
        const triReading = triennial.readings[yr] = tri.getReading(parshaName, yr);
        if (triReading.readSeparately) {
          triReading.hyear = hyear + yr;
          triReading.p1d = dayjs(triReading.date1.greg());
          triReading.p2d = dayjs(triReading.date2.greg());
        } else {
          triReading.d = dayjs(triReading.date.greg());
          if (triReading.readTogether) {
            triReading.anchor = makeAnchor(triReading.readTogether);
          } else {
            addSefariaLinksToLeyning(triReading.aliyot, false);
          }
        }
      }
    }
  }
  const hd = parshaEv.getDate();
  const titleYear = date ? ' ' + hd.getFullYear() : '';
  await ctx.render('parsha-detail', {
    title: `${parsha.name}${titleYear} - Torah Portion - ${parsha.hebrew} | Hebcal Jewish Calendar`,
    parsha,
    reading,
    il,
    iSuffix: il ? '?i=on' : '',
    d: dayjs(hd.greg()),
    hd,
    date,
    hasTriennial: !il && parsha.name !== 'Vezot Haberakhah',
    triennial,
    ortUrl: makeBibleOrtUrl(parsha),
    locationName: il ? 'Israel' : 'the Diaspora',
    items,
    sometimesDoubled: parsha.combined || doubled.has(parshaName),
  });
}

/**
 * @param {boolean} il
 * @param {string} date
 * @return {Event[]}
 */
function makeYearEvents(il, date) {
  const options = {
    noHolidays: true,
    sedrot: true,
    il: il,
  };
  if (date) {
    const gy = parseInt(date.substring(0, 4), 10);
    const gm = parseInt(date.substring(4, 6), 10);
    const gd = parseInt(date.substring(6, 8), 10);
    const dt = new Date(gy, gm - 1, gd);
    options.start = options.end = dt;
  } else {
    const dt = new Date();
    options.start = dt;
    options.end = new Date(dt.getTime() + (365 * 24 * 60 * 60 * 1000));
  }
  const events = HebrewCalendar.calendar(options);
  return events;
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

function getParshaEvent(il, date, parshaName) {
  const events = makeYearEvents(il, date);
  if (parshaName === 'Vezot Haberakhah') {
    const bereshit = events.find((ev) => ev.getDesc() === 'Parashat Bereshit');
    const hyear = bereshit.getDate().getFullYear();
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
