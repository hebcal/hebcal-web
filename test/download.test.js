import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {HDate, HebrewCalendar} from '@hebcal/core';
import '@hebcal/learning';
import {app} from '../src/app-download.js';
import {MockMysqlDb} from './mock-mysql.js';
import {downloadHref2} from '../src/makeDownloadProps.js';
import {deserializeDownload} from '../src/deserializeDownload.js';
import {limitIcsFeedLength, maxEventsIcsSub} from '../src/hebcal-download.js';
import {expectConditionalEtag} from './conditionalEtag.js';

beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('Static ICS files', () => {
  it('returns 404 for /ical/bogus.ics when file does not exist', async () => {
    const response = await request(app.callback())
        .get('/ical/bogus.ics');
    expect(response.status).toBe(404);
  });
});

describe('v2 redirects', () => {
  it('redirects /v2/h/ URL with v=1 and year=now to v4 with 301', async () => {
    const v2path = '/v2/h/dj0xJm1haj1vbiZtaW49b24mbng9b24mbWY9b24mc3M9b24' +
        'mbW9kPW9uJm89b24mcz1vbiZpPW9mZiZ5ZWFyPW5vdyZ5dD1HJmxnPWZyJmQ9b24m' +
        'Yz1vbiZnZW89Z2VvbmFtZSZnZW9uYW1laWQ9Mjk4ODUwNyZiPTE4Jk09b2ZmJm09ND' +
        'Umc3Vic2NyaWJlPTE/hebcal_2020_Paris.ics';
    const response = await request(app.callback())
        .get(v2path)
        .redirects(0);
    expect(response.status).toBe(301);
    expect(response.headers.location).toMatch(/\/v4\//);
  });
});

describe('v4 ICS downloads', () => {
  it('returns 200 ICS for /v4/.../hebcal_Jerusalem.ics', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('returns 200 ICS for /v4/.../hebcal.ics', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEQARgBIAEoAUABagFzmAEBoAEB/hebcal.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });
});

describe('v4 CSV downloads', () => {
  it('returns 200 CSV for /v4/.../hebcal_2026_berlin.csv', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEQARgBIAEoATABQAFQAViPiLQBYOoPagFziAEB2AEB/hebcal_2026_berlin.csv');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/csv/);
    expect(response.text).toBeTruthy();
  });
});

describe('v4 PDF downloads', () => {
  it('returns 200 PDF for /v4/.../hebcal_2020_new_york.pdf', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEYAUABWIWDuQJg5A9qAXN4EogBAQ/hebcal_2020_new_york.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/pdf/);
  });

  it('returns 200 PDF for /v4/.../hebcal_2021_toronto.pdf', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEYAUABWLm6-AJg5Q9qAXN4EogBAQ/hebcal_2021_toronto.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/pdf/);
  });

  it('returns 200 PDF for mm=2 (Hebrew months & Hebrew numerals)', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEQARgBIAEoATABQAFg6w9qAmVziAEBgAQC/hebcal_2027.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/pdf/);
  });
});

