/* eslint-disable require-jsdoc */
import {flags, greg, HDate, HebrewCalendar, Locale, months, Event, ParshaEvent} from '@hebcal/core';
import {getLeyningKeyForEvent, getLeyningForHolidayKey, getLeyningForHoliday,
  getLeyningForParshaHaShavua, hasFestival} from '@hebcal/leyning';
import {addLinksToLeyning, makeLeyningHtmlFromParts} from './parshaCommon';
import {getHolidayDescription, makeAnchor} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import {empty, httpRedirect, wrapHebrewInSpans, langNames, off, getBaseFromPath} from './common';
import {categories, holidays, israelOnly, getFirstOcccurences, eventToHolidayItem,
  wrapDisplaySpans, OMER_TITLE, appendPeriod, makeEventJsonLD} from './holidayCommon';
import holidayMeta from './holidays.json';
import {distance, closest} from 'fastest-levenshtein';
import probe from 'probe-image-size';
import fs from 'fs';

const holidayYearRe = /^([^\d]+)-(\d+)$/;

const holidayAlias = new Map();
for (const [holiday, meta] of Object.entries(holidayMeta)) {
  const anchor = makeAnchor(holiday);
  const href = meta.wikipedia?.href;
  if (href) {
    const article0 = decodeURIComponent(basename(href));
    const hash = article0.indexOf('#');
    const article = hash === -1 ? article0 : article0.substring(hash + 1);
    const wname = makeAnchor(article).replace(/_/g, '-');
    if (wname !== anchor) {
      holidayAlias.set(wname, anchor);
    }
  }
}

/**
 * @param {Event[]} events
 * @param {string} holiday
 * @param {boolean} il
 * @return {any[]}
 */
function makeOccursOn(events, holiday, il) {
  const nowAbs = greg.greg2abs(new Date());
  const occursOn = events
      .filter((ev) => holiday === ev.basename())
      .map((ev) => eventToHolidayItem(ev, il));
  for (const item of occursOn) {
    item.ppf = item.endAbs < nowAbs ? 'past' : 'future';
  }
  return occursOn;
}

const allHolidays = Array.from(holidays.keys());

function myRedir(ctx, anchor, year) {
  const slug = year ? `${anchor}-${year}` : anchor;
  return httpRedirect(ctx, `/holidays/${slug}?redir=spelling`);
}

