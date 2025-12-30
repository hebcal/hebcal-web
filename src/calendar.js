import {HDate, HebrewCalendar, flags} from '@hebcal/core';
import {getEventCategories} from '@hebcal/rest-api';
import createError from 'http-errors';
import {GregorianDateEvent} from './GregorianDateEvent.js';
import {isoDateStringToDate} from './dateUtil.js';
import {empty, off} from './empty.js';
import {getLocationFromQuery} from './location.js';
import {
  negativeOpts,
  booleanOpts,
  dailyLearningOpts,
  numberOpts,
  lgToLocale,
  locationDefaultCandleMins,
  DEFAULT_CANDLE_MINS,
} from './opts.js';

const optsToMask = {
  maj: flags.YOM_TOV_ENDS | flags.MAJOR_FAST |
    flags.LIGHT_CANDLES | flags.LIGHT_CANDLES_TZEIS |
    flags.MINOR_HOLIDAY | flags.EREV | flags.CHOL_HAMOED |
    flags.CHANUKAH_CANDLES,
  nx: flags.ROSH_CHODESH,
  mod: flags.MODERN_HOLIDAY,
  mf: flags.MINOR_FAST,
  ss: flags.SPECIAL_SHABBAT,
  o: flags.OMER_COUNT,
  s: flags.PARSHA_HASHAVUA,
  ykk: flags.YOM_KIPPUR_KATAN,
  molad: flags.MOLAD,
  min: flags.MINOR_HOLIDAY,
  yzkr: flags.YIZKOR,
  mvch: flags.SHABBAT_MEVARCHIM,
};

/**
 * @param {Object.<string,string>} query
 * @return {number}
 */
function getMaskFromQuery(query) {
  let mask = 0;
  for (const [key, val] of Object.entries(optsToMask)) {
    const value = query[key];
    if (value === 'on' || value === '1') {
      mask |= val;
    }
  }
  return mask;
}

/**
 * Read Koa request parameters and create HebcalOptions
 * @param {any} db
 * @param {Object.<string,string>} query
 * @return {import('@hebcal/core').CalOptions}
 */
