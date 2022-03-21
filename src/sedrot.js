/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, months, ParshaEvent, Locale, parshiot} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import * as leyning from '@hebcal/leyning';
import {basename} from 'path';
import createError from 'http-errors';
import {httpRedirect, makeGregDate, sefariaAliyahHref,
  empty, langNames} from './common';
import {torahBookNames, sedrot, doubled, addLinksToLeyning} from './parshaCommon';
import dayjs from 'dayjs';
import drash from './drash.json';
import {distance, closest} from 'fastest-levenshtein';

const VEZOT_HABERAKHAH = 'Vezot Haberakhah';

const options15yr = {
  year: new Date().getFullYear() - 2,
  numYears: 17,
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

const allParshaAnchors = Array.from(sedrot.keys());

export async function parshaDetail(ctx) {
  const rpath = ctx.request.path;
  const base0 = basename(rpath);
  const base = base0.toLowerCase();
  const matches = base.match(parshaDateRe);
  const date = matches && matches[2];
  const parshaAnchor = matches === null ? base : matches[1];
  const parshaName0 = sedrot.get(parshaAnchor);
  if (typeof parshaName0 !== 'string') {
    const candidate = closest(parshaAnchor, allParshaAnchors);
    const editDist = distance(parshaAnchor, candidate);
    if (editDist < 2) {
      httpRedirect(ctx, `/sedrot/${candidate}?redir=spelling`);
      return;
    }
    throw createError(404, `Parsha not found: ${base}`);
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  if (!empty(q.gy)) {
    const year = parseInt(q.gy, 10);
    if (year >= 1000 && year <= 9999) {
      const events = HebrewCalendar.calendar({year, il, sedrot: true, noHolidays: true});
      const parshaEv = findParshaEvent(events, parshaName0, il);
      if (parshaEv) {
        const dateStr = dayjs(parshaEv.getDate().greg()).format('YYYYMMDD');
        const suffix = il ? '?i=on' : '';
        const anchor = makeAnchor(parshaEv.getDesc().substring(9));
        httpRedirect(ctx, `/sedrot/${anchor}-${dateStr}${suffix}`);
        return;
      }
    }
  }
  if (date) {
    const dt = parse8digitDateStr(date);
    if (dt.getFullYear() > ctx.launchDate.getFullYear() + 1000) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}`);
      return;
    }
  }
  const parshaEv = getParshaEvent(il, date, parshaName0);
  if (!parshaEv) {
    if (date) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}`);
      return;
    }
    throw createError(500, `Internal error: ${parshaName0}`);
  }
  if (base0 !== base) {
    // fix capitalization
    const suffix = il ? '?i=on' : '';
    httpRedirect(ctx, `/sedrot/${base}${suffix}`);
    return;
  }
  const parshaName = date ? parshaEv.getDesc().substring(9) : parshaName0;
  const parsha0 = leyning.parshiyot[parshaName];
  const parsha = Object.assign({
    name: parshaName,
    bookName: torahBookNames[parsha0.book - 1],
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
    parsha.haft = leyning.parshiyot[haftKey].haft;
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
  if (date && parshaName === VEZOT_HABERAKHAH) {
    for (let i = 1; i <= 6; i++) {
      delete reading.reason[i];
    }
    delete reading.reason.haftara;
  }
  addLinksToLeyning(reading.fullkriyah, false);
  reading.haftaraHref = sefariaAliyahHref(reading.haft, false);
  if (reading.sephardic) {
    reading.sephardicHref = sefariaAliyahHref(reading.seph, false);
  }
  if (reading.weekday) {
    addLinksToLeyning(reading.weekday, false);
    for (const aliyah of Object.values(reading.weekday)) {
      aliyah.href = aliyah.href.replace('&aliyot=1', '&aliyot=0');
    }
  }
  parsha.haftaraHref = sefariaAliyahHref(parsha.haft, false);
  const hd = parshaEv.getDate();
  const hyear = hd.getFullYear();
  makePrevNext(parsha, date, hd, il);
  const hasTriennial = !il && hyear >= 5744 && noTriennial.indexOf(hyear) === -1;
  const triennial = hasTriennial ? makeTriennial(date, parshaEv, hyear, parshaName) : {};
  const titleYear = date ? ' ' + hyear : '';
  const titleHebrew = Locale.hebrewStripNikkud(parsha.hebrew);
  const otherLocationSedra = HebrewCalendar.getSedra(hyear, !il);
  const otherLocationParshaName = otherLocationSedra.getString(hd).substring(9);
  const israelDiasporaDiffer = (parshaName !== otherLocationParshaName);
  const translations0 = Object.keys(langNames)
      .map((lang) => {
        const str = Locale.lookupTranslation(parsha.name, lang);
        if (str) {
          return Locale.lookupTranslation('Parashat', lang) + ' ' + str;
        }
        return str;
      })
      .filter((s) => typeof s === 'string')
      .concat('Parashat ' + parsha.name);
  const translations = Array.from(new Set(translations0)).sort();
  const iSuffix = il ? '?i=on' : '';
  await ctx.render('parsha-detail', {
    title: `${parsha.name}${titleYear} - Torah Portion - ${titleHebrew} | Hebcal Jewish Calendar`,
    parsha,
    parshaAnchor,
    parshaDateAnchor: getParshaDateAnchor(parshaEv).anchor + iSuffix,
    reading,
    il,
    iSuffix,
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
    translations,
  });
}

function makePrevNext(parsha, date, hd, il) {
  const prevNum = parsha.combined ? leyning.parshiyot[parsha.p1].num - 2 : parsha.num - 2;
  const nextNum = parsha.combined ? leyning.parshiyot[parsha.p2].num : parsha.num;
  const prevName = parshiot[prevNum];
  const nextName = parshiot[nextNum];
  if (date) {
    const abs = hd.abs();
    const events = HebrewCalendar.calendar({
      start: abs - 40,
      end: abs + 40,
      noHolidays: true,
      sedrot: true,
      il: il,
    });
    parsha.prev = prevName && findParshaDate(events, prevName, il);
    parsha.next = nextName && findParshaDate(events, nextName, il);
  } else {
    parsha.prev = prevName && {name: prevName, anchor: makeAnchor(prevName)};
    parsha.next = nextName && {name: nextName, anchor: makeAnchor(nextName)};
  }
}

function findParshaDate(events, name, il) {
  if (name) {
    const ev = findParshaEvent(events, name, il);
    if (ev) {
      return getParshaDateAnchor(ev);
    }
  }
  return null;
}

/**
 * @private
 * @param {Event} ev
 * @return {Object}
 */
function getParshaDateAnchor(ev) {
  const d = dayjs(ev.getDate().greg());
  const dateStr = d.format('YYYYMMDD');
  const name = ev.getDesc().substring(9);
  const desc = makeAnchor(name);
  return {anchor: desc + '-' + dateStr, d, ev, name};
}

function makeSummaryHtml(parsha) {
  let summary;
  let target;
  if (parsha.combined) {
    const [p1, p2] = parsha.name.split('-');
    const s1 = drash[p1].sefaria && drash[p1].sefaria.summary;
    const s2 = drash[p2].sefaria && drash[p2].sefaria.summary;
    if (s1 && s2) {
      summary = s1 + '\n ' + s2;
      target = drash[p1].sefaria.target;
    } else {
      return null;
    }
  } else {
    const sefaria = drash[parsha.name].sefaria;
    if (sefaria && sefaria.summary) {
      summary = sefaria.summary;
      target = sefaria.target;
    } else {
      return null;
    }
  }
  return {
    link: `https://www.sefaria.org/topics/parashat-${target}?tab=sources`,
    title: 'Parashat ' + parsha.name + ' from Sefaria',
    html: summary,
  };
}

function makeTriennial(date, parshaEv, hyear, parshaName) {
  const triennial = {};
  if (date) {
    const reading = leyning.getTriennialForParshaHaShavua(parshaEv, true);
    if (parshaName === VEZOT_HABERAKHAH) {
      for (let i = 1; i <= 6; i++) {
        delete reading.aliyot[i].reason;
      }
    }
    triennial.reading = reading.aliyot;
    triennial.yearNum = reading.yearNum + 1;
    addLinksToLeyning(triennial.reading, false);
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
          addLinksToLeyning(triReading2.aliyot, false);
          for (const aliyah of Object.values(triReading2.aliyot)) {
            aliyah.href = aliyah.href.replace('aliyot=1', 'aliyot=0');
            if (parshaName === VEZOT_HABERAKHAH) {
              delete aliyah.reason;
            }
          }
          triReading2.d = dayjs(triReading.date.greg());
          addSpecialHaftarahToTriennial(ev, triReading2);
          triennial.readings[yr] = triReading2;
        }
      }
    }
  }
  return triennial;
}

