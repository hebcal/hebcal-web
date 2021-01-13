import {flags, HDate, HebrewCalendar} from '@hebcal/core';
import holidayMeta from './holidays.json';
import {makeAnchor} from '@hebcal/rest-api';

export const holidays = new Map();
for (const key of Object.keys(holidayMeta)) {
  holidays.set(makeAnchor(key), key);
}

const events11years = HebrewCalendar.calendar({
  year: new HDate().getFullYear() - 1,
  isHebrewYear: true,
  numYears: 11,
});
export const events11yearsBegin = getFirstOcccurences(events11years);

export const categories = {
  major: {id: 'major-holidays', name: 'Major holidays', flags: 0},
  minor: {id: 'minor-holidays', name: 'Minor holidays', flags: 0},
  fast: {id: 'minor-fasts', name: 'Minor fasts', flags: flags.MINOR_FAST},
  modern: {id: 'modern-holidays', name: 'Modern holidays', flags: flags.MODERN_HOLIDAY},
  shabbat: {id: 'special-shabbatot', name: 'Special Shabbatot', flags: flags.SPECIAL_SHABBAT},
  roshchodesh: {id: 'rosh-chodesh', name: 'Rosh Chodesh', flags: flags.ROSH_CHODESH},
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
