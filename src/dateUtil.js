import {HDate, months, greg, Zmanim} from '@hebcal/core';
import createError from 'http-errors';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {empty} from './empty.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const reIsoDate = /^\d\d\d\d-\d\d-\d\d/;

/**
 * Parse a string YYYY-MM-DD and return Date
 * @param {string} str
 * @return {Date}
 */
export function isoDateStringToDate(str) {
  if (!reIsoDate.test(str)) {
    throw createError(400, `Date does not match format YYYY-MM-DD: ${str}`);
  }
  const yy = Number.parseInt(str, 10);
  const mm = Number.parseInt(str.substring(5, 7), 10);
  const dd = Number.parseInt(str.substring(8, 10), 10);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  return dt;
}

/**
 * Returns the date in the query string or today
 * @param {Object.<string,string>} query
 * @return {Object}
 */
export function getTodayDate(query) {
  if (!empty(query.dt)) {
    try {
      const dt = isoDateStringToDate(query.dt);
      return {dt, now: false};
    } catch {
      return {dt: new Date(), now: true};
    }
  }
  const isToday = Boolean(empty(query.gy) || empty(query.gm) || empty(query.gd));
  return isToday ? {dt: new Date(), now: true} : {dt: makeGregDate(query.gy, query.gm, query.gd), now: false};
}

/**
 * Parse and validate Gregorian year/month/day strings into a Date,
 * throwing an HTTP 400 for non-numeric, out-of-range, or pre-Hebrew-year-1 input.
 * @param {string} gy Gregorian Year
 * @param {string} gm Gregorian Month
 * @param {string} gd Gregorian Day
 * @return {Date}
 */
export function makeGregDate(gy, gm, gd) {
  const yy = Number.parseInt(gy, 10);
  const mm = Number.parseInt(gm, 10);
  const dd = Number.parseInt(gd, 10);
  if (Number.isNaN(dd)) {
    throw createError(400, `Gregorian day must be numeric: ${gd}`);
  } else if (Number.isNaN(mm)) {
    throw createError(400, `Gregorian month must be numeric: ${gm}`);
  } else if (Number.isNaN(yy)) {
    throw createError(400, `Gregorian year must be numeric: ${gy}`);
  } else if (mm > 12 || mm < 1) {
    throw createError(400, `Gregorian month out of valid range 1-12: ${gm}`);
  } else if (yy > 9999) {
    throw createError(400, `Gregorian year cannot be greater than 9999: ${gy}`);
  } else if (yy < -3760) {
    throw createError(400, `Gregorian year ${gy} is before Hebrew year 1`);
  }
  const maxDay = greg.daysInMonth(mm, yy);
  if (dd < 1 || dd > maxDay) {
    throw createError(400, `Gregorian day ${dd} out of valid range for ${mm}/${yy}`);
  }
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  // Hebrew date 1 Tishrei 1 == Gregorian -003760-09-07
  if (dt.getTime() < -180799747622000) {
    const s = dt.toISOString();
    const isoDate = s.substring(0, s.indexOf('T'));
    throw createError(400, `Gregorian date before Hebrew year 1: ${isoDate}`);
  }
  return dt;
}

/**
 * Parse and validate Hebrew year/month/day strings into an HDate, throwing an
 * HTTP 400 for invalid input. Adar II folds to Adar in a non-leap year.
 * @param {string} hyStr Hebrew Year
 * @param {string} hmStr Hebrew Month
 * @param {string} hdStr Hebrew Day
 * @return {HDate}
 */
export function makeHebDate(hyStr, hmStr, hdStr) {
  const hy = Number.parseInt(hyStr, 10);
  const hd = Number.parseInt(hdStr, 10);
  if (Number.isNaN(hd)) {
    throw createError(400, `Hebrew day must be numeric: ${hdStr}`);
  } else if (Number.isNaN(hy)) {
    throw createError(400, `Hebrew year must be numeric: ${hyStr}`);
  } else if (hy < 1) {
    throw createError(400, `Hebrew year must be year 1 or later: ${hy}`);
  } else if (hy > 32000) {
    throw createError(400, `Hebrew year is too large: ${hy}`);
  }
  if (empty(hmStr)) {
    throw createError(400, 'Hebrew month is required');
  }
  let hm;
  try {
    hm = HDate.monthFromName(hmStr);
  } catch (err) {
    throw createError(400, err.message);
  }
  if (hm === months.ADAR_II && !HDate.isLeapYear(hy)) {
    hm = months.ADAR_I;
  }
  const maxDay = HDate.daysInMonth(hm, hy);
  if (hd < 1 || hd > maxDay) {
    const monthName = HDate.getMonthName(hm, hy);
    throw createError(400, `Hebrew day out of valid range 1-${maxDay} for ${monthName} ${hy}`);
  }
  return new HDate(hd, hm, hy);
}

/**
 * Given an instant and a location, returns that day's civil date plus whether
 * the instant falls after local sunset (for Hebrew-date roll-over).
 * @param {Date} dt
 * @param {Location} location
 * @return {any}
 */
