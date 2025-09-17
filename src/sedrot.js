import {HebrewCalendar, HDate, months, ParshaEvent, Locale} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import {getLeyningForParshaHaShavua, getLeyningForParsha, parshaToString, clone} from '@hebcal/leyning';
import {Triennial, getTriennial, getTriennialForParshaHaShavua} from '@hebcal/triennial';
import createError from 'http-errors';
import {empty} from './empty.js';
import {httpRedirect, getBaseFromPath, langNames} from './common.js';
import {makeGregDate} from './dateUtil.js';
import {sedrot, doubled, addLinksToLeyning, makeLeyningHtmlFromParts,
  parshiot54, drash,
  lookupParshaMeta, lookupParshaAlias, parshaNum, doubledParshiyot} from './parshaCommon.js';
import dayjs from 'dayjs';

const VEZOT_HABERAKHAH = 'Vezot Haberakhah';

const YEARS_PRE = 3;
const YEARS_TOTAL = 24;

const options15yr = {
  year: new HDate().getFullYear() - YEARS_PRE,
  isHebrewYear: true,
  numYears: YEARS_TOTAL,
  noHolidays: true,
  sedrot: true,
};
const allEvts15yrIsrael = HebrewCalendar.calendar({il: true, ...options15yr});
const allEvts15yrDiaspora = HebrewCalendar.calendar({il: false, ...options15yr});
const items15yrIsrael = new Map();
const items15yrDiaspora = new Map();
const allParshiot = [].concat(parshiot54, doubledParshiyot);
for (const parshaName of allParshiot) {
  items15yrIsrael.set(parshaName, get15yrEvents(parshaName, true));
  items15yrDiaspora.set(parshaName, get15yrEvents(parshaName, false));
}

function simchatTorahDate(hyear, il) {
  const mday = il ? 22 : 23;
  return new HDate(mday, months.TISHREI, hyear);
}

