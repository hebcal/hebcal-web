import {describe, it, expect} from 'vitest';
import {
  getNumYears,
  getMaxYahrzeitId,
  getYahrzeitIds,
  isNumKey,
  getAnniversaryTypes,
  summarizeAnniversaryTypes,
  getCalendarNames,
  makeCalendarTitle,
  getYahrzeitDetailForId,
  compactJsonToSave,
  YAHRZEIT,
  BIRTHDAY,
  ANNIVERSARY,
  OTHER,
  DEFAULT_YEARS,
} from '../src/yahrzeitCommon.js';

describe('getNumYears', () => {
  it('returns DEFAULT_YEARS for NaN input', () => {
    expect(getNumYears('abc')).toBe(DEFAULT_YEARS);
    expect(getNumYears('')).toBe(DEFAULT_YEARS);
    expect(getNumYears(undefined)).toBe(DEFAULT_YEARS);
    expect(getNumYears(null)).toBe(DEFAULT_YEARS);
  });

  it('clamps to minimum of 2', () => {
    expect(getNumYears('0')).toBe(2);
    expect(getNumYears('1')).toBe(2);
    expect(getNumYears('-10')).toBe(2);
  });

  it('clamps to maximum of 50', () => {
    expect(getNumYears('51')).toBe(50);
    expect(getNumYears('100')).toBe(50);
  });

  it('returns the parsed value for valid range', () => {
    expect(getNumYears('2')).toBe(2);
    expect(getNumYears('10')).toBe(10);
    expect(getNumYears('20')).toBe(20);
    expect(getNumYears('50')).toBe(50);
    expect(getNumYears(20)).toBe(20);
  });
});

describe('isNumKey', () => {
  it('returns true when second character is a digit', () => {
    expect(isNumKey('n1')).toBe(true);
    expect(isNumKey('t2')).toBe(true);
    expect(isNumKey('y9')).toBe(true);
    expect(isNumKey('x0')).toBe(true);
    expect(isNumKey('m5')).toBe(true);
  });

  it('returns false when second character is not a digit', () => {
    expect(isNumKey('na')).toBe(false);
    expect(isNumKey('xy')).toBe(false);
    expect(isNumKey('ab')).toBe(false);
    expect(isNumKey('hy')).toBe(false);
  });
});

describe('getYahrzeitIds', () => {
  it('returns empty array for empty query', () => {
    expect(getYahrzeitIds({})).toEqual([]);
  });

  it('returns id for complete y/m/d entry', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'y'};
    expect(getYahrzeitIds(q)).toContain(1);
  });

  it('returns id for compact x field', () => {
    const q = {x6: '1990-05-15', t6: 'y'};
    expect(getYahrzeitIds(q)).toContain(6);
  });

  it('returns ids for multiple entries', () => {
    const q = {x1: '1990-05-15', x3: '2001-09-11', t1: 'y', t3: 'y'};
    const ids = getYahrzeitIds(q);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it('ignores incomplete y/m/d entries (missing month or day)', () => {
    expect(getYahrzeitIds({y1: '1990'})).toEqual([]);
    expect(getYahrzeitIds({y1: '1990', m1: '5'})).toEqual([]);
    expect(getYahrzeitIds({m1: '5', d1: '15'})).toEqual([]);
  });

  it('ignores entries with empty x field', () => {
    expect(getYahrzeitIds({x1: ''})).toEqual([]);
    expect(getYahrzeitIds({x1: null})).toEqual([]);
  });

  it('handles Hebrew date fields (hy/hm/hd)', () => {
    const q = {hy6: '5784', hm6: 'Nisan', hd6: '15', t6: 'y'};
    expect(getYahrzeitIds(q)).toContain(6);
  });
});

describe('getMaxYahrzeitId', () => {
  it('returns 0 for empty query', () => {
    expect(getMaxYahrzeitId({})).toBe(0);
  });

  it('returns 1 for a single valid entry', () => {
    expect(getMaxYahrzeitId({x1: '1990-05-15', t1: 'y'})).toBe(1);
  });

  it('returns the highest numeric id', () => {
    const q = {x1: '1990-05-15', x33: '2001-09-11', t1: 'y', t33: 'y'};
    expect(getMaxYahrzeitId(q)).toBe(33);
  });

  it('ignores non-date name-only entries', () => {
    expect(getMaxYahrzeitId({n1: 'Test'})).toBe(0);
  });
});