export function makeHebcalOptions(db, query) {
  const options = {};
  // map very old "nh=on" to 5 new parameters
  if (query.nh === 'on') {
    Object.keys(negativeOpts).filter((x) => x !== 'nx').forEach((x) => query[x] = 'on');
    delete query.nh;
  }
  // translate lowercase &m=on to &M=on before proceessing booleanOpts
  if (query.m === 'on') {
    query.M = 'on';
    delete query.m;
  }
  for (const [key, val] of Object.entries(booleanOpts)) {
    const qkv = query[key];
    if (qkv === 'on' || qkv === '1') {
      options[val] = true;
    } else if (typeof qkv === 'string' && qkv.length) {
      const val2 = qkv.toLowerCase();
      if (val2 !== 'off' && val2 !== '0') {
        delete query[key];
      }
    }
  }
  const dailyLearning = {};
  let hasDailyLearning = false;
  for (const [key, val] of Object.entries(dailyLearningOpts)) {
    const qkv = query[key];
    if (qkv === 'on' || qkv === '1') {
      dailyLearning[val] = true;
      hasDailyLearning = true;
    } else if (typeof qkv === 'string' && qkv.length) {
      const val2 = qkv.toLowerCase();
      if (val2 !== 'off' && val2 !== '0') {
        delete query[key];
      }
    }
  }
  const yerushalmiEd = query.yye;
  if (typeof yerushalmiEd === 'string' &&
    yerushalmiEd.toLowerCase()[0] === 's') {
    dailyLearning.yerushalmi = 2;
    hasDailyLearning = true;
  }
  if (hasDailyLearning) {
    options.dailyLearning = dailyLearning;
  }
  options.mask = getMaskFromQuery(query);
  if (!empty(query.h12)) {
    options.hour12 = !off(query.h12);
  }
  for (const [key, val] of Object.entries(negativeOpts)) {
    if (off(query[key])) {
      options[val] = true;
    }
  }
  if ((options.mask & flags.ROSH_CHODESH) &&
    (options.mask & flags.SPECIAL_SHABBAT) &&
    (options.mask & flags.PARSHA_HASHAVUA)) {
    options.mask |= flags.SHABBAT_MEVARCHIM;
  }
  // Before we parse numberOpts, check for tzeit preference
  if (options.havdalahTzeit) {
    options.havdalahDeg = 8.5;
    delete options.havdalahTzeit;
    delete query.m;
  }
  for (const [key, val] of Object.entries(numberOpts)) {
    const value = query[key];
    if (typeof value === 'string' && value.length) {
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        delete query[key];
      } else {
        options[val] = num;
      }
    }
  }
  if (!empty(query.start)) {
    options.start = isoDateStringToDate(query.start);
  }
  if (!empty(query.end)) {
    options.end = isoDateStringToDate(query.end);
  }
  if ((options.start && !options.end) || (options.end && !options.start)) {
    throw createError(400, `If one of 'start' or 'end' is specified, both are required`);
  }
  if (options.start && options.end) {
    delete query.year;
    delete query.month;
    delete query.yt;
  }
  if (!empty(query.yt)) {
    options.isHebrewYear = Boolean(query.yt === 'H');
  }
  if (!empty(query.year)) {
    if (query.year === 'now' || query.year === 'x') {
      if (options.isHebrewYear) {
        options.year = new HDate().getFullYear();
      } else {
        const dt = new Date();
        options.year = dt.getFullYear();
        if (query.month === 'now') {
          query.month = String(dt.getMonth() + 1);
        }
      }
      query.year = String(options.year);
    } else {
      options.year = parseInt(query.year, 10);
      if (isNaN(options.year)) {
        throw createError(400, `Sorry, invalid year ${query.year}`);
      } else if (options.isHebrewYear && options.year < 1) {
        throw createError(400, 'Sorry, Hebrew year must be 1 or later');
      } else if (!options.isHebrewYear && options.year < -3759) {
        throw createError(400, 'Sorry, Gregorian year must be -3759 or later');
      }
    }
  }
  if (!empty(query.month)) {
    const month = parseInt(query.month, 10);
    if (month >= 1 && month <= 12) {
      options.month = month;
    } else {
      delete query.month; // month=x is default, implies entire year
    }
  }
  if (options.ashkenazi && empty(query.lg)) {
    // map very old a=on to lg=a
    query.lg = 'a';
    delete query.a;
  }
  if (!empty(query.lg)) {
    const lg = query.lg;
    options.locale = lgToLocale[lg] || lg;
    if (lg === 'ah' || lg === 'sh') {
      options.appendHebrewToSubject = true;
    }
  }
  const location = getLocationFromQuery(db, query);
  if (location) {
    options.location = location;
    options.candlelighting = true;
    if (query.c === 'off') {
      query.c = 'on';
    }
    if (location.getIsrael()) {
      options.il = true;
      const offset = locationDefaultCandleMins(options.location);
      if (typeof options.candleLightingMins !== 'number' ||
        (offset !== DEFAULT_CANDLE_MINS && options.candleLightingMins === DEFAULT_CANDLE_MINS)) {
        options.candleLightingMins = offset;
        query.b = String(offset);
      }
    }
  } else {
    delete options.candlelighting;
  }
  if (options.candlelighting && typeof options.year === 'number' &&
    ((options.isHebrewYear && options.year < 5661) || options.year < 1900)) {
    options.candlelighting = false;
  }
  const mm = query.mm || '0';
  options.hebrewMonths = (mm === '1' || mm === '2');
  options.gematriyaNumerals = (mm === '2');
  return options;
}

/**
 * @param {any} ctx
 * @param {import('@hebcal/core').CalOptions} options
 * @return {Event[]}
 */
