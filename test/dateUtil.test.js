import {describe, it, expect} from 'vitest';
import {HDate, Location} from '@hebcal/core';
import dayjs from 'dayjs';
import {
  isoDateStringToDate,
  getTodayDate,
  makeGregDate,
  makeHebDate,
  getBeforeAfterSunsetForLocation,
  getSunsetAwareDate,
  getDefaultHebrewYear,
  getDefaultYear,
  nowInTimezone,
  shabbatWeekRange,
  expiresSaturdayNight,
  simchatTorahDate,
  yearIsOutsideGregRange,
  yearIsOutsideHebRange,
} from '../src/dateUtil.js';

// These tests are written to be timezone-independent: they pass under
// America/Los_Angeles, UTC and Asia/Jerusalem. Sunset-dependent assertions
// use explicit UTC instants (Date.UTC), and calendar-date assertions use
// Date(y, m, d) constructed and read back in the same (machine-local) zone.

/**
 * Assert that fn throws an http-error with the given status and a
 * message matching the supplied pattern.
 * @param {Function} fn
 * @param {number} status
 * @param {RegExp} messageRe
 */
function expectHttpError(fn, status, messageRe) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err, 'expected function to throw').toBeDefined();
  expect(err.status).toBe(status);
  expect(err.message).toMatch(messageRe);
}

describe('isoDateStringToDate', () => {
  it('parses a YYYY-MM-DD string', () => {
    const dt = isoDateStringToDate('2026-09-13');
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(8);
    expect(dt.getDate()).toBe(13);
  });

  it('handles years below 100 via setFullYear', () => {
    expect(isoDateStringToDate('0050-06-01').getFullYear()).toBe(50);
  });

  it('throws 400 when the string does not match YYYY-MM-DD', () => {
    expectHttpError(() => isoDateStringToDate('9/13/2026'), 400, /does not match format/);
    expectHttpError(() => isoDateStringToDate('2026-9-13'), 400, /does not match format/);
  });
});

describe('getTodayDate', () => {
  it('parses query.dt when present and valid', () => {
    const {dt, now} = getTodayDate({dt: '2026-09-13'});
    expect(now).toBe(false);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(8);
    expect(dt.getDate()).toBe(13);
  });

  it('uses gy/gm/gd when dt is absent', () => {
    const {dt, now} = getTodayDate({gy: '2026', gm: '9', gd: '13'});
    expect(now).toBe(false);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(8);
    expect(dt.getDate()).toBe(13);
  });
});

describe('makeGregDate', () => {
  it('returns a Date for a valid Gregorian date', () => {
    const dt = makeGregDate('2026', '9', '13');
    expect(dt).toBeInstanceOf(Date);
    expect(Number.isNaN(dt.getTime())).toBe(false);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(8); // September is month 8 (0-indexed)
    expect(dt.getDate()).toBe(13);
  });

  it('handles years below 100 via setFullYear', () => {
    const dt = makeGregDate('50', '6', '1');
    expect(dt.getFullYear()).toBe(50);
    expect(dt.getMonth()).toBe(5);
    expect(dt.getDate()).toBe(1);
  });

  it('accepts a negative year within the representable range', () => {
    const dt = makeGregDate('-100', '3', '15');
    expect(Number.isNaN(dt.getTime())).toBe(false);
    expect(dt.getFullYear()).toBe(-100);
  });

  it('throws 400 when the day is not numeric', () => {
    expectHttpError(() => makeGregDate('2026', '9', 'abc'), 400, /day must be numeric/);
  });

  it('throws 400 when the month is not numeric', () => {
    expectHttpError(() => makeGregDate('2026', 'xyz', '13'), 400, /month must be numeric/);
  });

  it('throws 400 when the year is not numeric', () => {
    expectHttpError(() => makeGregDate('foo', '9', '13'), 400, /year must be numeric/);
  });

  it('throws 400 when the month is out of range', () => {
    expectHttpError(() => makeGregDate('2026', '13', '1'), 400, /month out of valid range/);
    expectHttpError(() => makeGregDate('2026', '0', '1'), 400, /month out of valid range/);
  });

  it('throws 400 when the year is greater than 9999', () => {
    expectHttpError(() => makeGregDate('10000', '9', '13'), 400, /cannot be greater than 9999/);
  });

  it('throws 400 when the day is out of range for the month', () => {
    expectHttpError(() => makeGregDate('2026', '2', '30'), 400, /day 30 out of valid range/);
    expectHttpError(() => makeGregDate('2026', '9', '0'), 400, /out of valid range/);
  });

  // Regression: a wildly negative year (seen in a SQL-injection probe,
  // y1=-9794729) is outside JS's representable Date range, so new Date()
  // yields an Invalid Date (NaN getTime). Without a lower bound this slipped
  // past the getTime() guard (NaN < threshold is false) and produced a 500
  // downstream in @hebcal/hdate greg2abs.
  it('throws 400 for a year far below the representable range', () => {
    expectHttpError(() => makeGregDate('-9794729', '11', '30'), 400, /before Hebrew year 1/);
  });

  it('throws 400 for a year just below the Hebrew year 1 boundary', () => {
    expectHttpError(() => makeGregDate('-3761', '9', '7'), 400, /before Hebrew year 1/);
  });

  it('throws 400 for an in-range Gregorian date that precedes Hebrew year 1', () => {
    // Year -3760 is representable, so it clears the yy < -3760 guard and is
    // caught by the getTime() check instead. 1 Tishrei 1 == -003760-09-07.
    expectHttpError(() => makeGregDate('-3760', '1', '1'), 400, /before Hebrew year 1/);
  });
});