describe('getAnniversaryTypes', () => {
  it('returns empty set when no type keys exist', () => {
    const types = getAnniversaryTypes({n1: 'Alice', x1: '1990-01-01'});
    expect(types.size).toBe(0);
  });

  it('recognises Yahrzeit (y)', () => {
    expect(getAnniversaryTypes({t1: 'y'}).has(YAHRZEIT)).toBe(true);
    expect(getAnniversaryTypes({t1: 'Yahrzeit'}).has(YAHRZEIT)).toBe(true);
  });

  it('recognises Birthday (b)', () => {
    expect(getAnniversaryTypes({t1: 'b'}).has(BIRTHDAY)).toBe(true);
    expect(getAnniversaryTypes({t1: 'Birthday'}).has(BIRTHDAY)).toBe(true);
  });

  it('recognises Anniversary (a)', () => {
    expect(getAnniversaryTypes({t1: 'a'}).has(ANNIVERSARY)).toBe(true);
  });

  it('maps Other type to Anniversary in the set', () => {
    const types = getAnniversaryTypes({t1: 'o'});
    expect(types.has(ANNIVERSARY)).toBe(true);
    expect(types.has(OTHER)).toBe(false);
  });

  it('handles multiple types across entries', () => {
    const types = getAnniversaryTypes({t1: 'y', t2: 'b'});
    expect(types.has(YAHRZEIT)).toBe(true);
    expect(types.has(BIRTHDAY)).toBe(true);
  });
});

describe('summarizeAnniversaryTypes', () => {
  it('returns Yahrzeit when query has no types', () => {
    expect(summarizeAnniversaryTypes({})).toBe(YAHRZEIT);
  });

  it('returns the single type present', () => {
    expect(summarizeAnniversaryTypes({t1: 'y'})).toBe(YAHRZEIT);
    expect(summarizeAnniversaryTypes({t1: 'b'})).toBe(BIRTHDAY);
    expect(summarizeAnniversaryTypes({t1: 'a'})).toBe(ANNIVERSARY);
  });

  it('returns Anniversary when multiple distinct types are present', () => {
    expect(summarizeAnniversaryTypes({t1: 'y', t2: 'b'})).toBe(ANNIVERSARY);
  });

  it('returns long-form descriptions when long=true', () => {
    expect(summarizeAnniversaryTypes({t1: 'b'}, true)).toBe('Hebrew Birthday');
    expect(summarizeAnniversaryTypes({t1: 'a'}, true)).toBe('Hebrew Anniversary');
    expect(summarizeAnniversaryTypes({t1: 'y', t2: 'b'}, true)).toBe('Hebrew Anniversaries');
  });

  it('long-form Birthday with multiple birthday entries', () => {
    expect(summarizeAnniversaryTypes({t1: 'b', t2: 'b'}, true)).toBe('Hebrew Birthday');
  });
});

describe('getCalendarNames', () => {
  it('returns empty array when no n-keys exist', () => {
    expect(getCalendarNames({})).toEqual([]);
  });

  it('collects non-empty name values', () => {
    const q = {n1: 'Alice', n2: 'Bob'};
    const names = getCalendarNames(q);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
  });

  it('excludes empty name strings', () => {
    const q = {n1: 'Alice', n2: ''};
    const names = getCalendarNames(q);
    expect(names).toContain('Alice');
    expect(names).not.toContain('');
    expect(names).toHaveLength(1);
  });

  it('ignores non-name keys', () => {
    const q = {n1: 'Alice', t1: 'y', x1: '1990-01-01'};
    expect(getCalendarNames(q)).toEqual(['Alice']);
  });
});

describe('makeCalendarTitle', () => {
  it('returns bare type when no names are present', () => {
    expect(makeCalendarTitle({}, 200)).toBe(YAHRZEIT);
    expect(makeCalendarTitle({t1: 'b'}, 200)).toBe('Hebrew Birthday');
  });

  it('appends colon-separated names after type', () => {
    const q = {n1: 'Alice', t1: 'y'};
    const title = makeCalendarTitle(q, 200);
    expect(title).toBe('Yahrzeit: Alice');
  });

  it('truncates to maxlen with ellipsis', () => {
    const q = {n1: 'A very long name that is quite long indeed', t1: 'y'};
    const title = makeCalendarTitle(q, 20);
    expect(title.length).toBeLessThanOrEqual(20);
    expect(title.endsWith('...')).toBe(true);
  });

  it('includes all names in a comma-separated list', () => {
    const q = {n1: 'Alice', n2: 'Bob', t1: 'y', t2: 'b'};
    const title = makeCalendarTitle(q, 200);
    expect(title).toContain('Alice');
    expect(title).toContain('Bob');
    expect(title).toContain(', ');
  });
});