export function makeHebrewCalendar(ctx, options) {
  let events;
  // stash away values to avoid warning
  const yomTovOnly = options.yomTovOnly;
  const noMinorHolidays = options.noMinorHolidays;
  const addAlternateDates = options.addAlternateDates;
  const addAlternateDatesForEvents = options.addAlternateDatesForEvents;
  const hebrewMonths = options.hebrewMonths;
  const gematriyaNumerals = options.gematriyaNumerals;
  if (yomTovOnly) {
    delete options.yomTovOnly;
  }
  if (noMinorHolidays) {
    delete options.noMinorHolidays;
  }
  if (!hebrewMonths) {
    // No need for Hebrew dates when the whole calendar is fully Hebrew
    options.addHebrewDatesForEvents = addAlternateDatesForEvents;
    options.addHebrewDates = addAlternateDates;
  }
  // Always remove alternate properties - library doesn't recognize them
  delete options.addAlternateDates;
  delete options.addAlternateDatesForEvents;
  delete options.hebrewMonths;
  delete options.gematriyaNumerals;
  try {
    events = HebrewCalendar.calendar(options);

    // When using Hebrew months with Hebrew year mode, splitByHebrewMonth()
    // intentionally includes Tishrei of the next year for printed calendars
    // (useful as a backup when distributed yearly by mail).
    // Generate events for that extra month so it's not empty.
    if (hebrewMonths && options.isHebrewYear && options.year && !options.start && !options.end) {
      const nextYear = options.year + 1;
      const tishrei = 7; // Tishrei is month 7

      // Use explicit start/end dates to get ONLY Tishrei, not the whole year
      const tishreiStart = new HDate(1, tishrei, nextYear);
      const tishreiEnd = new HDate(30, tishrei, nextYear); // Tishrei always has 30 days
      const optsNextTishrei = {
        ...options,
        start: tishreiStart.greg(),
        end: tishreiEnd.greg(),
        isHebrewYear: false, // Using Gregorian date range
      };
      events = events.concat(HebrewCalendar.calendar(optsNextTishrei));
    }
  } catch (err) {
    const status = err.status || 400;
    ctx.throw(status, err);
  }
  if (yomTovOnly) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return (categories[0] === 'holiday' && (ev.getFlags() & flags.CHAG));
    });
  } else if (noMinorHolidays) {
    events = events.filter((ev) => {
      const categories = getEventCategories(ev);
      return categories.length < 2 || categories[1] !== 'minor';
    });
  }
  // restore values
  if (yomTovOnly) {
    options.yomTovOnly = true;
  }
  if (noMinorHolidays) {
    options.noMinorHolidays = true;
  }
  if (hebrewMonths) {
    options.hebrewMonths = true;
  }
  if (gematriyaNumerals) {
    options.gematriyaNumerals = true;
  }
  if (addAlternateDates) {
    options.addAlternateDates = addAlternateDates;
  }
  if (addAlternateDatesForEvents) {
    options.addAlternateDatesForEvents = addAlternateDatesForEvents;
  }

  // When Hebrew months are selected and user wants alternate dates,
  // add Gregorian date events (reverse of normal behavior)
  if (hebrewMonths && (options.addAlternateDates || options.addAlternateDatesForEvents)) {
    // Build a map of dates that have events
    // Key is absolute day number, value is {hd, events[]}
    const dateMap = new Map();
    for (const ev of events) {
      const hd = ev.getDate();
      const dateKey = hd.abs();
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {hd, events: []});
      }
      dateMap.get(dateKey).events.push(ev);
    }

    // If addAlternateDates, we need to add Gregorian dates for ALL days in range
    if (options.addAlternateDates && events.length > 0) {
      // Find the date range from the events
      const firstDate = events[0].getDate();
      const lastDate = events.at(-1).getDate();

      // Iterate over all days in the range
      let currentHd = firstDate;
      while (currentHd.abs() <= lastDate.abs()) {
        const dateKey = currentHd.abs();
        if (!dateMap.has(dateKey)) {
          // No events on this day, but we need to add a Gregorian date
          dateMap.set(dateKey, {hd: currentHd, events: []});
        }
        currentHd = currentHd.next();
      }
    }

    // Now build the final events array with Gregorian dates inserted
    const newEvents = [];
    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a - b);

    for (const dateKey of sortedDates) {
      const {hd, events: eventsOnDay} = dateMap.get(dateKey);

      // Add Gregorian date event if:
      // - addAlternateDates is true (all days), OR
      // - addAlternateDatesForEvents is true AND there are events on this day
      if (options.addAlternateDates || (options.addAlternateDatesForEvents && eventsOnDay.length > 0)) {
        newEvents.push(new GregorianDateEvent(hd));
      }

      // Add all events for this day
      newEvents.push(...eventsOnDay);
    }

    events = newEvents;
  }

  return events;
}
