import { Zmanim } from '@hebcal/core';
import createError from 'http-errors';

const TIMES = {
  chatzotNight: 1,
  alosBaalHatanya: 1,
  alotHaShachar: 1,
  misheyakir: 1,
  misheyakirMachmir: 1,
  dawn: 1,
  sunrise: 1,
  seaLevelSunrise: 1,
  sofZmanShmaMGA19Point8: 1,
  sofZmanShmaMGA16Point1: 1,
  sofZmanShmaMGA: 1,
  sofZmanShmaBaalHatanya: 1,
  sofZmanShma: 1,
  sofZmanTfillaMGA19Point8: 1,
  sofZmanTfillaMGA16Point1: 1,
  sofZmanTfillaMGA: 1,
  sofZmanTfilaBaalHatanya: 1,
  sofZmanTfilla: 1,
  chatzot: 1,
  minchaGedola: 1,
  minchaGedolaBaalHatanya: 1,
  minchaGedolaMGA: 1,
  minchaKetana: 1,
  minchaKetanaBaalHatanya: 1,
  minchaKetanaMGA: 1,
  plagHaMincha: 1,
  plagHaminchaBaalHatanya: 1,
  seaLevelSunset: 1,
  sunset: 1,
  beinHaShmashos: 1,
  dusk: 1,
  tzaisBaalHatanya: 1,
};

const TZEIT_TIMES = {
  tzeit7083deg: 7.083,
  tzeit85deg: 8.5,
  tzeit42min: 42,
  tzeit50min: 50,
  tzeit72min: 72,
};

export const ALL_TIMES = Object.keys(TIMES).concat(Object.keys(TZEIT_TIMES));

/**
 * @private
 * @param {string[]} names
 * @param {dayjs.Dayjs} d
 * @param {Location} location
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @param {boolean} useElevation
 * @return {Object<string,string>}
 */
export function getTimes(names, d, location, formatAsString, roundMinute, useElevation) {
  const times = {};
  const zman = new Zmanim(location, d.toDate(), useElevation);
  for (const name of names) {
    if (TIMES[name]) {
      if (typeof zman[name] !== 'function') {
        throw createError(500, `Internal error: Zmanim.${name} is not a function`);
      }
      if (name.startsWith('seaLevel')) {
        if (useElevation) {
          times[name] = zman[name]();
        }
      } else {
        times[name] = zman[name]();
      }
    } else if (typeof TZEIT_TIMES[name] === 'number') {
      const num = TZEIT_TIMES[name];
      times[name] = name.endsWith('deg') ? zman.tzeit(num) : zman.sunsetOffset(num, roundMinute);
    }
  }
  if (roundMinute) {
    for (const [name, dt] of Object.entries(times)) {
      times[name] = Zmanim.roundTime(dt);
    }
  }
  if (formatAsString) {
    const tzid = location.getTzid();
    for (const [name, dt] of Object.entries(times)) {
      times[name] = Number.isNaN(dt.getTime()) ? null : Zmanim.formatISOWithTimeZone(tzid, dt);
    }
  }
  return times;
}

/**
 * @param {string[]} names
 * @param {dayjs.Dayjs} startD
 * @param {dayjs.Dayjs} endD
 * @param {Location} loc
 * @param {boolean} formatAsString
 * @param {boolean} roundMinute
 * @param {boolean} useElevation
 * @return {any}
 */
export function getTimesForRange(names, startD, endD, loc, formatAsString, roundMinute, useElevation) {
  const times = {};
  for (const func of names) {
    times[func] = {};
  }
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const t = getTimes(names, d, loc, formatAsString, roundMinute, useElevation);
    const isoDate = d.format('YYYY-MM-DD');
    for (const [key, val] of Object.entries(t)) {
      times[key][isoDate] = val;
    }
  }
  return times;
}
