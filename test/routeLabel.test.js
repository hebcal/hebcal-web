import {describe, it, expect} from 'vitest';
import {routeLabel} from '../src/app-common.js';

const www = new Set([
  '/', 'converter', 'shabbat', 'hebcal', 'holidays', 'sedrot', 'omer',
  'yahrzeit', 'ical', 'learning',
]);

describe('routeLabel', () => {
  it('uses the first segment for known routes', () => {
    expect(routeLabel('/', www)).toBe('/');
    expect(routeLabel('/shabbat', www)).toBe('/shabbat');
    expect(routeLabel('/shabbat/browse/US', www)).toBe('/shabbat');
    expect(routeLabel('/ical/foo.ics', www)).toBe('/ical');
    expect(routeLabel('/learning/x', www)).toBe('/learning');
    expect(routeLabel('/converter', www)).toBe('/converter');
    expect(routeLabel('/holidays/rosh-hashana-2026', www)).toBe('/holidays');
    expect(routeLabel('/yahrzeit/edit/01abc', www)).toBe('/yahrzeit');
  });
  it('buckets everything else as other', () => {
    expect(routeLabel('/wp-login.php', www)).toBe('other');
    expect(routeLabel('/robots.txt', www)).toBe('other');
    expect(routeLabel('/export/export.ics', www)).toBe('other');
    expect(routeLabel('/v3/01abc/yahrzeit.ics', www)).toBe('other');
    expect(routeLabel('/v4/abc/hebcal.ics', www)).toBe('other');
    expect(routeLabel('/shabbatx', www)).toBe('other');
    expect(routeLabel('/random/scanner/path', www)).toBe('other');
  });
});

describe('routeLabel with a custom segment set', () => {
  const dl = new Set(['v2', 'v3', 'v4', 'ical', 'export']);
  it('labels only the listed segments', () => {
    expect(routeLabel('/v4/abc/hebcal.ics', dl)).toBe('/v4');
    expect(routeLabel('/export/export.ics', dl)).toBe('/export');
    expect(routeLabel('/ical/foo.ics', dl)).toBe('/ical');
  });
  it('folds everything else, including "/", into other', () => {
    expect(routeLabel('/', dl)).toBe('other');
    expect(routeLabel('/learning/x', dl)).toBe('other');
    expect(routeLabel('/hebcal', dl)).toBe('other');
  });
});
