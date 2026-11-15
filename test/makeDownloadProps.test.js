import {describe, it, expect} from 'vitest';
import {HDate} from '@hebcal/core';
import {downloadHref2, makeDlUrlsForScript, makeDownloadProps, useStaticIcalFeed} from '../src/makeDownloadProps.js';
import {dailyLearningConfig} from '../src/urlArgs.js';
// download.hebcal.com is served by hebcal-api-go, which decodes these /v4/
// tokens. This test-only decoder round-trips what makeDownloadProps encodes,
// so a missing or mismatched download.proto field still fails here.
import {deserializeDownload} from './deserializeDownload.js';

describe('Dirshu Amud HaYomi protobuf round-trip', () => {
  it('should serialize and deserialize ayd=on correctly', () => {
    const query = {
      v: '1',
      maj: 'on',
      year: '2026',
      ayd: 'on',
      geonameid: '281184',
      lg: 's',
      M: 'on',
    };
    const href = downloadHref2(query, 'test.ics');
    // Extract base64 encoded protobuf from the URL path
    const match = href.match(/\/v4\/([^/]+)\//);
    expect(match).toBeTruthy();
    const encoded = match[1]
        .replaceAll('-', '+')
        .replaceAll('_', '/');
    const result = deserializeDownload(encoded);
    expect(result.ayd).toBe('on');
    expect(result.maj).toBe('on');
  });

  it('should not include ayd when not set', () => {
    const query = {
      v: '1',
      maj: 'on',
      year: '2026',
      geonameid: '281184',
      lg: 's',
      M: 'on',
    };
    const href = downloadHref2(query, 'test.ics');
    const match = href.match(/\/v4\/([^/]+)\//);
    const encoded = match[1]
        .replaceAll('-', '+')
        .replaceAll('_', '/');
    const result = deserializeDownload(encoded);
    expect(result.ayd).toBeUndefined();
  });
});

describe('daily learning protobuf round-trip', () => {
  const learningCfgs = dailyLearningConfig.filter((cfg) => cfg.dailyLearningOptName);
  it.each(learningCfgs.map((cfg) => [cfg.queryParam, cfg.protocName]))(
      'should serialize and deserialize %s=on (%s)', (queryParam) => {
        const query = {v: '1', maj: 'on', year: '2026', geonameid: '281184', [queryParam]: 'on'};
        const href = downloadHref2(query, 'test.ics');
        const encoded = href.match(/\/v4\/([^/]+)\//)[1]
            .replaceAll('-', '+')
            .replaceAll('_', '/');
        const result = deserializeDownload(encoded);
        expect(result[queryParam]).toBe('on');
        for (const other of learningCfgs) {
          if (other.queryParam !== queryParam) {
            expect(result[other.queryParam]).toBeUndefined();
          }
        }
      });
});

// https://github.com/hebcal/hebcal/issues/308
describe('td protobuf round-trip', () => {
  it('should serialize and deserialize td correctly', () => {
    const query = {
      v: '1',
      maj: 'on',
      year: '2026',
      geonameid: '281184',
      lg: 's',
      td: '16.1',
    };
    const href = downloadHref2(query, 'test.ics');
    const match = href.match(/\/v4\/([^/]+)\//);
    expect(match).toBeTruthy();
    const encoded = match[1]
        .replaceAll('-', '+')
        .replaceAll('_', '/');
    const result = deserializeDownload(encoded);
    const td = Number.parseFloat(result.td);
    expect(typeof td).toBe('number');
    expect(td).toBeCloseTo(16.1, 4);
  });

  it('should not include td when not set', () => {
    const query = {
      v: '1',
      maj: 'on',
      year: '2026',
      geonameid: '281184',
      lg: 's',
      M: 'on',
    };
    const href = downloadHref2(query, 'test.ics');
    const match = href.match(/\/v4\/([^/]+)\//);
    const encoded = match[1]
        .replaceAll('-', '+')
        .replaceAll('_', '/');
    const result = deserializeDownload(encoded);
    expect(result.td).toBeUndefined();
  });
});

describe('fast start/end protobuf round-trip', () => {
  const base = {
    v: '1',
    maj: 'on',
    mf: 'on',
    c: 'on',
    year: '2026',
    geo: 'pos',
    latitude: '40.7128',
    longitude: '-74.006',
    tzid: 'America/New_York',
    lg: 's',
    M: 'on',
  };

  function roundTrip(query) {
    const href = downloadHref2(query, 'test.ics');
    const encoded = href.match(/\/v4\/([^/]+)\//)[1]
        .replaceAll('-', '+')
        .replaceAll('_', '/');
    return deserializeDownload(encoded);
  }

  it('round-trips fsd, fed and tbed (float) and fsm, fem and tbem (uint32)', () => {
    const result = roundTrip({...base, fsd: '19.8', fed: '8.5', tbed: '6.45'});
    expect(result.fsd).toBe('19.8');
    expect(result.fed).toBe('8.5');
    expect(result.tbed).toBe('6.45');
    for (const key of ['fsm', 'fem', 'tbem']) {
      expect(result[key]).toBeUndefined();
    }

    const result2 = roundTrip({...base, fsm: '72', fem: '20', tbem: '50'});
    expect(result2.fsm).toBe('72');
    expect(result2.fem).toBe('20');
    expect(result2.tbem).toBe('50');
    for (const key of ['fsd', 'fed', 'tbed']) {
      expect(result2[key]).toBeUndefined();
    }
  });

  it('round-trips 7.083 without float noise', () => {
    expect(roundTrip({...base, fsd: '7.083'}).fsd).toBe('7.083');
  });

  it('degrees wins when both are given', () => {
    const result = roundTrip({...base, fsd: '16.1', fsm: '72', fed: '7.083', fem: '20'});
    expect(result.fsd).toBe('16.1');
    expect(result.fsm).toBeUndefined();
    expect(result.fed).toBe('7.083');
    expect(result.fem).toBeUndefined();
  });

  it('leaves the token unchanged when the parameters are absent or invalid', () => {
    const href = downloadHref2(base, 'test.ics');
    const invalid = {
      ...base, fsd: 'abc', fsm: '0', fed: '-0', fem: 'x', tbed: '90', tbem: '999',
    };
    expect(downloadHref2(invalid, 'test.ics')).toBe(href);
    const result = roundTrip(base);
    for (const key of ['fsd', 'fsm', 'fed', 'fem', 'tbed', 'tbem']) {
      expect(result[key]).toBeUndefined();
    }
  });
});

describe('makeDlUrlsForScript', () => {
  const host = 'http://127.0.0.1:8081';

  it('strips the download host and keeps only what the script reads', () => {
    const subical = downloadHref2({v: '1', maj: 'on', year: 'now'}, 'hebcal_x', {subscribe: '1'}) + '.ics';
    const url = {
      subical,
      ics1year: `${host}/v4/abc/hebcal_x.ics`,
      webcal: subical.replace(/^http/, 'webcal'),
      gcal: subical,
      pdf: 'http://127.0.0.1:8082/v4/abc/hebcal_x.pdf',
      csv_usa: 'http://127.0.0.1:8082/v4/abc/hebcal_x_usa.csv',
      title: 'Hebcal Test',
    };
    const result = makeDlUrlsForScript(url);
    expect(result).toEqual({
      host,
      apiHost: 'http://127.0.0.1:8082',
      subical: subical.substring(host.length),
      ics1year: '/v4/abc/hebcal_x.ics',
      icsMultiYear: undefined,
      csv_usa: '/v4/abc/hebcal_x_usa.csv',
      csv_eur: undefined,
      pdf: '/v4/abc/hebcal_x.pdf',
      title: 'Hebcal Test',
    });
    expect(result.subical).toMatch(/^\/v4\//);
    expect(JSON.stringify(result)).not.toMatch(/127\.0\.0\.1:808[12]\//);
    expect(new URL(result.subical, result.host).href).toBe(subical);
  });

  it('leaves a URL on another host absolute', () => {
    const subical = 'https://download.hebcal.com/ical/omer.ics';
    const result = makeDlUrlsForScript({subical, ics1year: `${host}/v3/x/y.ics?dl=1`});
    expect(result.subical).toBe(subical);
    expect(result.ics1year).toBe('/v3/x/y.ics?dl=1');
    expect(new URL(result.subical, result.host).href).toBe(subical);
  });
});

describe('makeDownloadProps multi-year download', () => {
  const host = 'http://127.0.0.1:8081';
  /**
   * @param {string} url
   * @return {Object}
   */
  function decode(url) {
    const path = url.substring(host.length);
    const encoded = path.split('/')[2];
    return deserializeDownload(encoded);
  }

  it('adds a Gregorian multi-year .ics', () => {
    const ctx = {state: {}};
    const q = {v: '1', maj: 'on', min: 'on', year: '2019', yt: 'G'};
    makeDownloadProps(ctx, q, {year: 2019}, 7);
    expect(ctx.state.filename.icsMultiYear).toBe('hebcal_2019_2025.ics');
    expect(ctx.state.downloadMultiYearTitle).toBe('2019-2025');
    expect(ctx.state.url.icsMultiYear).toMatch(/^http:\/\/127\.0\.0\.1:8081\/v4\/.+\/hebcal_2019_2025\.ics$/);
    const q2 = decode(ctx.state.url.icsMultiYear);
    expect(q2.year).toBe(2019);
    expect(q2.ny).toBe(7);
    expect(q2.yt).toBe('G');
    expect(q2.maj).toBe('on');
    // the single-year download is unchanged
    expect(ctx.state.filename.ics).toBe('hebcal_2019.ics');
    expect(decode(ctx.state.url.ics1year).ny).toBe(1);
    expect(makeDlUrlsForScript(ctx.state.url).icsMultiYear).toMatch(/^\/v4\/.+\/hebcal_2019_2025\.ics$/);
  });

  it('sets the download modal state', () => {
    const ctx = {state: {}};
    makeDownloadProps(ctx, {v: '1', maj: 'on', year: '2019'}, {year: 2019}, 7);
    expect(ctx.state.numYears).toBe(7);
    expect(ctx.state.currentYear).toBe(new Date().getFullYear());
    expect(ctx.state.downloadAltTitle).toBe('2019 only');
    // the PDF tab is opt-in (only /hebcal adds it)
    expect(ctx.state.filename.pdf).toBeUndefined();
    expect(ctx.state.url.pdf).toMatch(/\/hebcal_2019\.pdf$/);

    const ctx2 = {state: {}};
    makeDownloadProps(ctx2, {v: '1', o: 'on', year: '5787', yt: 'H'}, {year: 5787, isHebrewYear: true}, 3);
    expect(ctx2.state.currentYear).toBe(new HDate().getFullYear());
    expect(ctx2.state.downloadAltTitle).toBe('5787 only');

    const ctx3 = {state: {}};
    makeDownloadProps(ctx3, {v: '1', maj: 'on'}, {}, 4);
    expect(ctx3.state.downloadAltTitle).toBeUndefined();
  });

  it('useStaticIcalFeed points the subscribe links at /ical/', () => {
    const ctx = {state: {}};
    makeDownloadProps(ctx, {v: '1', o: 'on', year: '5787', yt: 'H'}, {year: 5787, isHebrewYear: true}, 3);
    const ics1year = ctx.state.url.ics1year;
    useStaticIcalFeed(ctx, 'omer');
    expect(ctx.state.url.subical).toBe('https://download.hebcal.com/ical/omer.ics');
    expect(ctx.state.url.webcal).toBe('webcal://download.hebcal.com/ical/omer.ics');
    expect(ctx.state.url.gcal).toBe('http://download.hebcal.com/ical/omer.ics');
    expect(ctx.state.url.ics1year).toBe(ics1year);
  });

  it('adds a Hebrew multi-year .ics', () => {
    const ctx = {state: {}};
    const q = {v: '1', o: 'on', year: '5787', yt: 'H'};
    makeDownloadProps(ctx, q, {year: 5787, isHebrewYear: true}, 3);
    expect(ctx.state.filename.icsMultiYear).toBe('hebcal_5787h_5789h.ics');
    expect(ctx.state.downloadMultiYearTitle).toBe('5787-5789');
    const q2 = decode(ctx.state.url.icsMultiYear);
    expect(q2.year).toBe(5787);
    expect(q2.ny).toBe(3);
    expect(q2.yt).toBe('H');
  });

  for (const [name, options, numYears] of [
    ['numYears is 1', {year: 2019}, 1],
    ['the calendar is a single month', {year: 2019, month: 3}, 7],
    ['there is no year', {}, 7],
  ]) {
    it(`omits the multi-year .ics when ${name}`, () => {
      const ctx = {state: {}};
      makeDownloadProps(ctx, {v: '1', maj: 'on', year: '2019'}, options, numYears);
      expect(ctx.state.url.icsMultiYear).toBeUndefined();
      expect(ctx.state.filename.icsMultiYear).toBeUndefined();
      expect(ctx.state.downloadMultiYearTitle).toBeUndefined();
    });
  }
});