describe('makeHebDate', () => {
  it('returns an HDate for a valid Hebrew date', () => {
    const hd = makeHebDate('5787', 'Tishrei', '10');
    expect(hd).toBeInstanceOf(HDate);
    expect(hd.toString()).toBe('10 Tishrei 5787');
  });

  it('throws 400 when the day is not numeric', () => {
    expectHttpError(() => makeHebDate('5787', 'Tishrei', 'x'), 400, /Hebrew day must be numeric/);
  });

  it('throws 400 when the year is not numeric', () => {
    expectHttpError(() => makeHebDate('foo', 'Tishrei', '10'), 400, /Hebrew year must be numeric/);
  });

  it('throws 400 when the year is before year 1', () => {
    expectHttpError(() => makeHebDate('0', 'Tishrei', '10'), 400, /year 1 or later/);
  });

  it('throws 400 when the year is too large', () => {
    expectHttpError(() => makeHebDate('40000', 'Tishrei', '10'), 400, /year is too large/);
  });

  it('throws 400 when the month is missing', () => {
    expectHttpError(() => makeHebDate('5787', '', '10'), 400, /month is required/);
  });

  it('throws 400 for an unknown month name', () => {
    expectHttpError(() => makeHebDate('5787', 'Smarch', '10'), 400, /.+/);
  });

  it('throws 400 when the day is out of range for the month', () => {
    // Tishrei has 30 days.
    expectHttpError(() => makeHebDate('5787', 'Tishrei', '31'), 400, /out of valid range/);
  });

  it('coerces Adar II to Adar I in a non-leap year', () => {
    // 5786 is not a leap year, so Adar II folds to Adar (I).
    expect(HDate.isLeapYear(5786)).toBe(false);
    const hd = makeHebDate('5786', "Adar II", '5');
    expect(hd.getMonthName()).toBe('Adar');
  });
});

describe('getBeforeAfterSunsetForLocation', () => {
  const boston = Location.lookup('Boston');

  it('reports before sunset for a morning instant', () => {
    // 12:00 UTC on 2026-09-13 == 08:00 EDT, well before Boston sunset.
    const r = getBeforeAfterSunsetForLocation(new Date(Date.UTC(2026, 8, 13, 12, 0, 0)), boston);
    expect(r.afterSunset).toBe(false);
    expect(r.gy).toBe(2026);
    expect(r.gm).toBe(9);
    expect(r.gd).toBe(13);
    expect(r.dt).toBeInstanceOf(Date);
  });

  it('reports after sunset for a late-evening instant', () => {
    // 03:00 UTC on 2026-09-14 == 23:00 EDT on 2026-09-13, after Boston sunset.
    const r = getBeforeAfterSunsetForLocation(new Date(Date.UTC(2026, 8, 14, 3, 0, 0)), boston);
    expect(r.afterSunset).toBe(true);
    expect(r.gd).toBe(13);
  });
});

describe('getSunsetAwareDate', () => {
  it('returns a dateOverride result when the query specifies a date', () => {
    const boston = Location.lookup('Boston');
    const r = getSunsetAwareDate({gy: '2026', gm: '9', gd: '13'}, boston);
    expect(r.dateOverride).toBe(true);
    expect(r.afterSunset).toBe(false);
    expect(r.gy).toBe(2026);
    expect(r.gm).toBe(9);
    expect(r.gd).toBe(13);
  });
});

describe('getDefaultHebrewYear', () => {
  it('returns the current Hebrew year on or before Tu B\'Av', () => {
    // 1 Tishrei 5787 (right after Rosh Hashana) is well before next Av 15.
    expect(getDefaultHebrewYear(new HDate(1, 'Tishrei', 5787))).toBe(5787);
  });

  it('rolls to the next Hebrew year after Tu B\'Av', () => {
    // 20 Av 5787 is past Av 15, so the default advances to 5788.
    expect(getDefaultHebrewYear(new HDate(20, 'Av', 5787))).toBe(5788);
  });
});