export async function holidayDetail(ctx) {
  const base0 = getBaseFromPath(ctx);
  const baseLc = base0.toLowerCase();
  const base = baseLc.endsWith('.html') ? baseLc.substring(0, baseLc.length - 5) : baseLc;
  const matches = base.match(holidayYearRe);
  const dateSuffix = matches?.[2];
  const year = dateSuffix ? (dateSuffix.length === 8 ? +dateSuffix.substring(0, 4) : +dateSuffix) : null;
  const base1 = matches === null ? base : matches[1];
  const holiday = holidays.get(base1);
  if (typeof holiday !== 'string') {
    const str1 = makeAnchor(base1).replace(/_/g, '-');
    const alias = holidayAlias.get(str1);
    if (alias) {
      return myRedir(ctx, alias, year);
    }
    const candidate = closest(str1, allHolidays);
    const editDist = distance(str1, candidate);
    if (editDist <= 2) {
      return myRedir(ctx, candidate, year);
    }
    throw createError(404, `Holiday not found: ${base0}`);
  }
  const holidayAnchor = makeAnchor(holiday);
  if (year && (year < 100 || year > 9999)) {
    httpRedirect(ctx, `/holidays/${holidayAnchor}`);
    return;
  }
  if (base0 !== base) {
    // fix capitalization
    httpRedirect(ctx, `/holidays/${base}`);
    return;
  }
  const il = ctx.state.il;
  const q = ctx.request.query;
  if (!empty(q.gy)) {
    const year = parseInt(q.gy, 10);
    if (year >= 1000 && year <= 9999) {
      httpRedirect(ctx, `/holidays/${holidayAnchor}-${year}`);
      return;
    }
  }
  if (doIsraelRedir(ctx, holiday)) {
    // It's Shalosh regalim and the URL doesn't have i=on/off
    ctx.set('Cache-Control', 'private, max-age=0');
    const rpath = ctx.request.path;
    const suffix = (q.amp === '1') ? '?i=on&amp=1' : '?i=on';
    httpRedirect(ctx, rpath + suffix, 302);
    return;
  }
  const meta = await getHolidayMeta(holiday);
  const holidayBegin = getHolidayBegin(holiday, year, il);
  const occursOn = makeOccursOn(holidayBegin, holiday, il);
  if (holiday === OMER_TITLE) {
    for (const item of occursOn) {
      item.href = '/omer/' + item.hd.getFullYear();
    }
  }
  const next = dateSuffix?.length === 8 ?
    occursOn.find((item) => item.d.format('YYYYMMDD') === dateSuffix) :
    year ? occursOn.find((item) => item.d.year() === year) :
      occursOn.find((item) => item.ppf === 'future');
  if (typeof next === 'undefined') {
    httpRedirect(ctx, `/holidays/${holidayAnchor}`);
    return;
  }
  const cats = next.categories;
  const category0 = cats.length === 1 ? cats[0] : cats[1];
  const category = categories[category0] || categories.minor;
  next.ppf = 'current';
  makeHolidayReadings(meta, holiday, year, il, next);
  const [nextObserved, nextObservedHtml] = makeNextObserved(next, year, il);
  const descrShort = getHolidayDescription(next.event, true);
  const descrMedium0 = getHolidayDescription(next.event, false);
  const descrMedium = appendPeriod(descrMedium0);
  const sentences = descrMedium0.split(/\.\s+/).slice(0, 2);
  const descFirstTwo = appendPeriod(sentences.join('. '));
  const descrLong = appendPeriod(meta.about.text || meta.wikipedia?.text) || descrMedium;
  const hebrew = Locale.gettext(holiday, 'he');
  const title = makePageTitle(holiday, year, il, descrShort);
  const now = new Date();
  const today = dayjs(now);
  const noindex = Boolean(year && (year <= 1752 || year > now.getFullYear() + 100));
  const upcomingHebrewYear = next.hd.getFullYear();
  const translations0 = Object.keys(langNames)
      .map((lang) => Locale.lookupTranslation(holiday, lang))
      .filter((s) => typeof s === 'string')
      .concat(holiday);
  const translations = Array.from(new Set(translations0)).sort();
  const jsonLD = makeJsonLD(noindex, year, next.event, il, meta);
  await ctx.render('holidayDetail', {
    title,
    year,
    holiday,
    holidayAnchor,
    hebrew,
    descrShort: descrShort.replace(/'/g, '’'),
    descrMedium: descrMedium.replace(/'/g, '’'),
    descFirstTwo: descFirstTwo.replace(/'/g, '’'),
    descrLong: wrapHebrewInSpans(descrLong).replace(/'/g, '’'),
    categoryId: category.id,
    categoryName: category.name,
    currentItem: next,
    nextObserved,
    nextObservedHtml,
    upcomingHebrewYear,
    occursOn,
    meta,
    noindex,
    today,
    jsonLD,
    il,
    chanukahItems: holiday === 'Chanukah' ? makeChanukahItems(upcomingHebrewYear) : null,
    translations,
    emoji: holiday === 'Chanukah' ? '🕎' : (next.event.getEmoji() || ''),
    amp: (q.amp === '1') ? true : undefined,
  });
}

const shaloshRegalim = {Sukkot: true, Pesach: true, Shavuot: true};

function makePageTitle(holiday, year, il, descrShort) {
  const hebrew = Locale.gettext(holiday, 'he');
  const titleHebrew = Locale.hebrewStripNikkud(hebrew);
  const titleYear = year ? ' ' + year : '';
  const ilDiaspora = holiday === 'Pesach' || holiday === 'Shavuot' ?
    (il ? ' (Israel)' : ' (Diaspora)') : '';
  return `${holiday}${ilDiaspora}${titleYear} - ${descrShort} - ${titleHebrew} - Hebcal`;
}

function makeJsonLD(noindex, year, ev, il, meta) {
  if (noindex) {
    return null;
  }
  if (year) {
    return makeEventJsonLD(ev, meta, il);
  }
  if (meta.photo) {
    return makeArticleJsonLD(ev, meta);
  }
  return null;
}

const holidayYearRange = {
  'Birkat Hachamah': [80, 160],
  'Purim Meshulash': [20, 48],
  'Rosh Chodesh Adar': [5, 12],
  'Rosh Chodesh Adar I': [7, 20],
  'Rosh Chodesh Adar II': [7, 20],
  'Purim Katan': [7, 20],
  'Shushan Purim Katan': [7, 20],
};

function getHolidayBegin(holiday, year, il) {
  if (holiday === OMER_TITLE) {
    return makeOmerEvents(year);
  }
  year = year || new Date().getFullYear();
  const range = holidayYearRange[holiday] || [3, 8];
  const startYear = year - range[0];
  const numYears = range[1];
  const events0 = HebrewCalendar.calendar({
    year: startYear,
    isHebrewYear: false,
    numYears,
    yomKippurKatan: true,
    il,
  });
  const events = events0.filter((ev) => ev.basename() === holiday);
  return getFirstOcccurences(events);
}

function doIsraelRedir(ctx, holiday) {
  const qi = ctx.request.query.i;
  if (israelOnly.has(holiday) && qi !== 'on') {
    return true;
  }
  if (!empty(qi) || !shaloshRegalim[holiday]) {
    return false;
  }
  const cookieStr = ctx.cookies.get('C');
  if (!cookieStr) {
    return false;
  }
  const ck = new URLSearchParams(cookieStr);
  return !off(ck.get('i'));
}

/**
 * @param {any} item
 * @param {number} year
 * @param {boolean} il
 * @return {string[]}
 */
function makeNextObserved(item, year, il) {
  const now = dayjs();
  const isPast = year ? !item.d.isSameOrAfter(now, 'd') : false;
  const verb = isPast ? (item.duration ? 'began' : 'occurred') : (item.duration ? 'begins' : 'occurs');
  const dateStrShort = item.d.format('D-MMM-YYYY');
  const beginsWhen = isPast ? '' : ` ${item.beginsWhen}`;
  const where = (item.basename === 'Shavuot' || item.basename === 'Pesach') ?
    (il ? ' in Israel 🇮🇱' : ' in the Diaspora') : '';
  const nextObserved = `${verb}${where}${beginsWhen} on ${dateStrShort}`;
  const dateStrLong = item.d.format('dddd, D MMMM YYYY');
  // eslint-disable-next-line max-len
  const nextObservedHtml = `${verb}${where}${beginsWhen} on <strong class="text-burgundy"><time datetime="${item.startIsoDate}">${dateStrLong}</time></strong>`;
  if (!item.duration) {
    return [nextObserved, nextObservedHtml];
  }
  const end = item.endD;
  const isPast2 = year ? !end.isSameOrAfter(now, 'd') : false;
  const endVerb = isPast2 ? 'ended' : 'ends';
  const endWhen = isPast2 ? '' : ' at nightfall';
  const endObservedPrefix = ` and ${endVerb}${endWhen} on `;
  const endObserved = endObservedPrefix + end.format('D-MMM-YYYY');
  const endObservedHtml = endObservedPrefix + `<strong class="text-burgundy"><time datetime="${item.endIsoDate}">` +
    end.format('dddd, D MMMM YYYY') + '</time></strong>';
  return [nextObserved + endObserved, nextObservedHtml + endObservedHtml];
}

function makeOmerEvents(year) {
  const events = [];
  const hy = year ? year + 3757 : new HDate().getFullYear() - 1;
  for (let i = 0; i < 11; i++) {
    const hd = new HDate(16, months.NISAN, hy + i);
    events.push(new Event(hd, OMER_TITLE, flags.OMER_COUNT, {emoji: '㊾'}));
  }
  return events;
}

const KEYCAP_DIGITS = [
  '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣',
  '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣',
];

/**
 * @param {number} hyear
 * @return {any[]}
 */
function makeChanukahItems(hyear) {
  const nowHd = new HDate();
  if (hyear < nowHd.getFullYear()) {
    return null;
  }
  const nowAbs = nowHd.abs();
  const events = HebrewCalendar.calendar({year: hyear, isHebrewYear: true, il: false});
  const items = events
      .filter((ev) => ev.basename() === 'Chanukah')
      .map((ev) => {
        const hd = ev.getDate();
        const d = dayjs(hd.greg());
        const dow = hd.getDay();
        const when = dow === 5 ? 'before sundown' : dow === 6 ? 'at nightfall' : 'at dusk';
        const candles = typeof ev.chanukahDay === 'number' ? ev.chanukahDay + 1 : 1;
        const abs = hd.abs();
        const ppf = abs === nowAbs ? 'current' : abs < nowAbs ? 'past' : 'future';
        return {
          hd,
          d,
          candles,
          when,
          ppf,
          desc: ev.render('en'),
          event: ev,
          digit: KEYCAP_DIGITS[candles],
          monthDayHtml: wrapDisplaySpans('sm', d.format('MMM D'), d.format('MMMM D')),
        };
      });
  items[8].day8 = true;
  return items;
}

/**
 * @param {any} meta
 * @param {string} holiday
 * @param {number} year
 * @param {boolean} il
 * @param {any} next
 */
function makeHolidayReadings(meta, holiday, year, il, next) {
  meta.reading = meta.reading || {};
  if (year) {
    const events = HebrewCalendar.calendar({
      year: next.event.getDate().getFullYear(),
      isHebrewYear: true,
      il,
      yomKippurKatan: true,
    }).filter((ev) => holiday === ev.basename());
    meta.items = [];
    const dupes = new Set(); // for Rosh Chodesh day 2
    for (const ev of events) {
      const reading = getReadingForHoliday(ev, il);
      if (typeof reading !== 'undefined') {
        const desc = ev.getDesc();
        const key0 = getLeyningKeyForEvent(ev, il) || desc;
        const key1 = (ev.getFlags() & flags.ROSH_CHODESH) ? desc : key0;
        const key = dupes.has(key1) ? key1 + ' Day 2' : key1;
        meta.items.push(key);
        dupes.add(key);
        makeHolidayReading(holiday, key, meta, reading, ev, il);
        const hd = reading.hd = ev.getDate();
        reading.d = dayjs(hd.greg());
        // Add Mincha reading if available
        const minchaKey0 = key0 + ' (Mincha)';
        const minchaKey1 = desc + ' (Mincha)';
        const readingMincha1 = getLeyningForHolidayKey(minchaKey1);
        const readingMincha = readingMincha1 || getLeyningForHolidayKey(minchaKey0);
        if (readingMincha) {
          const minchaKey = readingMincha1 ? minchaKey1 : minchaKey0;
          meta.items.push(minchaKey);
          makeHolidayReading(holiday, minchaKey, meta, readingMincha, ev, il);
          readingMincha.hd = reading.hd;
          readingMincha.d = reading.d;
        }
      }
    }
    if (meta.items.length === 0) {
      delete meta.items;
    }
  } else {
    if (typeof meta.items === 'undefined' && hasFestival(holiday)) {
      meta.items = [holiday];
    }
    if (Array.isArray(meta.items)) {
      for (const item of meta.items) {
        const reading = getLeyningForHolidayKey(item);
        if (typeof reading !== 'undefined') {
          makeHolidayReading(holiday, item, meta, reading);
        }
      }
    }
  }
  if (Object.keys(meta.reading).length === 0) {
    delete meta.reading;
  }
}

/**
 * @param {string} holiday
 * @param {string} item
 * @param {any} meta
 * @param {Leyning} reading
 * @param {Event} ev
 * @param {boolean} il
 */
function makeHolidayReading(holiday, item, meta, reading, ev, il) {
  if (reading.fullkriyah) {
    addLinksToLeyning(reading.fullkriyah, true);
  }
  if (reading.megillah) {
    addLinksToLeyning(reading.megillah, true);
  }
  const itemReading = meta.reading[item] = reading;
  const hebrew = Locale.lookupTranslation(item, 'he');
  if (typeof hebrew === 'string') {
    itemReading.hebrew = hebrew;
  } else if (typeof ev === 'object') {
    itemReading.hebrew = ev.render('he');
  }
  itemReading.id = makeAnchor(item);
  if (itemReading.summaryParts) {
    itemReading.torahHtml = makeLeyningHtmlFromParts(itemReading.summaryParts);
  } else if (itemReading.summary) {
    const matches = itemReading.summary.match(/^([^\d]+)(\d.+)$/);
    const book = matches[1].trim();
    const verses = matches[2].replace(/:/g, '.').replace(/\s/g, '');
    itemReading.torahHref = `https://www.sefaria.org/${book}.${verses}?lang=bi`;
  }
  if (itemReading.haft) {
    itemReading.haftaraHtml = makeLeyningHtmlFromParts(itemReading.haft);
  }
  if (itemReading.seph) {
    itemReading.sephardicHtml = makeLeyningHtmlFromParts(itemReading.seph);
  }
  if (item.endsWith(' (Mincha)')) {
    itemReading.shortName = 'Mincha';
  } else if (item.startsWith(holiday)) {
    if (meta.items.length === 1 || item === holiday) {
      itemReading.shortName = 'Tanakh';
    } else if (item.startsWith(holiday) && item.indexOf('Chol ha-Moed') !== -1) {
      itemReading.shortName = item.substring(holiday.length + 1);
    } else if (item.startsWith(`${holiday} Day`)) {
      itemReading.shortName = item.substring(holiday.length + 1);
    } else {
      itemReading.shortName = 'Day ' + item.substring(holiday.length + 1);
    }
  } else {
    itemReading.shortName = item;
  }
  if (ev && ev.getDate().getDay() === 6) {
    const hd = ev.getDate();
    const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
    const parsha = sedra.lookup(hd);
    if (!parsha.chag) {
      itemReading.parsha = parsha.parsha;
    }
  }
}

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {Leyning}
 */
function getReadingForHoliday(ev, il) {
  const hd = ev.getDate();
  const dow = hd.abs() % 7;
  const desc = ev.getDesc();
  if (desc === 'Chanukah: 1 Candle') {
    return undefined;
  }
  const reading = getLeyningForHoliday(ev, il);
  if (reading && dow === 6) {
    const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
    const parsha = sedra.lookup(hd);
    if (!parsha.chag) {
      const pe = new ParshaEvent(hd, parsha.parsha, il);
      return getLeyningForParshaHaShavua(pe, il);
    }
  }
  return reading;
}

const primarySource = {
  'hebcal.com': 'Hebcal',
  'jewfaq.org': 'Judaism 101',
  'en.wikipedia.org': 'Wikipedia',
};

function sourceName(href) {
  const slashslash = href.indexOf('//');
  const endSlash = href.indexOf('/', slashslash + 2);
  const domain0 = href.substring(slashslash + 2, endSlash);
  const domain = domain0.startsWith('www.') ? domain0.substring(4) : domain0;
  return primarySource[domain] || domain;
}

async function getHolidayMeta(holiday) {
  const meta0 = holidayMeta[holiday];
  if (typeof meta0 === 'undefined' || typeof meta0.about.href === 'undefined') {
    throw createError(500, `Internal error; broken configuration for: ${holiday}`);
  }
  const meta = Object.assign({}, meta0);
  meta.about.name = sourceName(meta.about.href);
  if (meta.wikipedia?.href) {
    meta.wikipedia.title = decodeURIComponent(basename(meta.wikipedia.href)).replace(/_/g, ' ');
    const anchorIdx = meta.wikipedia.title.indexOf('#');
    if (anchorIdx !== -1) {
      meta.wikipedia.title = meta.wikipedia.title.substring(anchorIdx + 1);
    }
  }
  if (Array.isArray(meta.books)) {
    for (const book of meta.books) {
      const colon = book.text.indexOf(':');
      book.shortTitle = colon === -1 ? book.text.trim() : book.text.substring(0, colon).trim();
      try {
        const path = '/var/www/html/i/' + book.ASIN + '.01.MZZZZZZZ.jpg';
        const rs = fs.createReadStream(path);
        book.dimensions = await probe(rs);
      } catch (err) {
        // ignore file not found
      }
    }
  }
  /*
  if (meta.photo) {
    meta.photo.dimensions = {};
    const a = {};
    for (const size of [400, 640, 800, 1024, '1x1', '4x3', '16x9']) {
      try {
        const path = '/var/www/html/i/is/' + size + '/' + meta.photo.fn;
        const rs = fs.createReadStream(path);
        meta.photo.dimensions[size] = await probe(rs);
        a[size] = {width: meta.photo.dimensions[size].width, height: meta.photo.dimensions[size].height};
      } catch (err) {
      // ignore file not found
      }
    }
    console.log(holiday);
    console.log(JSON.stringify(a, null, 1));
  }
  */
  return meta;
}

/**
 * @param {Event} ev
 * @param {any} meta
 * @return {any}
 */
function makeArticleJsonLD(ev, meta) {
  const descrShort = getHolidayDescription(ev, true);
  const descrMedium = getHolidayDescription(ev, false);
  const descrLong = appendPeriod(meta.about.text || meta.wikipedia?.text) || descrMedium;
  const images = ['1x1', '4x3', '16x9'].map((size) => `https://www.hebcal.com/i/is/${size}/${meta.photo.fn}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': ev.basename() + ' - ' + descrShort,
    'description': descrLong,
    'image': images,
    'author': [{
      '@type': 'Organization',
      'name': 'Hebcal',
      'url': 'https://www.hebcal.com/',
    }],
  };
}
