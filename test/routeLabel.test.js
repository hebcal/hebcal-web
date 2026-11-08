import {describe, it, expect} from 'vitest';
import {routeLabel} from '../src/app-common.js';

const www = new Set([
  '/', 'converter', 'shabbat', 'shabbat/browse', 'hebcal', 'holidays',
  'sedrot', 'omer', 'yahrzeit', 'ical', 'learning',
]);

describe('routeLabel', () => {
  it('uses the first segment for known routes', () => {
    expect(routeLabel('/', www)).toBe('/');
    expect(routeLabel('/shabbat', www)).toBe('/shabbat');
    expect(routeLabel('/shabbat/fridge.cgi', www)).toBe('/shabbat');
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
  it('splits /shabbat/browse out of /shabbat', () => {
    expect(routeLabel('/shabbat/browse', www)).toBe('/shabbat/browse');
    expect(routeLabel('/shabbat/browse/', www)).toBe('/shabbat/browse');
    expect(routeLabel('/shabbat/browse/united-states', www))
        .toBe('/shabbat/browse');
    expect(routeLabel('/shabbat/browse/united-states.xml', www))
        .toBe('/shabbat/browse');
    expect(routeLabel('/shabbat/browsex', www)).toBe('/shabbat');
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

describe('routeLabel with two-segment entries', () => {
  const dl = new Set(['v2/h', 'v2/y', 'v2', 'v3']);
  it('prefers a two-segment match', () => {
    expect(routeLabel('/v2/h/abc/hebcal.ics', dl)).toBe('/v2/h');
    expect(routeLabel('/v2/y/abc/yahrzeit.ics', dl)).toBe('/v2/y');
    expect(routeLabel('/v2/h', dl)).toBe('/v2/h');
  });
  it('falls back to the first segment', () => {
    expect(routeLabel('/v2/x/abc.ics', dl)).toBe('/v2');
    expect(routeLabel('/v2/hh/abc.ics', dl)).toBe('/v2');
    expect(routeLabel('/v2', dl)).toBe('/v2');
    expect(routeLabel('/v3/01abc/yahrzeit.ics', dl)).toBe('/v3');
  });
  it('does not match a two-segment entry without its first segment', () => {
    const only = new Set(['v2/h']);
    expect(routeLabel('/v2/y/abc.ics', only)).toBe('other');
    expect(routeLabel('/v2', only)).toBe('other');
  });
});

describe('routeLabel with cfg entries', () => {
  const www = new Set(['/', 'hebcal', 'shabbat', 'hebcal?cfg=json']);
  it('splits out a listed cfg value', () => {
    expect(routeLabel('/hebcal?cfg=json', www)).toBe('/hebcal?cfg=json');
    expect(routeLabel('/hebcal?cfg=json&v=1', www)).toBe('/hebcal?cfg=json');
    expect(routeLabel('/hebcal?v=1&cfg=json', www)).toBe('/hebcal?cfg=json');
  });
  it('keeps the base label for anything else', () => {
    expect(routeLabel('/hebcal', www)).toBe('/hebcal');
    expect(routeLabel('/hebcal?v=1', www)).toBe('/hebcal');
    expect(routeLabel('/hebcal?cfg=ics', www)).toBe('/hebcal');
    expect(routeLabel('/hebcal?cfg=jsonx', www)).toBe('/hebcal');
    expect(routeLabel('/hebcal?xcfg=json', www)).toBe('/hebcal');
    expect(routeLabel('/shabbat?cfg=json', www)).toBe('/shabbat');
    expect(routeLabel('/?cfg=json', www)).toBe('/');
  });
  it('strips the query before matching the path', () => {
    expect(routeLabel('/?a=b', www)).toBe('/');
    expect(routeLabel('/hebcalx?cfg=json', www)).toBe('other');
    expect(routeLabel('/random?cfg=json', www)).toBe('other');
  });
});
