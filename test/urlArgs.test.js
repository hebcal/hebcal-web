import {describe, it, expect} from 'vitest';
import {DEFAULT_CANDLE_MINS, geonameIdDefaultCandleMins} from '../src/urlArgs.js';

describe('geonameIdDefaultCandleMins', () => {
  it('uses the per-city offset for Jerusalem and Haifa', () => {
    expect(geonameIdDefaultCandleMins(281184, 'IL')).toBe(40);
    expect(geonameIdDefaultCandleMins('294801', 'IL')).toBe(30);
  });
  it('defaults to 20 in Israel', () => {
    expect(geonameIdDefaultCandleMins(293397, 'IL')).toBe(20);
  });
  it('defaults to 18 elsewhere', () => {
    expect(DEFAULT_CANDLE_MINS).toBe(18);
    expect(geonameIdDefaultCandleMins(5128581, 'US')).toBe(18);
  });
});