describe('getYahrzeitDetailForId', () => {
  it('returns null when no date fields exist for the id', () => {
    expect(getYahrzeitDetailForId({}, 1)).toBeNull();
  });

  it('returns null when only partial y/m/d fields exist', () => {
    expect(getYahrzeitDetailForId({y1: '1990', m1: '5'}, 1)).toBeNull();
  });

  it('parses Yahrzeit from y/m/d fields', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'y', n1: 'Test'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail).not.toBeNull();
    expect(detail.type).toBe(YAHRZEIT);
    expect(detail.name).toBe('Test');
    expect(detail.afterSunset).toBe(false);
  });

  it('parses Birthday from compact x field', () => {
    const q = {x1: '1990-05-15', t1: 'b', n1: 'Test'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail).not.toBeNull();
    expect(detail.type).toBe(BIRTHDAY);
    expect(detail.name).toBe('Test');
  });

  it('sets afterSunset=true when s-key is "on"', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'y', n1: 'Test', s1: 'on'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail.afterSunset).toBe(true);
  });

  it('sets afterSunset=true when s-key is 1', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'y', n1: 'Test', s1: 1};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail.afterSunset).toBe(true);
  });

  it('auto-generates "PersonN" name when n-key is absent', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'y'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail.name).toBe('Person1');
  });

  it('auto-generates "UntitledN" name for Other type', () => {
    const q = {y1: '1990', m1: '5', d1: '15', t1: 'o'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail.type).toBe(OTHER);
    expect(detail.name).toBe('Untitled1');
  });

  it('defaults to Yahrzeit when type key is absent', () => {
    const q = {y1: '1990', m1: '5', d1: '15'};
    const detail = getYahrzeitDetailForId(q, 1);
    expect(detail.type).toBe(YAHRZEIT);
  });

  it('advances the date by one day when afterSunset is set', () => {
    const q1 = {y1: '1990', m1: '5', d1: '15', t1: 'y', s1: 'off'};
    const q2 = {y1: '1990', m1: '5', d1: '15', t1: 'y', s1: 'on'};
    const d1 = getYahrzeitDetailForId(q1, 1).day;
    const d2 = getYahrzeitDetailForId(q2, 1).day;
    expect(d2.diff(d1, 'day')).toBe(1);
  });
});

describe('compactJsonToSave', () => {
  it('converts y/m/d fields to a single x date field', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'Yahrzeit'};
    compactJsonToSave(obj);
    expect(obj.x1).toBe('1990-05-15');
    expect(obj.y1).toBeUndefined();
    expect(obj.m1).toBeUndefined();
    expect(obj.d1).toBeUndefined();
  });

  it('pads single-digit month and day', () => {
    const obj = {y1: '2003', m1: '3', d1: '7', t1: 'y'};
    compactJsonToSave(obj);
    expect(obj.x1).toBe('2003-03-07');
  });

  it('shortens anniversary type to its first lowercase character', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'Birthday'};
    compactJsonToSave(obj);
    expect(obj.t1).toBe('b');
  });

  it('shortens Yahrzeit type to "y"', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'Yahrzeit'};
    compactJsonToSave(obj);
    expect(obj.t1).toBe('y');
  });

  it('converts sunset "on" to 1', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', s1: 'on'};
    compactJsonToSave(obj);
    expect(obj.s1).toBe(1);
  });

  it('converts sunset "off" to 0', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', s1: 'off'};
    compactJsonToSave(obj);
    expect(obj.s1).toBe(0);
  });

  it('converts sunset numeric 1 to 1', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', s1: 1};
    compactJsonToSave(obj);
    expect(obj.s1).toBe(1);
  });

  it('converts years string to a number', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', years: '20'};
    compactJsonToSave(obj);
    expect(obj.years).toBe(20);
  });

  it('removes noSaveFields: ulid, v, ref_url, ref_text, lastModified', () => {
    const obj = {
      y1: '1990', m1: '5', d1: '15', t1: 'y',
      ulid: 'someid',
      v: 'yahrzeit',
      ref_url: 'https://example.com',
      ref_text: 'Example',
      lastModified: new Date(),
    };
    compactJsonToSave(obj);
    expect(obj.ulid).toBeUndefined();
    expect(obj.v).toBeUndefined();
    expect(obj.ref_url).toBeUndefined();
    expect(obj.ref_text).toBeUndefined();
    expect(obj.lastModified).toBeUndefined();
  });

  it('removes em when it is empty', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', em: ''};
    compactJsonToSave(obj);
    expect(obj.em).toBeUndefined();
  });

  it('keeps em when it is non-empty', () => {
    const obj = {y1: '1990', m1: '5', d1: '15', t1: 'y', em: 'user@example.com'};
    compactJsonToSave(obj);
    expect(obj.em).toBe('user@example.com');
  });

  it('handles multiple entries', () => {
    const obj = {
      y1: '1990', m1: '5', d1: '15', t1: 'Yahrzeit',
      y2: '2000', m2: '1', d2: '1', t2: 'Birthday',
      years: '10',
    };
    compactJsonToSave(obj);
    expect(obj.x1).toBe('1990-05-15');
    expect(obj.x2).toBe('2000-01-01');
    expect(obj.t1).toBe('y');
    expect(obj.t2).toBe('b');
    expect(obj.years).toBe(10);
  });
});