function makeVezotEvents(il) {
  const startYear = new HDate().getFullYear() - YEARS_PRE;
  const events = [];
  for (let i = 0; i < YEARS_TOTAL; i++) {
    const hyear = startYear + i;
    const hd = simchatTorahDate(hyear, il);
    const pe = new ParshaEvent(hd, [VEZOT_HABERAKHAH], il);
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
  const matches = parshaDateRe.exec(base);
  const date = matches?.[2];
  const parshaAnchor = matches === null ? base : matches[1];
  const parshaName0 = sedrot.get(parshaAnchor);
  if (typeof parshaName0 !== 'string') {
    const candidate = lookupParshaAlias(parshaAnchor);
    if (candidate) {
      if (date?.length === 8) {
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
  const reading = makeReading(date, parshaEv, il, parsha);
  parsha.haftaraHtml = makeLeyningHtmlFromParts(parsha.haft);
  if (parsha.seph) {
    parsha.sephardicHtml = makeLeyningHtmlFromParts(parsha.seph);
  }
  const hd = parshaEv.getDate();
  const hyear = hd.getFullYear();
  makePrevNext(parsha, date, hd, il);
  const hasTriennial = hyear >= 5744;
  const triennial = hasTriennial ? makeTriennial(parsha, date, parshaEv, hyear, il) : {};
  const [israelDiasporaDiffer, otherLocationAnchor, otherLocationParsha] =
    doIsraelDiasporaDiffer(parsha, il, hd, triennial);
  const title = makeTitle(parsha, date ? hyear : 0, israelDiasporaDiffer, il);
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
  let nextRead;
  if (!date) {
    const today = dayjs();
    for (const item of items) {
      const d = item.d;
      if (d.isSame(today, 'd') || d.isAfter(today)) {
        nextRead = item;
        break;
      }
    }
  }
  // doubled parsha overwrites first half
  Object.assign(commentary, drash[parsha.name]);
  await ctx.render('parsha-detail', {
    title,
    parsha,
    parshaName: parsha.name.replace(/'/g, '’'),
    parshaAnchor,
    nextRead,
    reading,
    il,
    iSuffix,
    d: dayjs(hd.greg()),
    hd,
    date,
    hasTriennial,
    triennial,
    israelDiasporaDiffer,
    otherLocationAnchor,
    otherLocationParsha,
    locationName: il ? 'Israel' : 'the Diaspora',
    items,
    commentary,
    summary: parsha.summaryHtml,
    translations,
    doubled,
  });
}

function makeTitle(parsha, hyear, israelDiasporaDiffer, il) {
  let title = parsha.name;
  if (hyear) {
    title += ' ' + hyear;
  }
  if (israelDiasporaDiffer) {
    title += ' - ' + (il ? 'Israel' : 'Diaspora');
  }
  title += ' - Torah Portion - Hebcal';
  return title;
}

function makeReading(date, parshaEv, il, parsha) {
  const parshaName = parsha.name;
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
  if (parsha.combined) {
    for (const aliyah of Object.values(reading.fullkriyah)) {
      aliyah.href = aliyah.href.replace('&aliyot=1', '&aliyot=0');
    }
  }
  reading.haftaraHtml = makeLeyningHtmlFromParts(reading.haft);
  if (reading.seph) {
    reading.sephardicHtml = makeLeyningHtmlFromParts(reading.seph);
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
  return reading;
}

/**
 * @param {string} parshaName
 * @param {HDate} hd
 * @param {boolean} il
 * @return {import('@hebcal/triennial').TriennialAliyot}
 */
function getRawTriennial(parshaName, hd, il) {
  const hyear = hd.getFullYear();
  const tri = getTriennial(hyear, il);
  const startYear = tri.getStartYear();
  const yearNum = hyear - startYear;
  const reading = tri.getReading(parshaName, yearNum);
  const triennial = {
    reading: clone(reading.aliyot),
    yearNum: reading.yearNum + 1,
    fullParsha: reading.fullParsha,
    hyear: hyear,
    variation: reading.variation,
    date: reading.date,
    readSeparately: reading.readSeparately,
    readTogether: reading.readTogether,
  };  
  return triennial;
}

function doTriennialDiffer(a, b) {
  if (a.variation !== b.variation) {
    return true;
  }
  if (a.readSeparately && b.readSeparately) {
    return false;
  }
  return !a.date.isSameDate(b.date);
}

/**
 * @param {any} parsha
 * @param {boolean} il
 * @param {HDate} hd
 * @param {any} triennial
 * @return {[boolean, string, string]}
 */
function doIsraelDiasporaDiffer(parsha, il, hd, triennial) {
  const parshaName = parsha.name;
  const hyear = hd.getFullYear();
  if (parshaName === VEZOT_HABERAKHAH) {
    const otherHD = simchatTorahDate(hyear, !il);
    const anchor = parshaDateAnchor(parshaName, dayjs(otherHD.greg()), !il);
    return [true, anchor, parshaName];
  }
  if (triennial.readings) {
    if (hyear < 5744) {
      return [false, '', ''];
    }
    // compare each  3-year index page
    const otherReadings = make3yearTriennial(hyear, parshaName, !il);
    for (let yr = 0; yr <= 2; yr++) {
      if (doTriennialDiffer(otherReadings[yr], triennial.readings[yr])) {
        return [true, '', ''];
      }
    }
    return [false, '', ''];
  }
  const otherSedra = HebrewCalendar.getSedra(hyear, !il);
  const otherParsha = otherSedra.lookup(hd);
  const otherParshaName = parshaToString(otherParsha.parsha);
  if (parshaName !== otherParshaName) {
    const otherHD = otherSedra.find(parshaName);
    if (otherHD !== null) {
      const anchor = parshaDateAnchor(parshaName, dayjs(otherHD.greg()), !il);
      return [true, anchor, parshaName];
    }
    if (parsha.combined) {
      // it's combined here, but separate in other location
      const [p1] = parshaName.split('-');
      const p1hd = otherSedra.find(p1);
      const anchor = parshaDateAnchor(p1, dayjs(p1hd.greg()), !il);
      return [true, anchor, p1];
    } else {
      // it's separate in this location but combined in the other location
      const pair = doubled.get(parshaName);
      const pairHD = otherSedra.find(pair);
      const anchor = parshaDateAnchor(pair, dayjs(pairHD.greg()), !il);
      return [true, anchor, pair];
    }
  }
  if (hyear < 5744) {
    return [false, '', ''];
  }
  const otherTriennial = getRawTriennial(parshaName, hd, !il);
  if (doTriennialDiffer(otherTriennial, triennial)) {
    const anchor = parshaDateAnchor(parshaName, dayjs(hd.greg()), !il);
    return [true, anchor, parshaName];
  }
  return [false, '', ''];
}

/** @return {number} */
function nextParshaNum(parsha) {
  if (parsha.num === 54) {
    return 0;
  }
  return parsha.combined ? parshaNum.get(parsha.p2) : parsha.num;
}

/** @return {number} */
function prevParshaNum(parsha) {
  if (parsha.num === 1) {
    return 53;
  }
  return parsha.combined ? parshaNum.get(parsha.p1) - 2 : parsha.num - 2;
}

function makePrevNext(parsha, date, hd, il) {
  const prevNum = prevParshaNum(parsha);
  const nextNum = nextParshaNum(parsha);
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
 * @param {string} name
 * @param {dayjs.Dayjs} d
 * @param {boolean} il
 * @return {string}
 */
function parshaDateAnchor(name, d, il) {
  const dateStr = d.format('YYYYMMDD');
  const desc = makeAnchor(name);
  const iSuffix = il ? '?i=on' : '';
  return desc + '-' + dateStr + iSuffix;
}

/**
 * @private
 * @param {Event} ev
 * @return {Object}
 */
function getParshaDateAnchor(ev) {
  const d = dayjs(ev.getDate().greg());
  const name = ev.getDesc().substring(9);
  const anchor = parshaDateAnchor(name, d, ev.il);
  return {anchor: anchor, d, ev, name};
}

function makeTriennial(parsha, date, parshaEv, hyear, il) {
  if (!date) {
    const readings = make3yearTriennial(hyear, parsha.name, il);
    return {readings};
  }
  const reading = getTriennialForParshaHaShavua(parshaEv, il);
  if (parsha.name === VEZOT_HABERAKHAH) {
    for (let i = 1; i <= 6; i++) {
      delete reading.aliyot[i].reason;
    }
  }
  const triennial = {
    reading: clone(reading.aliyot),
    yearNum: reading.yearNum + 1,
    fullParsha: reading.fullParsha,
    hyear: hyear,
    variation: reading.variation,
    date: reading.date,
    readSeparately: reading.readSeparately,
    readTogether: reading.readTogether,
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

/**
 * @param {number} hyear
 * @param {string} parshaName
 * @param {boolean} il
 * @return {any[]}
 */
function make3yearTriennial(hyear, parshaName, il) {
  const startYear = Triennial.getCycleStartYear(hyear);
  const tri = getTriennial(startYear, il);
  const readings = Array(3);
  for (let yr = 0; yr < 3; yr++) {
    const reading = makeTriReading(tri, yr, parshaName, il);
    reading.hyear = startYear + yr;
    readings[yr] = reading;
  }
  return readings;
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
  triReading2.aliyot = clone(triReading2.aliyot);
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
    const hd = simchatTorahDate(hyear, il);
    return new ParshaEvent(hd, [parshaName], il);
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
