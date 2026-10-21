import {describe, it, expect} from 'vitest';
import {routeLabel} from '../src/app-common.js';

describe('routeLabel', () => {
  it('uses the first segment for known routes', () => {
    expect(routeLabel('/')).toBe('/');
    expect(routeLabel('/shabbat')).toBe('/shabbat');
    expect(routeLabel('/shabbat/browse/US')).toBe('/shabbat');
    expect(routeLabel('/ical/foo.ics')).toBe('/ical');
    expect(routeLabel('/learning/x')).toBe('/learning');
    expect(routeLabel('/converter')).toBe('/converter');
    expect(routeLabel('/holidays/rosh-hashana-2026')).toBe('/holidays');
    expect(routeLabel('/yahrzeit/edit/01abc')).toBe('/yahrzeit');
  });
  it('buckets everything else as other', () => {
    expect(routeLabel('/wp-login.php')).toBe('other');
    expect(routeLabel('/robots.txt')).toBe('other');
    expect(routeLabel('/export/export.ics')).toBe('other');
    expect(routeLabel('/v3/01abc/yahrzeit.ics')).toBe('other');
    expect(routeLabel('/v4/abc/hebcal.ics')).toBe('other');
    expect(routeLabel('/shabbatx')).toBe('other');
    expect(routeLabel('/random/scanner/path')).toBe('other');
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
