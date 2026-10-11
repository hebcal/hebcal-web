import { Zmanim } from '@hebcal/core';
import createError from 'http-errors';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

dayjs.extend(isSameOrBefore);

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

/**
 * Kiddush Levana times are molad-based and occur only on a few days each
 * month. The `Zmanim` methods return `null` on every other day. Earliest times
 * that fall during the day move forward to tzeit that evening; latest times
 * that fall during the day move back to alot hashachar that morning.
 * Earliest times round up and latest times round down, so the rounded
 * time is never outside the permitted window.
 * Values are `[methodName, roundingMode]`.
 */
const KIDDUSH_LEVANA_TIMES = {
  tchilasZmanKidushLevana3Days: ['getTchilasZmanKidushLevana3Days', 'ceil'],
  tchilasZmanKidushLevana7Days: ['getTchilasZmanKidushLevana7Days', 'ceil'],
  sofZmanKidushLevanaBetweenMoldos: ['getSofZmanKidushLevanaBetweenMoldos', 'floor'],
  sofZmanKidushLevana15Days: ['getSofZmanKidushLevana15Days', 'floor'],
};

/**
 * The moment of the molad (new moon) as a local time, on the day it occurs.
 * Unlike every other zman it doesn't depend on the sun.
 */
export const MOLAD = 'molad';

export const ALL_TIMES = Object.keys(TIMES)
    .concat(Object.keys(TZEIT_TIMES))
    .concat([MOLAD])
    .concat(Object.keys(KIDDUSH_LEVANA_TIMES));

/**
 * @private
 * @param {Date} dt
 * @param {string} tzid
 * @return {Temporal.ZonedDateTime|null}
 */
function toZdt(dt, tzid) {
  const millis = dt.getTime();
  if (Number.isNaN(millis)) {
    return null;
  }
  return Temporal.Instant.fromEpochMilliseconds(millis).toZonedDateTimeISO(tzid);
}

/**
 * @private
 * @param {Temporal.ZonedDateTime} zdt
 * @param {string} roundingMode
 * @param {boolean} roundMinute
 * @return {Date}
 */
function zdtToDate(zdt, roundingMode, roundMinute) {
  if (roundMinute) {
    zdt = zdt.round({smallestUnit: 'minute', roundingMode});
  }
  return new Date(zdt.epochMilliseconds);
}

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
function getTimes(names, d, location, formatAsString, roundMinute, useElevation) {
  const times = {};
  const zman = new Zmanim(location, d.toDate(), useElevation);
  const klNames = [];
  for (const name of names) {
    if (KIDDUSH_LEVANA_TIMES[name]) {
      klNames.push(name);
    } else if (name === MOLAD) {
      const zdt = zman.getZmanMolad();
      if (zdt !== null) {
        times[name] = zdtToDate(zdt, 'halfExpand', roundMinute);
      }
    } else if (TIMES[name]) {
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
      if (name !== MOLAD) {
        times[name] = Zmanim.roundTime(dt);
      }
    }
  }
  if (klNames.length) {
    // Same alot hashachar (16.1°) and tzeit (8.5°) as @hebcal/core's
    // Latest Kiddush Levana event
    const tzid = location.getTzid();
    const alos = toZdt(zman.alotHaShachar(), tzid);
    const tzeit = toZdt(zman.tzeit(), tzid);
    // Without alot hashachar and tzeit (e.g. polar latitudes) there is no
    // way to tell whether the time falls at night
    if (alos && tzeit) {
      for (const name of klNames) {
        const [method, roundingMode] = KIDDUSH_LEVANA_TIMES[name];
        const zdt = zman[method](alos, tzeit);
        if (zdt !== null) {
          times[name] = zdtToDate(zdt, roundingMode, roundMinute);
        }
      }
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