function addSpecialHaftarahToTriennial(ev, triReading2) {
  const parshaName = ev.parsha[0];
  if (parshaName === VEZOT_HABERAKHAH) {
    return;
  }
  const fk = leyning.getLeyningForParshaHaShavua(ev, false);
  if (fk.reason && fk.reason.haftara) {
    triReading2.haftara = fk.haftara;
    triReading2.haftaraHref = sefariaAliyahHref(fk.haft);
    triReading2.haftaraNumV = fk.haftaraNumV;
    triReading2.reason = triReading2.reason || {};
    triReading2.reason.haftara = fk.reason.haftara;
  }
}

/**
 * @param {boolean} il
 * @param {string} date
 * @param {string} parshaName
 * @return {Event[]}
 */
function makeYearEvents(il, date, parshaName) {
  const options = {
    noHolidays: true,
    sedrot: true,
    il: il,
  };
  const dt = date ? parse8digitDateStr(date) : new Date();
  if (date && parshaName === VEZOT_HABERAKHAH) {
    const hd = new HDate(dt);
    options.year = hd.getFullYear();
    options.isHebrewYear = true;
  } else if (date) {
    options.start = options.end = dt;
  } else {
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
  const events = makeYearEvents(il, date, parshaName);
  return findParshaEvent(events, parshaName, il);
}

function findParshaEvent(events, parshaName, il) {
  if (parshaName === VEZOT_HABERAKHAH) {
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
      return events.find((ev) => ev.getDesc() === descPair);
    } else {
      const [p1] = parshaName.split('-');
      const descFirst = 'Parashat ' + p1;
      return events.find((ev) => ev.getDesc() === descFirst);
    }
  }
  return event;
}
