/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, months, ParshaEvent, Locale, Sedra} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import * as leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import {httpRedirect, wrapHebrewInSpans, makeGregDate, getHaftarahHref} from './common';
import dayjs from 'dayjs';
import drash from './drash.json';

const torahBookNames = 'Genesis Exodus Leviticus Numbers Deuteronomy DoubledParshiyot'.split(' ');
const parshaByBook = new Map();
const BOOK = Array(6);
for (let i = 0; i < torahBookNames.length; i++) {
  const book = torahBookNames[i];
  parshaByBook.set(book, new Map());
  BOOK[i + 1] = book;
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
  const bookId = reading.combined ? 'DoubledParshiyot' : BOOK[reading.book];
  parshaByBook.get(bookId).set(anchor, parshaName);
}

const options15yr = {
  year: new Date().getFullYear() - 2,
  numYears: 20,
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

// Can't find pattern SSS for Vayakhel-Pekudei, startYear=5831
const noTriennial = [
  5831, 5832, 5833,
  6572, 6573, 6574,
  7313, 7314, 7315,
  7340, 7341, 7342,
  8081, 8082, 8083,
  8822, 8823, 8824,
  9194, 9195, 9196,
  9935, 9936, 9937,
  10676, 10677, 10678,
  11417, 11418, 11419,
  13298, 13299, 13300,
];

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
  if (date) {
    const dt = parse8digitDateStr(date);
    if (dt.getFullYear() > ctx.launchDate.getFullYear() + 1000) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}`);
      return;
    }
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  const parshaEv = getParshaEvent(il, date, parshaName0);
  if (!parshaEv) {
    if (date) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}`);
      return;
    }
    throw createError(500, `Internal error: ${parshaName0}`);
  }
  const parshaName = date ? parshaEv.getDesc().substring(9) : parshaName0;
  const parsha0 = leyning.parshiyot[parshaName];
  const parsha = Object.assign({
    name: parshaName,
    bookName: BOOK[parsha0.book],
    anchor: makeAnchor(parshaName),
  }, parsha0);
  if (parsha.combined) {
    const [p1, p2] = parshaName.split('-');
    parsha.hebrew = Locale.gettext(p1, 'he') + '־' + Locale.gettext(p2, 'he');
    const n1 = leyning.parshiyot[p1].num;
    parsha.ordinal = Locale.ordinal(n1, 'en') + ' and ' + Locale.ordinal(n1 + 1, 'en');
    parsha.p1 = p1;
    parsha.p2 = p2;
    parsha.p1anchor = makeAnchor(p1);
    parsha.p2anchor = makeAnchor(p2);
    const haftKey = p1 === 'Nitzavim' ? p1 : p2;
    parsha.haftara = leyning.parshiyot[haftKey].haftara;
  } else {
    parsha.ordinal = Locale.ordinal(parsha.num, 'en');
  }
  const chapVerse = parsha.fullkriyah['1'].b;
  const [chapter, verse] = chapVerse.split(':');
  const book = parsha.book;
  const portion = parsha.combined ? parsha.num1 : parsha.num;
  parsha.ids = {portion, book, chapter, verse};
  const items15map = il ? items15yrIsrael : items15yrDiaspora;
  const items0 = items15map.get(parshaName);
  const items = items0.items;
  const reading = date ?
    leyning.getLeyningForParshaHaShavua(parshaEv, il) :
    leyning.getLeyningForParsha(parshaName);
  leyning.addSefariaLinksToLeyning(reading.fullkriyah, false);
  reading.haftaraHref = getHaftarahHref(reading.haftara);
  if (reading.sephardic) {
    reading.sephardicHref = getHaftarahHref(reading.sephardic);
  }
  parsha.haftaraHref = getHaftarahHref(parsha.haftara);
  const hd = parshaEv.getDate();
  const hyear = hd.getFullYear();
  const hasTriennial = !il && hyear >= 5744 && noTriennial.indexOf(hyear) === -1;
  const triennial = hasTriennial ? makeTriennial(date, parshaEv, hyear, parshaName) : {};
  const titleYear = date ? ' ' + hyear : '';
  const titleHebrew = Locale.hebrewStripNikkud(parsha.hebrew);
  const otherLocationSedra = new Sedra(hyear, !il);
  const otherLocationParshaName = otherLocationSedra.getString(hd).substring(9);
  const israelDiasporaDiffer = (parshaName !== otherLocationParshaName);
  await ctx.render('parsha-detail', {
    title: `${parsha.name}${titleYear} - Torah Portion - ${titleHebrew} | Hebcal Jewish Calendar`,
    parsha,
    reading,
    il,
    iSuffix: il ? '?i=on' : '',
    d: dayjs(hd.greg()),
    hd,
    date,
    hasTriennial,
    triennial,
    israelDiasporaDiffer,
    locationName: il ? 'Israel' : 'the Diaspora',
    items,
    sometimesDoubled: parsha.combined || doubled.has(parshaName),
    commentary: drash[parsha.name],
    summary: makeSummaryHtml(parsha),
  });
}

