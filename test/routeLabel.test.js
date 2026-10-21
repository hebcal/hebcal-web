import {describe, it, expect} from 'vitest';
import {routeLabel} from '../src/app-common.js';

describe('routeLabel', () => {
  it('uses the first segment for known routes', () => {
    expect(routeLabel('/')).toBe('/');
    expect(routeLabel('/shabbat')).toBe('/shabbat');
    expect(routeLabel('/shabbat/browse/US')).toBe('/shabbat');
    expect(routeLabel('/v3/01abc/yahrzeit.ics')).toBe('/v3');
    expect(routeLabel('/v4/abc/hebcal.ics')).toBe('/v4');
    expect(routeLabel('/converter')).toBe('/converter');
    expect(routeLabel('/holidays/rosh-hashana-2026')).toBe('/holidays');
    expect(routeLabel('/yahrzeit/edit/01abc')).toBe('/yahrzeit');
  });
  it('buckets everything else as other', () => {
    expect(routeLabel('/wp-login.php')).toBe('other');
    expect(routeLabel('/robots.txt')).toBe('other');
    expect(routeLabel('/export/export.ics')).toBe('other');
    expect(routeLabel('/shabbatx')).toBe('other');
    expect(routeLabel('/random/scanner/path')).toBe('other');
  });
});
