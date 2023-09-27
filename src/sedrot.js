/* eslint-disable require-jsdoc */
import {HebrewCalendar, HDate, months, ParshaEvent, Locale} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import {getLeyningForParshaHaShavua, getLeyningForParsha} from '@hebcal/leyning';
import {Triennial, getTriennial, getTriennialForParshaHaShavua} from '@hebcal/triennial';
import createError from 'http-errors';
import {httpRedirect, makeGregDate, sefariaAliyahHref,
  getBaseFromPath, empty, langNames} from './common';
import {sedrot, doubled, addLinksToLeyning, makeLeyningHtmlFromParts,
  parshiot54,
  lookupParshaMeta, lookupParshaAlias, parshaNum, doubledParshiyot} from './parshaCommon';
import dayjs from 'dayjs';
import drash from './drash.json';

const VEZOT_HABERAKHAH = 'Vezot Haberakhah';

const options15yr = {
  year: new Date().getFullYear() - 2,
  numYears: 18,
  noHolidays: true,
  sedrot: true,
};
const allEvts15yrIsrael = HebrewCalendar.calendar(Object.assign({il: true}, options15yr));
const allEvts15yrDiaspora = HebrewCalendar.calendar(Object.assign({il: false}, options15yr));
const items15yrIsrael = new Map();
const items15yrDiaspora = new Map();
const allParshiot = [].concat(parshiot54, doubledParshiyot);
for (const parshaName of allParshiot) {
  items15yrIsrael.set(parshaName, get15yrEvents(parshaName, true));
  items15yrDiaspora.set(parshaName, get15yrEvents(parshaName, false));
}

function makeVezotEvents(il) {
  const startYear = new HDate().getFullYear() - 2;
  const mday = il ? 22 : 23;
  const events = [];
  for (let i = 0; i < 18; i++) {
    const hyear = startYear + i;
    const pe = new ParshaEvent(new HDate(mday, months.TISHREI, hyear), [VEZOT_HABERAKHAH], il);
    events.push(pe);
  }
  return events;
}

/**
 * Returns Parsha events during 15 year period that match this parshaName
 * @param {string} parshaName
 * @param {boolean} il
 * @return {any[]}
 */
function get15yrEvents(parshaName, il) {
  if (parshaName === VEZOT_HABERAKHAH) {
    return makeVezotEvents(il).map((ev) => {
      return eventToItem(ev, il);
    });
  }
  const allEvents = il ? allEvts15yrIsrael : allEvts15yrDiaspora;
  const prefix = 'Parashat ';
  const descs = [prefix + parshaName];
  const pair = doubled.get(parshaName);
  if (pair) {
    descs.push(prefix + pair);
  }
  const events = allEvents.filter((ev) => descs.indexOf(ev.getDesc()) !== -1);
  return events.map(function(ev) {
    return eventToItem(ev, il);
  });
}

function eventToItem(ev, il) {
  const desc = ev.getDesc().substring(9);
  const item = {
    event: ev,
    desc: desc,
    anchor: makeAnchor(desc),
    d: dayjs(ev.getDate().greg()),
    hyear: ev.getDate().getFullYear(),
  };
  const fk = getLeyningForParshaHaShavua(ev, il);
  if (fk.reason?.haftara) {
    item.haftara = fk.haftara;
    item.haftaraReason = fk.reason.haftara;
  }
  if (fk.reason?.M) {
    item.maftir = fk.fullkriyah.M;
  }
  return item;
}

const parshaDateRe = /^([^\d]+)-(\d+)$/;