export function getBeforeAfterSunsetForLocation(dt, location) {
  const tzid = location.getTzid();
  const isoDate = Zmanim.formatISOWithTimeZone(tzid, dt);
  const gy = Number.parseInt(isoDate.substring(0, 4), 10);
  const gm = Number.parseInt(isoDate.substring(5, 7), 10);
  const gd = Number.parseInt(isoDate.substring(8, 10), 10);
  const day = new Date(gy, gm - 1, gd);
  const zman = new Zmanim(location, day);
  const sunset = zman.sunset();
  const afterSunset = Boolean(dt >= sunset);
  return {dt: day, afterSunset: afterSunset, gy, gd, gm};
}

/**
 * Resolves the effective date for a request: when the query overrides the date
 * it is used as-is; otherwise today's date is returned with sunset awareness
 * (if a location is known).
 * @param {Object.<string,string>} q
 * @param {Location} location
 * @return {any}
 */
export function getSunsetAwareDate(q, location) {
  const {dt, now} = getTodayDate(q);
  if (now && location) {
    return getBeforeAfterSunsetForLocation(dt, location);
  }
  return {
    dt: dt, afterSunset: false, dateOverride: !now,
    gy: dt.getFullYear(), gd: dt.getDate(), gm: dt.getMonth() + 1,
  };
}

/**
 * Returns the Hebrew year to default to: the current year up through Tu B'Av
 * (15 Av), then the next year (so the upcoming High Holidays are shown).
 * @param {HDate} hdate today
 * @return {number}
 */
export function getDefaultHebrewYear(hdate) {
  const today = hdate.abs();
  const hy0 = hdate.getFullYear();
  const av15 = new HDate(15, months.AV, hy0).abs();
  return today > av15 ? hy0 + 1 : hy0;
}

/**
 * For the first 7 months of the year, show the current Gregorian year.
 * For the last 3 weeks of December, show next Gregorian year.
 * After Tu B'Av show next Hebrew year.
 * @param {Date} dt today
 * @param {HDate} hdate today
 * @return {any}
 */
export function getDefaultYear(dt, hdate) {
  const today = hdate.abs();
  const av15 = new HDate(15, months.AV, hdate.getFullYear()).abs();
  const hy = getDefaultHebrewYear(hdate);
  const gregYr1 = hy - 3761;
  const gregYr2 = gregYr1 + 1;
  let yearArgs = `&yt=H&year=${hy}`;
  let isHebrewYear = true;
  let gregRange = gregYr1 + '-' + gregYr2;
  let gregRangeShort = gregYr1 + '-' + (gregYr2 % 100);
  const gm = dt.getMonth() + 1;
  if ((hdate.getMonth() !== months.TISHREI) &&
      (gm < 8 || (gm <= 9 && today <= av15) || gm === 12 && dt.getDate() >= 10)) {
    const gy0 = dt.getFullYear();
    const gy = (gm === 12) ? gy0 + 1 : gy0;
    yearArgs = `&yt=G&year=${gy}`;
    isHebrewYear = false;
    gregRange = gy;
    gregRangeShort = gy;
  }
  return {
    hy,
    gregRange,
    gregRangeShort,
    yearArgs,
    isHebrewYear,
    todayAbs: today,
    av15Abs: av15,
  };
}

/**
 * Returns today's date (midnight) in the given IANA timezone as a dayjs.
 * @param {string} tzid
 * @return {dayjs.Dayjs}
 */
export function nowInTimezone(tzid) {
  const isoDate = Zmanim.formatISOWithTimeZone(tzid, new Date());
  return dayjs(isoDate.substring(0, 10));
}

/**
 * Given a day, returns the Shabbat week window `[start, endOfWeek]` used for
 * weekly Shabbat/parsha listings. If the day is Saturday, backs up to Friday
 * so last night's candle-lighting times are included; the end is the later of
 * the upcoming Saturday or five days ahead.
 * @param {dayjs.Dayjs} d
 * @return {dayjs.Dayjs[]}
 */
export function shabbatWeekRange(d) {
  const start = (d.day() === 6) ? d.subtract(1, 'day') : d;
  const saturday = start.add(6 - start.day(), 'day');
  const fiveDaysAhead = start.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [start, endOfWeek];
}

/**
 * Sets the response `Expires` header to the start of the coming Sunday
 * (i.e. Saturday midnight) in the given timezone, so weekly content is
 * cached only until the next Shabbat has passed.
 * @param {import('koa').Context} ctx
 * @param {Date} now
 * @param {string} tzid
 */
export function expiresSaturdayNight(ctx, now, tzid) {
  const today = dayjs.tz(now, tzid);
  const sunday = today.day(7);
  const exp = dayjs.tz(sunday.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

/**
 * Returns the date of Simchat Torah for the given Hebrew year: 22 Tishrei in
 * Israel, 23 Tishrei in the diaspora.
 * @param {number} year Hebrew year
 * @param {boolean} il
 * @return {HDate}
 */
export function simchatTorahDate(year, il) {
  const mday = il ? 22 : 23;
  return new HDate(mday, months.TISHREI, year);
}

/**
 * True if the Gregorian year is NaN or outside the supported range (100-2999).
 * @param {number} year
 * @return {boolean}
 */
export function yearIsOutsideGregRange(year) {
  return Number.isNaN(year) || year < 100 || year > 2999;
}

/**
 * True if the Hebrew year is NaN or outside the supported range (3860-6759).
 * @param {number} year
 * @return {boolean}
 */
export function yearIsOutsideHebRange(year) {
  return Number.isNaN(year) || year < 3860 || year > 6759;
}
