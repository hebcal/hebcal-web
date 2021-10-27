import dayjs from 'dayjs';
import {flags, HDate, HebrewCalendar} from '@hebcal/core';
import holidayMeta from './holidays.json';
import {makeAnchor} from '@hebcal/rest-api';
import {getSedra} from './common';

export const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

const events11years = HebrewCalendar.calendar({
  year: new HDate().getFullYear() - 1,
  isHebrewYear: true,
  numYears: 8,
});
export const events11yearsBegin = getFirstOcccurences(events11years);

export const categories = {
  major: {id: 'major-holidays', name: 'Major holidays'},
  minor: {id: 'minor-holidays', name: 'Minor holidays'},
  fast: {id: 'minor-fasts', name: 'Minor fasts'},
  modern: {id: 'modern-holidays', name: 'Modern holidays'},
  shabbat: {id: 'special-shabbatot', name: 'Special Shabbatot'},
  roshchodesh: {id: 'rosh-chodesh', name: 'Rosh Chodesh'},
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

const OMER_TITLE = 'Days of the Omer';
holidayDurationIL[OMER_TITLE] = 49;

const holidayDurationDiaspora = Object.assign({}, holidayDurationIL, {Pesach: 8, Shavuot: 2});

/**
 * @param {boolean} il
 * @param {number} mask
 * @param {string} holiday
 * @return {number}
 */
export function getHolidayDuration(il, mask, holiday) {
  if (mask & flags.MINOR_FAST ||
      holiday === 'Leil Selichot' ||
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
 * @return {string}
 */
function hebrewDateRange(hd, duration) {
  if (duration <= 1) {
    return hd.toString();
  }
  const end = new HDate(hd.abs() + duration - 1);
  const startMonth = hd.getMonthName();
  const startMday = hd.getDate();
  const endMonth = end.getMonthName();
  if (startMonth === endMonth) {
    return `${startMday}-${end.getDate()} ${startMonth} ${hd.getFullYear()}`;
  }
  return `${startMday} ${startMonth} - ${end.toString()}`;
}

/**
 * @param {Event} ev
 * @param {boolean} il
 * @return {any}
 */
export function eventToHolidayItem(ev, il) {
  const holiday = ev.basename();
  const mask = ev.getFlags();
  const duration0 = getHolidayDuration(il, mask, holiday);
  const beginsWhen = holiday === 'Leil Selichot' ? 'after nightfall' :
    duration0 === 0 ? 'at dawn' : 'at sundown';
  const hd = ev.getDate();
  const d0 = dayjs(hd.greg());
  const d = beginsWhen === 'at sundown' ? d0.subtract(1, 'd') : d0;
  const duration = Boolean(mask & flags.ROSH_CHODESH) && hd.getDate() === 30 ? 2 : duration0;
  const item = {
    name: holiday,
    mask,
    id: makeAnchor(holiday),
    hd,
    beginsWhen,
    d,
    duration,
    endD: d.add(duration, 'd'),
    hdRange: hebrewDateRange(hd, duration),
    desc: ev.render(),
    basename: ev.basename(),
    endAbs: duration ? hd.abs() + duration - 1 : hd.abs(),
    event: ev,
  };
  if (mask & flags.SPECIAL_SHABBAT) {
    const sedra = getSedra(hd.getFullYear(), il);
    const parsha0 = sedra.lookup(hd);
    if (!parsha0.chag) {
      item.parsha = parsha0.parsha;
    }
  }
  return item;
}