export async function parshaDetail(ctx) {
  const base0 = getBaseFromPath(ctx);
  const base = base0.toLowerCase();
  const matches = base.match(parshaDateRe);
  const date = matches?.[2];
  const parshaAnchor = matches === null ? base : matches[1];
  const parshaName0 = sedrot.get(parshaAnchor);
  if (typeof parshaName0 !== 'string') {
    const candidate = lookupParshaAlias(parshaAnchor);
    if (candidate) {
      if (date && date.length === 8) {
        httpRedirect(ctx, `/sedrot/${candidate}-${date}?redir=spelling`);
      } else {
        httpRedirect(ctx, `/sedrot/${candidate}?redir=spelling`);
      }
      return;
    }
    throw createError(404, `Parsha not found: ${base0}`);
  }
  const q = ctx.request.query;
  const il = q.i === 'on';
  const iSuffix = il ? '?i=on' : '';
  if (date && date.length !== 8) {
    httpRedirect(ctx, `/sedrot/${parshaAnchor}${iSuffix}`);
    return;
  }
  if (!empty(q.gy)) {
    const year = parseInt(q.gy, 10);
    if (year >= 1000 && year <= 9999) {
      const events = HebrewCalendar.calendar({year, il, sedrot: true, noHolidays: true});
      const parshaEv = findParshaEvent(events, parshaName0, il);
      if (parshaEv) {
        const dateStr = dayjs(parshaEv.getDate().greg()).format('YYYYMMDD');
        const anchor = makeAnchor(parshaEv.getDesc().substring(9));
        httpRedirect(ctx, `/sedrot/${anchor}-${dateStr}${iSuffix}`);
        return;
      }
    }
    httpRedirect(ctx, `/sedrot/${parshaAnchor}${iSuffix}`);
    return;
  }
  if (date) {
    const dt = parse8digitDateStr(date);
    if (dt.getFullYear() > ctx.launchDate.getFullYear() + 1000) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}${iSuffix}`);
      return;
    }
  }
  const parshaEv = getParshaEvent(il, date, parshaName0);
  if (!parshaEv) {
    if (date) {
      httpRedirect(ctx, `/sedrot/${parshaAnchor}${iSuffix}`);
      return;
    }
    throw createError(500, `Internal error: ${parshaName0}`);
  }
  if (base0 !== base) {
    // fix capitalization
    httpRedirect(ctx, `/sedrot/${base}${iSuffix}`);
    return;
  }
  const parshaName = date ? parshaEv.getDesc().substring(9) : parshaName0;
  const parsha = lookupParshaMeta(parshaName);
  const items15map = il ? items15yrIsrael : items15yrDiaspora;
  const items = items15map.get(parshaName);
  const reading = date ?
    getLeyningForParshaHaShavua(parshaEv, il) :
    getLeyningForParsha(parshaName);
  if (date && parshaName === VEZOT_HABERAKHAH) {
    for (let i = 1; i <= 6; i++) {
      delete reading.reason[i];
    }
    delete reading.reason.haftara;
  }
  addLinksToLeyning(reading.fullkriyah, false);
  reading.haftaraHtml = makeLeyningHtmlFromParts(reading.haft);
  if (reading.seph) {
    reading.sephardicHref = sefariaAliyahHref(reading.seph, false);
  }
  if (reading.weekday) {
    addLinksToLeyning(reading.weekday, false);
    for (const aliyah of Object.values(reading.weekday)) {
      aliyah.href = aliyah.href.replace('&aliyot=1', '&aliyot=0');
    }
  }
  if (reading.summaryParts) {
    reading.torahHtml = makeLeyningHtmlFromParts(reading.summaryParts);
  }
  parsha.haftaraHtml = makeLeyningHtmlFromParts(parsha.haft);
  const hd = parshaEv.getDate();
  const hyear = hd.getFullYear();
  makePrevNext(parsha, date, hd, il);
  const hasTriennial = hyear >= 5744;
  const triennial = hasTriennial ? makeTriennial(date, parshaEv, hyear, parshaName, il) : {};
  const titleYear = date ? ' ' + hyear : '';
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
  const commentary = {};
  if (parsha.combined) {
    const [p1] = parsha.name.split('-');
    Object.assign(commentary, drash[p1]);
  }
  // doubled parsha overwrites first half
  Object.assign(commentary, drash[parsha.name]);
  await ctx.render('parsha-detail', {
    title: `${parsha.name}${titleYear} - Torah Portion - Hebcal`,
    parsha,
    parshaName: parsha.name.replace(/'/g, '’'),
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
    commentary,
    summary: parsha.summaryHtml,
    translations,
    doubled,
  });
}

function makePrevNext(parsha, date, hd, il) {
  const prevNum = parsha.num === 1 ? 53 : parsha.combined ? parshaNum.get(parsha.p1) - 2 : parsha.num - 2;
  const nextNum = parsha.num === 54 ? 0 : parsha.combined ? parshaNum.get(parsha.p2) : parsha.num;
  const prevName = parshiot54[prevNum];
  const nextName = parshiot54[nextNum];
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
    const iSuffix = il ? '?i=on' : '';
    parsha.prev = prevName && {name: prevName,
      anchor: makeAnchor(prevName) + iSuffix};
    parsha.next = nextName && {name: nextName,
      anchor: makeAnchor(nextName) + iSuffix};
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
  const iSuffix = ev.il ? '?i=on' : '';
  return {anchor: desc + '-' + dateStr + iSuffix, d, ev, name};
}

function makeTriennial(date, parshaEv, hyear, parshaName, il) {
  if (date) {
    const reading = getTriennialForParshaHaShavua(parshaEv, il);
    if (parshaName === VEZOT_HABERAKHAH) {
      for (let i = 1; i <= 6; i++) {
        delete reading.aliyot[i].reason;
      }
    }
    const triennial = {
      reading: reading.aliyot,
      yearNum: reading.yearNum + 1,
      fullParsha: reading.fullParsha,
      hyear: hyear,
    };
    if (reading.haft) {
      triennial.haftara = reading.haftara;
      triennial.haftaraHtml = makeLeyningHtmlFromParts(reading.haft);
      triennial.haftaraNumV = reading.haftaraNumV;
    }
    addLinksToLeyning(triennial.reading, false);
    for (const aliyah of Object.values(triennial.reading)) {
      aliyah.href = aliyah.href.replace('aliyot=1', 'aliyot=0');
    }
    return triennial;
  }
  const triennial = {};
  const startYear = Triennial.getCycleStartYear(hyear);
  const tri = getTriennial(startYear, il);
  triennial.readings = Array(3);
  for (let yr = 0; yr < 3; yr++) {
    const reading = makeTriReading(tri, yr, parshaName, il);
    reading.hyear = startYear + yr;
    triennial.readings[yr] = reading;
  }
  return triennial;
}

function makeTriReading(tri, yr, parshaName, il) {
  const triReading = tri.getReading(parshaName, yr);
  if (triReading.readSeparately) {
    triReading.p1d = dayjs(triReading.date1.greg());
    triReading.p2d = dayjs(triReading.date2.greg());
    return triReading;
  } else if (triReading.readTogether) {
    triReading.d = dayjs(triReading.date.greg());
    triReading.anchor = makeAnchor(triReading.readTogether);
    return triReading;
  }
  const hd = triReading.date;
  const ev = new ParshaEvent(hd, [parshaName], il);
  const triReading2 = getTriennialForParshaHaShavua(ev, il);
  addLinksToLeyning(triReading2.aliyot, false);
  for (const aliyah of Object.values(triReading2.aliyot)) {
    aliyah.href = aliyah.href.replace('aliyot=1', 'aliyot=0');
    if (parshaName === VEZOT_HABERAKHAH) {
      delete aliyah.reason;
    }
  }
  triReading2.d = dayjs(hd.greg());
  addSpecialHaftarahToTriennial(ev, triReading2, il);
  return triReading2;
}

function addSpecialHaftarahToTriennial(ev, triReading2, il) {
  const parshaName = ev.parsha[0];
  if (parshaName === VEZOT_HABERAKHAH) {
    return;
  }
  const fk = getLeyningForParshaHaShavua(ev, il);
  if (fk.reason?.haftara) {
    triReading2.haftara = fk.haftara;
    triReading2.haftaraHtml = makeLeyningHtmlFromParts(fk.haft);
    triReading2.haftaraNumV = fk.haftaraNumV;
    triReading2.reason = triReading2.reason || {};
    triReading2.reason.haftara = fk.reason.haftara;
  } else if (triReading2.haft) {
    triReading2.haftaraHtml = makeLeyningHtmlFromParts(triReading2.haft);
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