function makeSummaryHtml(parsha) {
  function replaceWithName(str, p) {
    return str.replace(/^(The parashah|It) /, `Parashat ${p} `)
        .replace(/^In the parashah, /, `In Parashat ${p}, `);
  }
  let summary;
  let target;
  if (parsha.combined) {
    const [p1, p2] = parsha.name.split('-');
    const s1 = drash[p1].wikipedia && drash[p1].wikipedia.summary;
    const s2 = drash[p2].wikipedia && drash[p2].wikipedia.summary;
    if (s1 && s2) {
      summary = replaceWithName(s1, p1) + ' ' + replaceWithName(s2, p2);
      target = drash[p1].wikipedia.target;
    } else {
      return null;
    }
  } else {
    const wikipedia = drash[parsha.name].wikipedia;
    if (wikipedia && wikipedia.summary) {
      summary = replaceWithName(wikipedia.summary, parsha.name);
      target = wikipedia.target;
    } else {
      return null;
    }
  }
  return {
    link: `https://en.wikipedia.org/wiki/${target}`,
    title: decodeURIComponent(target).replace(/_/g, ' ') + ' from Wikipedia',
    html: wrapHebrewInSpans(summary),
  };
}

function makeTriennial(date, parshaEv, hyear, parshaName) {
  const triennial = {};
  if (date) {
    const reading = leyning.getTriennialForParshaHaShavua(parshaEv, true);
    triennial.reading = reading.aliyot;
    triennial.yearNum = reading.yearNum + 1;
    leyning.addSefariaLinksToLeyning(triennial.reading, false);
    for (const aliyah of Object.values(triennial.reading)) {
      aliyah.href = aliyah.href.replace('aliyot=1', 'aliyot=0');
    }
  } else {
    const startYear = leyning.Triennial.getCycleStartYear(hyear);
    const tri = leyning.getTriennial(startYear);
    triennial.readings = Array(3);
    for (let yr = 0; yr < 3; yr++) {
      const triReading = triennial.readings[yr] = tri.getReading(parshaName, yr);
      if (triReading.readSeparately) {
        triReading.hyear = startYear + yr;
        triReading.p1d = dayjs(triReading.date1.greg());
        triReading.p2d = dayjs(triReading.date2.greg());
      } else {
        if (triReading.readTogether) {
          triReading.hyear = startYear + yr;
          triReading.d = dayjs(triReading.date.greg());
          triReading.anchor = makeAnchor(triReading.readTogether);
        } else {
          const ev = new ParshaEvent(triReading.date, [parshaName], false);
          const triReading2 = leyning.getTriennialForParshaHaShavua(ev, true);
          leyning.addSefariaLinksToLeyning(triReading2.aliyot, false);
          for (const aliyah of Object.values(triReading2.aliyot)) {
            aliyah.href = aliyah.href.replace('aliyot=1', 'aliyot=0');
          }
          triReading2.d = dayjs(triReading.date.greg());
          triennial.readings[yr] = triReading2;
        }
      }
    }
  }
  return triennial;
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
    const dt = parse8digitDateStr(date);
    options.start = options.end = dt;
  } else {
    const dt = new Date();
    options.start = dt;
    options.end = new Date(dt.getTime() + (386 * 24 * 60 * 60 * 1000));
  }
  const events = HebrewCalendar.calendar(options);
  return events;
}

/**
 * @param {string} date
 * @return {Date}
 */
function parse8digitDateStr(date) {
  const gy = date.substring(0, 4);
  const gm = date.substring(4, 6);
  const gd = date.substring(6, 8);
  return makeGregDate(gy, gm, gd);
}

function getParshaEvent(il, date, parshaName) {
  const events = makeYearEvents(il, date);
  if (parshaName === 'Vezot Haberakhah') {
    const bereshit = events.find((ev) => ev.getDesc() === 'Parashat Bereshit');
    const hyear = bereshit.getDate().getFullYear();
    const mday = il ? 22 : 23;
    return new ParshaEvent(new HDate(mday, months.TISHREI, hyear), [parshaName], il);
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
      const [p1] = parshaName.split('-');
      const descFirst = 'Parashat ' + p1;
      const event3 = events.find((ev) => ev.getDesc() === descFirst);
      return event3;
    }
  }
  return event;
}

export async function parshaIndex(ctx) {
  const saturday = dayjs().day(6);
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const q = ctx.request.query;
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
    title: 'Torah Readings | Hebcal Jewish Calendar',
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
