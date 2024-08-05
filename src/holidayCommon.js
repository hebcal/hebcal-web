import dayjs from 'dayjs';
import {flags, HDate, HebrewCalendar} from '@hebcal/core';
import {makeAnchor, getHolidayDescription, getEventCategories} from '@hebcal/rest-api';
import {holidayMeta} from './holidayMeta.js';
import {getNumYears} from './common.js';
import {makeDownloadProps} from './makeDownloadProps.js';

export const holidays = new Map();
export const israelOnly = new Set();

for (const [holiday, meta] of Object.entries(holidayMeta)) {
  holidays.set(makeAnchor(holiday), holiday);
  if (meta.israelOnly) {
    israelOnly.add(holiday);
  }
}

export const categories = {
  major: {id: 'major-holidays', name: 'Major holidays', emoji: '✡️'},
  minor: {id: 'minor-holidays', name: 'Minor holidays', emoji: '✡️'},
  fast: {id: 'minor-fasts', name: 'Minor fasts', emoji: ''},
  modern: {id: 'modern-holidays', name: 'Modern holidays', emoji: '🇮🇱'},
  shabbat: {id: 'special-shabbatot', name: 'Special Shabbatot', emoji: '🕍'},
  roshchodesh: {id: 'rosh-chodesh', name: 'Rosh Chodesh', emoji: '🌒'},
  // mevarchim: {id: 'mevarchim', name: 'Shabbat Mevarchim', emoji: ''},
};

/**
 * @param {Event[]} events
 * @return {Event[]}
 */
export function getFirstOcccurences(events) {
  let prevYear = -1;
  let seen = new Set();
  const result = [];
  for (const ev of events) {
    const hd = ev.getDate();
    const hy = hd.getFullYear();
    if (hy != prevYear) {
      prevYear = hy;
      seen = new Set();
    }
    const subj = ev.getDesc();
    if (subj.startsWith('Erev ') ||
      (subj.startsWith('Chanukah: ') && subj != 'Chanukah: 2 Candles')) {
      continue;
    }
    const holiday = ev.basename();
    if (seen.has(holiday)) {
      continue;
    }
    seen.add(holiday);
    result.push(ev);
  }
  return result;
}

// Don't include any 1-day duration holidays (it's the default)
const holidayDurationIL = {
  'Rosh Hashana': 2,
  'Chanukah': 8,
  'Sukkot': 7,
  'Pesach': 7,
};

export const OMER_TITLE = 'Days of the Omer';
holidayDurationIL[OMER_TITLE] = 49;

const holidayDurationDiaspora = {
  ...holidayDurationIL,
  'Pesach': 8,
  'Shavuot': 2,
  'Shmini Atzeret & Simchat Torah': 2,
};

/**
 * @param {boolean} il
 * @param {number} mask
 * @param {string} holiday
 * @return {number}
 */
export function getHolidayDuration(il, mask, holiday) {
  if (mask & flags.MINOR_FAST ||
      mask & flags.SHABBAT_MEVARCHIM ||
      holiday === 'Leil Selichot' ||
      holiday === 'Birkat Hachamah' ||
      holiday === 'Yom HaAliyah School Observance') {
    return 0;
  }
  const duration = il ? holidayDurationIL : holidayDurationDiaspora;
  const days = duration[holiday] || 1;
  return days;
}

/**
 * @param {HDate} hd
 * @param {number} duration
 * @param {boolean} showYear
 * @return {string}
 */
