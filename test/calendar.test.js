import {describe, it, expect} from 'vitest';
import {makeHebcalOptions} from '../src/calendar.js';

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
