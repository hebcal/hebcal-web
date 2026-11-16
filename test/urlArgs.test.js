import {describe, it, expect} from 'vitest';
import {booleanOpts} from '../src/urlArgs.js';

describe('booleanOpts', () => {
  it('maps bhb to the behab option (Ta\'anit BeHaB)', () => {
    expect(booleanOpts.bhb).toBe('behab');
  });

  it('keeps the existing mvch mapping intact', () => {
    expect(booleanOpts.mvch).toBe('shabbatMevarchim');
  });

  it('has no duplicate option names', () => {
    const values = Object.values(booleanOpts);
    expect(new Set(values).size).toBe(values.length);
  });
});
