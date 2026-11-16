import {describe, it, expect} from 'vitest';
import {makeHebcalOptions, getMaxRangeDays, estimateEventsPerYear,
  MAX_RANGE_EVENTS} from '../src/calendar.js';

// https://github.com/hebcal/hebcal/issues/308
describe('makeHebcalOptions td (tzeit degrees) parameter', () => {
  it('sets havdalahDeg from td=16.1', () => {
    const query = {year: '2026', td: '16.1'};
    const options = makeHebcalOptions(null, query);
    expect(options.havdalahDeg).toBeCloseTo(16.1, 5);
    expect(options.havdalahMins).toBeUndefined();
  });

  it('td overrides M=on (which would imply 8.5 degrees)', () => {
    const query = {year: '2026', M: 'on', td: '7.083'};
    const options = makeHebcalOptions(null, query);
    expect(options.havdalahDeg).toBeCloseTo(7.083, 5);
    expect(options.havdalahMins).toBeUndefined();
  });

  it('td=10.5 overrides m=50', () => {
    const query = {year: '2026', m: '50', td: '10.5'};
    const options = makeHebcalOptions(null, query);
    expect(options.havdalahDeg).toBeCloseTo(10.5, 5);
    expect(options.havdalahMins).toBeUndefined();
    expect(query.m).toBeUndefined();
  });

  it('ignores invalid td value', () => {
    const query = {year: '2026', M: 'on', td: 'not-a-number'};
    const options = makeHebcalOptions(null, query);
    expect(options.havdalahDeg).toBe(8.5);
    expect(query.td).toBe('8.5');
  });

  it('M=on without td preserves 8.5 degrees default', () => {
    const query = {year: '2026', M: 'on'};
    const options = makeHebcalOptions(null, query);
    expect(options.havdalahDeg).toBe(8.5);
  });
});

describe('makeHebcalOptions fast start/end parameters', () => {
  it('leaves fast options unset by default', () => {
    const options = makeHebcalOptions(null, {year: '2026'});
    for (const key of ['fastStartDeg', 'fastStartMins', 'fastEndDeg', 'fastEndMins',
      'tishaBavEndDeg', 'tishaBavEndMins']) {
      expect(options[key]).toBeUndefined();
    }
  });

  it('parses degrees and minutes for each pair', () => {
    const options = makeHebcalOptions(null,
        {year: '2026', fsd: '19.8', fem: '50', tbed: '8.5'});
    expect(options.fastStartDeg).toBeCloseTo(19.8, 5);
    expect(options.fastStartMins).toBeUndefined();
    expect(options.fastEndMins).toBe(50);
    expect(options.fastEndDeg).toBeUndefined();
    expect(options.tishaBavEndDeg).toBeCloseTo(8.5, 5);
    expect(options.tishaBavEndMins).toBeUndefined();

    const options2 = makeHebcalOptions(null,
        {year: '2026', fsm: '72', fed: '7.083', tbem: '45'});
    expect(options2.fastStartMins).toBe(72);
    expect(options2.fastEndDeg).toBeCloseTo(7.083, 5);
    expect(options2.tishaBavEndMins).toBe(45);
  });

  it('degrees wins when both degrees and minutes are given', () => {
    const query = {year: '2026', fsd: '16.1', fsm: '72'};
    const options = makeHebcalOptions(null, query);
    expect(options.fastStartDeg).toBeCloseTo(16.1, 5);
    expect(options.fastStartMins).toBeUndefined();
    expect(query.fsm).toBeUndefined();
  });

  it('treats negative values as positive', () => {
    const options = makeHebcalOptions(null, {year: '2026', fsd: '-16.1', fem: '-20'});
    expect(options.fastStartDeg).toBeCloseTo(16.1, 5);
    expect(options.fastEndMins).toBe(20);
  });

  it('truncates fractional minutes', () => {
    const options = makeHebcalOptions(null, {year: '2026', fsm: '72.9'});
    expect(options.fastStartMins).toBe(72);
  });

  it('ignores and removes invalid or out-of-range values without throwing', () => {
    const query = {
      year: '2026',
      fsd: 'abc', fed: '0', tbed: '90', // degrees must be > 0 and < 90
      fsm: '0', fem: '241', tbem: 'xyz', // minutes must be 1..240
    };
    const options = makeHebcalOptions(null, query);
    for (const key of ['fastStartDeg', 'fastStartMins', 'fastEndDeg', 'fastEndMins',
      'tishaBavEndDeg', 'tishaBavEndMins']) {
      expect(options[key]).toBeUndefined();
    }
    for (const key of ['fsd', 'fed', 'tbed', 'fsm', 'fem', 'tbem']) {
      expect(query[key]).toBeUndefined();
    }
  });

  it('falls back to minutes when degrees is invalid', () => {
    const options = makeHebcalOptions(null, {year: '2026', fsd: 'abc', fsm: '90'});
    expect(options.fastStartDeg).toBeUndefined();
    expect(options.fastStartMins).toBe(90);
  });
});