function hebrewDateRange(hd, duration, showYear=true) {
  const startMonth = hd.getMonthName().replace(/'/g, '’');
  const startMday = hd.getDate();
  const yearSuffix = showYear ? ' ' + hd.getFullYear() : '';
  if (duration <= 1) {
    return `${startMday} ${startMonth}${yearSuffix}`;
  }
  const end = new HDate(hd.abs() + duration - 1);
  const endMonth = end.getMonthName().replace(/'/g, '’');
  const endMday = end.getDate();
  if (startMonth === endMonth) {
    return `${startMday}-${endMday} ${startMonth}${yearSuffix}`;
  }
  return `${startMday} ${startMonth} - ${endMday} ${endMonth}${yearSuffix}`;
}

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {any}
 */
export function eventToHolidayItemBase(ev, il) {
  const {hd, d, duration, endD, beginsWhen} = holidayStartAndEnd(ev, il);
  const holiday = ev.basename();
  const mask = ev.getFlags();
  const emoji = mask & (flags.ROSH_CHODESH | flags.SPECIAL_SHABBAT | flags.MINOR_FAST) ? '' :
    holiday === 'Chanukah' ? '🕎' : (ev.getEmoji() || '');
  const anchor = makeAnchor(holiday);
  const anchorDate = (typeof ev.urlDateSuffix === 'function') ? ev.urlDateSuffix() : d.year();
  if (!il && israelOnly.has(holiday)) {
    il = true;
  }
  const iSuffix = il ? '?i=on' : '';
  const href = anchor + '-' + anchorDate + iSuffix;
  const id = holiday === 'Asara B\'Tevet' ? anchor + '-' + anchorDate : anchor;
  const item = {
    name: holiday,
    mask,
    id,
    href,
    hd,
    beginsWhen,
    d,
    startIsoDate: d.format('YYYY-MM-DD'),
    duration,
    endD,
    desc: ev.render('en'),
    basename: ev.basename(),
    endAbs: duration ? hd.abs() + duration - 1 : hd.abs(),
    event: ev,
    emoji,
    anchorDate,
  };
  if (israelOnly.has(holiday)) {
    item.ilOnly = true;
  }
  return item;
}

const staticSpecial = new Set([
  'Shabbat Nachamu', 'Shabbat Shirah', 'Shabbat Chazon',
]);

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {any}
 */
export function eventToHolidayItem(ev, il) {
  const item = eventToHolidayItemBase(ev, il);
  const hd = item.hd;
  const d = item.d;
  const duration = item.duration;
  const endD = item.endD;
  const mask = item.mask;
  Object.assign(item, {
    startDowHtml: wrapDisplaySpans('md', d.format('ddd'), d.format('dddd')),
    startMonDayHtml: wrapDisplaySpans('md', d.format('MMM D'), d.format('MMMM D')),
    endIsoDate: endD.format('YYYY-MM-DD'),
    endDowHtml: wrapDisplaySpans('lg', endD.format('ddd'), endD.format('dddd')),
    endMonDayHtml: wrapDisplaySpans('xl', endD.format('MMM D'), endD.format('MMMM D')),
    hdRange: hebrewDateRange(hd, duration, true),
    hdRangeNoYear: hebrewDateRange(hd, duration, false),
    categories: getEventCategories(ev),
  });
  if ((mask & flags.SPECIAL_SHABBAT) && !staticSpecial.has(item.name)) {
    const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
    const parsha0 = sedra.lookup(hd);
    if (!parsha0.chag) {
      item.parsha = parsha0.parsha;
    }
  }
  return item;
}

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {any}
 */
function holidayStartAndEnd(ev, il) {
  const holiday = ev.basename();
  const mask = ev.getFlags();
  const duration0 = getHolidayDuration(il, mask, holiday);
  const beginsWhen = holiday === 'Leil Selichot' ? 'after nightfall' :
    mask & flags.SHABBAT_MEVARCHIM ? '' :
    duration0 === 0 ? 'at dawn' : 'at sundown';
  const hd = ev.getDate();
  const d0 = dayjs(hd.greg());
  const d = beginsWhen === 'at sundown' ? d0.subtract(1, 'd') : d0;
  const duration = Boolean(mask & flags.ROSH_CHODESH) && hd.getDate() === 30 ? 2 : duration0;
  const endD = d.add(duration, 'd');
  return {mask, holiday, d, hd, beginsWhen, duration, endD};
}

/**
 *
 * @param {string} breakpoint
 * @param {string} short
 * @param {string} long
 * @return {string}
 */
export function wrapDisplaySpans(breakpoint, short, long) {
  return `<span class="d-none d-${breakpoint}-inline text-nowrap">${long}</span>` +
    `<span class="d-inline d-${breakpoint}-none text-nowrap">${short}</span>`;
}

/**
 * @param {string} str
 * @return {string}
 */
export function appendPeriod(str) {
  if (!str) {
    return str;
  }
  if (str.charAt(str.length - 1) !== '.') {
    return str + '.';
  }
  return str;
}

/**
 * @param {Event} ev
 * @param {any} meta
 * @param {boolean} il
 * @return {any}
 */
export function makeEventJsonLD(ev, meta, il) {
  const url = ev.url();
  if (!url) {
    return {};
  }
  const {d, endD} = holidayStartAndEnd(ev, il);
  const description = appendPeriod(getHolidayDescription(ev, false));
  const startIsoDate = d.format('YYYY-MM-DD');
  const endIsoDate = endD.format('YYYY-MM-DD');
  const jsonLD = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': ev.basename() + ' ' + d.year(),
    'startDate': startIsoDate,
    'endDate': endIsoDate,
    'description': description,
    'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
    'location': {
      '@type': 'VirtualLocation',
      'url': url,
    },
  };
  if (meta?.photo) {
    jsonLD.image = ['1x1', '4x3', '16x9'].map((size) => `https://www.hebcal.com/i/is/${size}/${meta.photo.fn}`);
  }
  return jsonLD;
}

export function makeQueryAndDownloadProps(ctx, options) {
  const q = {v: '1', ny: 5, ...ctx.request.query};
  for (const k of ['maj', 'min', 'nx', 'mod', 'mf', 'ss']) {
    q[k] = 'on';
  }
  q.i = ctx.state.il ? 'on' : 'off';
  const year = options.year;
  q.year = String(year);
  const isHebYr = options.isHebrewYear;
  q.yt = isHebYr ? 'H' : 'G';
  makeDownloadProps(ctx, q, options);
  ctx.state.downloadAltTitle = `${year} only`;
  ctx.state.numYears = getNumYears(options);
  const today = isHebYr ? new HDate() : new Date();
  ctx.state.currentYear = today.getFullYear();
  delete ctx.state.filename.pdf;
  return q;
}