describe('Compression', () => {
  const icsPath = '/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics';

  it('compresses with gzip when Accept-Encoding: gzip', async () => {
    const response = await request(app.callback())
        .get(icsPath)
        .set('Accept-Encoding', 'gzip');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('compresses with brotli when Accept-Encoding: br', async () => {
    const response = await request(app.callback())
        .get(icsPath)
        .set('Accept-Encoding', 'br');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('br');
  });

  it('compresses with zstd when Accept-Encoding: zstd', async () => {
    const response = await request(app.callback())
        .get(icsPath)
        .set('Accept-Encoding', 'zstd');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('zstd');
  });
});

describe('export URLs with semicolon-separated parameters', () => {
  it('returns 200 ICS for /export with v=1 and Hebrew year via semicolons', async () => {
    const response = await request(app.callback())
        .get('/export/99/59280703a5c3153d03f4794043e3e2.ics' +
            '?subscribe=1;year=5722;v=1;month=x;yt=H;nh=on;nx=on;i=on');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('returns 200 ICS for /export yahrzeit with v=yahrzeit via semicolons', async () => {
    const response = await request(app.callback())
        .get('/export/74/9cf0af2d92f0843bb84e1eb7956854.ics' +
            '?subscribe=1;t1=Yahrzeit;d1=23;m1=12;y1=2003;n1=Ploni%20Almoni;hebdate=on;years=20;v=yahrzeit');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
    expect(response.text).toContain('Ploni Almoni');
  });
});

describe('v3 yahrzeit subscription downloads', () => {
  it('returns 200 ICS for /v3/.../golda_meir.ics', async () => {
    const response = await request(app.callback())
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
    expect(response.text).toContain('Golda Meir');
  });

  it('includes day-before reminder events by default', async () => {
    const response = await request(app.callback())
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Golda Meir Yahrzeit reminder');
  });

  it('omits day-before reminder events when yrem=0', async () => {
    const response = await request(app.callback())
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics?yrem=0');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('Golda Meir');
    expect(response.text).not.toContain('Yahrzeit reminder');
  });

  it('omits day-before reminder events when yrem=off', async () => {
    const response = await request(app.callback())
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics?yrem=off');
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Yahrzeit reminder');
  });

  it('omits day-before reminder events from CSV export when yrem=0', async () => {
    const response = await request(app.callback())
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.csv?yrem=0');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/csv/);
    expect(response.text).not.toContain('Yahrzeit reminder');
  });
});

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

describe('304 Not Modified (ETag / If-None-Match)', () => {
  it('handles conditional requests for ICS', async () => {
    await expectConditionalEtag(app, '/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics');
  });

  it('handles conditional requests for CSV', async () => {
    await expectConditionalEtag(app, '/v4/CAEQARgBIAEoATABQAFQAViPiLQBYOoPagFziAEB2AEB/hebcal_2026_berlin.csv');
  });

  it('handles conditional requests for PDF', async () => {
    await expectConditionalEtag(app, '/v4/CAEYAUABWIWDuQJg5A9qAXN4EogBAQ/hebcal_2020_new_york.pdf');
  });
});

describe('limitIcsFeedLength truncation notice', () => {
  it('appends a synthetic truncation notice when feed exceeds the limit', () => {
    const year = 2024;
    const events = HebrewCalendar.calendar({
      year,
      isHebrewYear: false,
      noHolidays: true,
      dailyLearning: {
        dafYomi: true,
        mishnaYomi: true,
        perekYomi: true,
        nachYomi: true,
        tanakhYomi: true,
        psalms: true,
        rambam1: true,
        rambam3: true,
        seferHaMitzvot: true,
        'yerushalmi-vilna': true,
        chofetzChaim: true,
        shemiratHaLashon: true,
        dirshuAmudYomi: true,
        arukhHaShulchanYomi: true,
        kitzurShulchanAruch: true,
      },
    });
    expect(events.length).toBeGreaterThan(maxEventsIcsSub);
    const today = new HDate(new Date(year, 0, 1));
    const limited = limitIcsFeedLength(events, true, today);
    expect(limited.length).toBe(maxEventsIcsSub + 1);
    const lastEvent = limited.at(-1);
    const prevEvent = limited.at(-2);
    expect(lastEvent.render()).toContain('truncated');
    expect(lastEvent.getDate().abs()).toBe(prevEvent.getDate().abs() + 1);
  });

  it('returns events unchanged when below the limit', () => {
    const events = HebrewCalendar.calendar({
      year: 2024,
      isHebrewYear: false,
    });
    expect(events.length).toBeLessThan(maxEventsIcsSub);
    const today = new HDate(new Date(2024, 0, 1));
    const limited = limitIcsFeedLength(events, true, today);
    expect(limited).toBe(events);
  });
});