describe('start/end date range clamp', () => {
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const allHolidays = {maj: 'on', min: 'on', mod: 'on', nx: 'on', mf: 'on', ss: 'on'};

  it('allows 10 years for holidays only', () => {
    const options = makeHebcalOptions(null,
        {...allHolidays, start: '2026-11-16', end: '2194-10-31'});
    expect(daysBetween(options.start, options.end)).toBe(3652);
  });

  it('does not extend a short range', () => {
    const options = makeHebcalOptions(null,
        {...allHolidays, d: 'on', s: 'on', start: '2026-11-16', end: '2027-01-31'});
    expect(options.end).toEqual(new Date(2027, 0, 31));
  });

  it('allows 10 years for holidays + candles + sedrot', () => {
    const options = {candlelighting: true, sedrot: true};
    expect(estimateEventsPerYear(options)).toBe(270);
    expect(getMaxRangeDays(options)).toBe(3652);
  });

  it('narrows d=on plus holidays to ~8 years', () => {
    const options = makeHebcalOptions(null,
        {...allHolidays, d: 'on', start: '2026-11-16', end: '2194-10-31'});
    expect(daysBetween(options.start, options.end)).toBe(Math.floor(MAX_RANGE_EVENTS / 455 * 365.25));
  });

  it('counts D=on as one Hebrew date per day with events', () => {
    expect(estimateEventsPerYear({addAlternateDatesForEvents: true})).toBe(280);
  });

  it('narrows holidays + candles + sedrot + omer + d=on to ~5 years', () => {
    const options = {candlelighting: true, sedrot: true, omer: true, addAlternateDates: true};
    expect(estimateEventsPerYear(options)).toBe(684);
    const days = getMaxRangeDays(options);
    expect(days).toBe(Math.floor(MAX_RANGE_EVENTS / 684 * 365.25));
    expect(days).toBeGreaterThan(365 * 5.2);
    expect(days).toBeLessThan(365 * 5.3);
  });

  it('never goes below 1 year', () => {
    const dailyLearning = {};
    for (let i = 0; i < 15; i++) {
      dailyLearning['cal' + i] = true;
    }
    const options = {candlelighting: true, addAlternateDates: true, dailyLearning};
    expect(getMaxRangeDays(options)).toBe(365);
  });

  it('narrows 8 daily learning calendars to about a year', () => {
    const options = makeHebcalOptions(null, {
      ...allHolidays, d: 'on', s: 'on', o: 'on',
      F: 'on', myomi: 'on', dpy: 'on', nyomi: 'on', dty: 'on', dps: 'on',
      d929: 'on', dr1: 'on',
      start: '2026-11-16', end: '2194-10-31',
    });
    expect(Object.keys(options.dailyLearning)).toHaveLength(8);
    expect(daysBetween(options.start, options.end)).toBe(Math.floor(MAX_RANGE_EVENTS / 3474 * 365.25));
  });

  it('counts no holidays when all are turned off', () => {
    const options = makeHebcalOptions(null, {
      maj: 'off', min: 'off', mod: 'off', nx: 'off', mf: 'off', ss: 'off', s: 'on',
    });
    expect(estimateEventsPerYear(options)).toBe(50);
  });
});