describe('getDefaultYear', () => {
  it('shows the current Gregorian year in the first 7 months', () => {
    const dt = new Date(2026, 2, 15); // March
    const r = getDefaultYear(dt, new HDate(dt));
    expect(r.isHebrewYear).toBe(false);
    expect(r.gregRange).toBe(2026);
    expect(r.yearArgs).toBe('&yt=G&year=2026');
  });

  it('shows the next Gregorian year in late December', () => {
    const dt = new Date(2026, 11, 20); // Dec 20 (>= 10)
    const r = getDefaultYear(dt, new HDate(dt));
    expect(r.isHebrewYear).toBe(false);
    expect(r.gregRange).toBe(2027);
    expect(r.yearArgs).toBe('&yt=G&year=2027');
  });

  it('shows the Hebrew year after Tu B\'Av', () => {
    const dt = new Date(2026, 9, 15); // October
    const r = getDefaultYear(dt, new HDate(dt));
    expect(r.isHebrewYear).toBe(true);
    expect(r.hy).toBe(5787);
    expect(r.gregRange).toBe('2026-2027');
    expect(r.gregRangeShort).toBe('2026-27');
    expect(r.yearArgs).toBe('&yt=H&year=5787');
  });
});

describe('nowInTimezone', () => {
  it('returns a valid dayjs for a given timezone', () => {
    const d = nowInTimezone('America/New_York');
    expect(dayjs.isDayjs(d)).toBe(true);
    expect(d.isValid()).toBe(true);
  });
});

describe('shabbatWeekRange', () => {
  it('backs up from Saturday to Friday', () => {
    // 2026-09-12 is a Saturday.
    const [start, end] = shabbatWeekRange(dayjs('2026-09-12'));
    expect(start.format('YYYY-MM-DD')).toBe('2026-09-11');
    expect(end.format('YYYY-MM-DD')).toBe('2026-09-16');
  });

  it('keeps a mid-week start and ends five days ahead', () => {
    // 2026-09-09 is a Wednesday; five days ahead (Mon) is after Saturday.
    const [start, end] = shabbatWeekRange(dayjs('2026-09-09'));
    expect(start.format('YYYY-MM-DD')).toBe('2026-09-09');
    expect(end.format('YYYY-MM-DD')).toBe('2026-09-14');
  });
});

describe('expiresSaturdayNight', () => {
  it('sets the Expires header to the following Sunday 00:00 in the tzid', () => {
    const headers = {};
    const ctx = {set: (k, v) => {
      headers[k] = v;
    }};
    // Any instant during the week of 2026-09-13; the header is computed from
    // the explicit tzid, so it is independent of the machine timezone.
    expiresSaturdayNight(ctx, new Date(Date.UTC(2026, 8, 13, 12, 0, 0)), 'America/New_York');
    expect(headers.Expires).toBe('Sun, 20 Sep 2026 04:00:00 GMT');
  });
});

describe('simchatTorahDate', () => {
  it('is 22 Tishrei in Israel', () => {
    expect(simchatTorahDate(5787, true).toString()).toBe('22 Tishrei 5787');
  });

  it('is 23 Tishrei in the diaspora', () => {
    expect(simchatTorahDate(5787, false).toString()).toBe('23 Tishrei 5787');
  });
});

describe('yearIsOutsideGregRange', () => {
  it('accepts years within 100-2999', () => {
    expect(yearIsOutsideGregRange(2026)).toBe(false);
    expect(yearIsOutsideGregRange(100)).toBe(false);
    expect(yearIsOutsideGregRange(2999)).toBe(false);
  });

  it('rejects out-of-range and NaN years', () => {
    expect(yearIsOutsideGregRange(50)).toBe(true);
    expect(yearIsOutsideGregRange(3000)).toBe(true);
    expect(yearIsOutsideGregRange(NaN)).toBe(true);
  });
});

describe('yearIsOutsideHebRange', () => {
  it('accepts years within 3860-6759', () => {
    expect(yearIsOutsideHebRange(5787)).toBe(false);
    expect(yearIsOutsideHebRange(3860)).toBe(false);
    expect(yearIsOutsideHebRange(6759)).toBe(false);
  });

  it('rejects out-of-range and NaN years', () => {
    expect(yearIsOutsideHebRange(3859)).toBe(true);
    expect(yearIsOutsideHebRange(6760)).toBe(true);
    expect(yearIsOutsideHebRange(NaN)).toBe(true);
  });
});
