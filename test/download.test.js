import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import os from 'node:os';
import {HDate, calendar} from '@hebcal/core';
import '@hebcal/learning';
import {app} from '../src/app-download.js';
import {MockMysqlDb} from './mock-mysql.js';
import {downloadHref2} from '../src/makeDownloadProps.js';
import {deserializeDownload} from '../src/deserializeDownload.js';
import {limitIcsFeedLength, maxEventsIcsSub} from '../src/hebcal-download.js';
import {expectConditionalEtag} from './conditionalEtag.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('X-Backend header', () => {
  it.each([
    ['robots.txt', '/robots.txt', 200],
    ['redirect to www', '/', 302],
    ['not found', '/ical/bogus.ics', 404],
  ])('exposes the server hostname on %s', async (why, url, status) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(status);
    expect(response.headers['x-backend']).toBe(os.hostname());
  });

  it('exposes the server hostname on a caught error response', async () => {
    const response = await request(server).get('/export/hebcal.ics?v=2');
    expect(response.status).toBe(400);
    expect(response.headers['x-backend']).toBe(os.hostname());
  });

  it('exposes the server hostname on an uncaught error response', async () => {
    // Rejected by onlyGetAndHead(), which throws above the catch-all in
    // fixup0(), so Koa's default error handler writes this response.
    const response = await request(server).put('/robots.txt');
    expect(response.status).toBe(405);
    expect(response.headers['x-backend']).toBe(os.hostname());
  });
});

describe('HTTP methods other than GET and HEAD', () => {
  it.each(['put', 'post', 'delete'])('rejects %s with 405', async (method) => {
    const response = await request(server)[method]('/robots.txt');
    expect(response.status).toBe(405);
    expect(response.text).toContain('not allowed; use GET instead');
    expect(response.headers['allow']).toBe('GET, HEAD');
  });

  it('allows HEAD', async () => {
    const response = await request(server).head('/robots.txt');
    expect(response.status).toBe(200);
  });
});

describe('Static ICS files', () => {
  it('returns 404 for /ical/bogus.ics when file does not exist', async () => {
    const response = await request(server)
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
    const response = await request(server)
        .get(v2path)
        .redirects(0);
    expect(response.status).toBe(301);
    expect(response.headers.location).toMatch(/\/v4\//);
  });
});

describe('v4 ICS downloads', () => {
  it('returns 200 ICS for /v4/.../hebcal_Jerusalem.ics', async () => {
    const response = await request(server)
        .get('/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('returns 200 ICS for /v4/.../hebcal.ics', async () => {
    const response = await request(server)
        .get('/v4/CAEQARgBIAEoAUABagFzmAEBoAEB/hebcal.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });
});

describe('v4 CSV downloads', () => {
  it('returns 200 CSV for /v4/.../hebcal_2026_berlin.csv', async () => {
    const response = await request(server)
        .get('/v4/CAEQARgBIAEoATABQAFQAViPiLQBYOoPagFziAEB2AEB/hebcal_2026_berlin.csv');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/csv/);
    expect(response.text).toBeTruthy();
  });
});

describe('v4 PDF downloads', () => {
  it.each([
    ['/v4/.../hebcal_2020_new_york.pdf',
      '/v4/CAEYAUABWIWDuQJg5A9qAXN4EogBAQ/hebcal_2020_new_york.pdf'],
    ['/v4/.../hebcal_2021_toronto.pdf',
      '/v4/CAEYAUABWLm6-AJg5Q9qAXN4EogBAQ/hebcal_2021_toronto.pdf'],
    ['mm=2 (Hebrew months & Hebrew numerals)',
      '/v4/CAEQARgBIAEoATABQAFg6w9qAmVziAEBgAQC/hebcal_2027.pdf'],
  ])('returns 200 PDF for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/pdf/);
  });
});

describe('Compression', () => {
  const icsPath = '/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics';

  it('compresses with gzip when Accept-Encoding: gzip', async () => {
    const response = await request(server)
        .get(icsPath)
        .set('Accept-Encoding', 'gzip');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('compresses with brotli when Accept-Encoding: br', async () => {
    const response = await request(server)
        .get(icsPath)
        .set('Accept-Encoding', 'br');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('br');
  });

  it('compresses with zstd when Accept-Encoding: zstd', async () => {
    const response = await request(server)
        .get(icsPath)
        .set('Accept-Encoding', 'zstd');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('zstd');
  });
});

describe('export URLs with semicolon-separated parameters', () => {
  it('returns 200 ICS for /export with v=1 and Hebrew year via semicolons', async () => {
    const response = await request(server)
        .get('/export/99/59280703a5c3153d03f4794043e3e2.ics' +
            '?subscribe=1;year=5722;v=1;month=x;yt=H;nh=on;nx=on;i=on');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
  });

  it('returns 200 ICS for /export yahrzeit with v=yahrzeit via semicolons', async () => {
    const response = await request(server)
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
    const response = await request(server)
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('BEGIN:VCALENDAR');
    expect(response.text).toContain('Golda Meir');
  });

  it('includes day-before reminder events by default', async () => {
    const response = await request(server)
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Golda Meir Yahrzeit reminder');
  });

  it('omits day-before reminder events when yrem=0', async () => {
    const response = await request(server)
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics?yrem=0');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/calendar/);
    expect(response.text).toContain('Golda Meir');
    expect(response.text).not.toContain('Yahrzeit reminder');
  });

  it('omits day-before reminder events when yrem=off', async () => {
    const response = await request(server)
        .get('/v3/01jthv2t5k88yermamssn96pzf/golda_meir.ics?yrem=off');
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Yahrzeit reminder');
  });

  it('omits day-before reminder events from CSV export when yrem=0', async () => {
    const response = await request(server)
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
    await expectConditionalEtag(server, '/v4/CAEQARgBIAEoATABOAFQAVjglBFqAXNwMngomAEBoAEB/hebcal_Jerusalem.ics');
  });

  it('handles conditional requests for CSV', async () => {
    await expectConditionalEtag(server, '/v4/CAEQARgBIAEoATABQAFQAViPiLQBYOoPagFziAEB2AEB/hebcal_2026_berlin.csv');
  });

  it('handles conditional requests for PDF', async () => {
    await expectConditionalEtag(server, '/v4/CAEYAUABWIWDuQJg5A9qAXN4EogBAQ/hebcal_2020_new_york.pdf');
  });
});

describe('limitIcsFeedLength truncation notice', () => {
  it('appends a synthetic truncation notice when feed exceeds the limit', () => {
    const year = 2024;
    const events = calendar({
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
    expect(limited).toHaveLength(maxEventsIcsSub + 1);
    const lastEvent = limited.at(-1);
    const prevEvent = limited.at(-2);
    expect(lastEvent.render()).toContain('truncated');
    expect(lastEvent.getDate().abs()).toBe(prevEvent.getDate().abs() + 1);
  });

  it('returns events unchanged when below the limit', () => {
    const events = calendar({
      year: 2024,
      isHebrewYear: false,
    });
    expect(events.length).toBeLessThan(maxEventsIcsSub);
    const today = new HDate(new Date(2024, 0, 1));
    const limited = limitIcsFeedLength(events, true, today);
    expect(limited).toBe(events);
  });
});

describe('Zmanim ICS bad-parameter hardening', () => {
  it('returns 400 (not 500) for a polar latitude with no events', async () => {
    const res = await request(server)
        .get('/zmanim?cfg=ics&geo=pos&latitude=90&longitude=0&tzid=UTC');
    expect(res.status).toBe(400);
  });

  it('still serves normal zmanim ICS', async () => {
    const res = await request(server)
        .get('/zmanim?geo=pos&latitude=40.7&longitude=-74&tzid=America/New_York');
    expect(res.status).toBe(200);
    expect(res.type).toContain('calendar');
  });
});

/**
 * Returns the VEVENT block whose SUMMARY matches
 * @param {string} ics
 * @param {string} summary
 * @return {string|undefined}
 */
function findVevent(ics, summary) {
  return ics.split('BEGIN:VEVENT')
      .find((block) => block.includes(`SUMMARY:${summary}\r\n`))
      ?.split('END:VEVENT')[0]
      ?.replaceAll(/DTSTAMP:\d{8}T\d{6}Z\r\n/g, '');
}

// The iCalendar DESCRIPTION is now assembled in this repo (src/icalCommon.js)
// instead of @hebcal/icalendar. The expectations below are verbatim copies of
// what /export/hebcal.ics emitted before the move.
describe('ICS DESCRIPTION contents', () => {
  it('combines the parsha summary, Torah reading and URL', async () => {
    const response = await request(server)
        .get('/export/hebcal.ics?v=1&s=on&year=2026&yt=G&month=x');
    expect(response.status).toBe(200);
    expect(findVevent(response.text, 'Parashat Tazria-Metzora')).toBe(
        '\r\n' +
        'CATEGORIES:Parsha\r\n' +
        'SUMMARY:Parashat Tazria-Metzora\r\n' +
        'DTSTART;VALUE=DATE:20260418\r\n' +
        'DTEND;VALUE=DATE:20260419\r\n' +
        'UID:hebcal-20260418-5298c428\r\n' +
        'TRANSP:TRANSPARENT\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'DESCRIPTION:Tazria (“She Bears Seed”) opens by describing the purifica\r\n' +
        ' tion process for a woman after childbirth. It then describes different for\r\n' +
        ' ms of tzara’at\\, a discoloration condition on skin or clothing\\, and the\r\n' +
        '  requirement of an infected person to dwell alone outside the camp and be \r\n' +
        ' inspected by a priest.\\n Metzora opens by describing the purification proc\r\n' +
        ' ess and accompanying sacrifices for one infected with tzara’at\\, a disco\r\n' +
        ' loration condition on the skin\\, clothing\\, or house. It then describes th\r\n' +
        ' e process of treating a house infected with tzara’at and the ritual impu\r\n' +
        ' rity generated by certain bodily discharges.\\n\\nTorah: Leviticus 12:1-15:3\r\n' +
        ' 3\\; Numbers 28:9-15\\nHaftarah: Isaiah 66:1-24 | Shabbat Rosh Chodesh\\n\\nht\r\n' +
        ' tps://hebcal.com/s/5786/27d?uc=ical-diaspora-2026-2030\r\n');
  });

  it('renders the Omer count in English, Hebrew and transliteration', async () => {
    const response = await request(server)
        .get('/export/hebcal.ics?v=1&o=on&c=on&geo=geoname&geonameid=5128581&b=18&year=2026&yt=G&month=x');
    expect(response.status).toBe(200);
    expect(findVevent(response.text, '1st day of the Omer')).toContain(
        'DESCRIPTION:Today is 1 day of the Omer\\n\\nהַיּוֹם יוֹם אֶחָ\r\n' +
        ' ד לָעֽוֹמֶר\\n\\nLovingkindness within Lovingkindness\\nחֶֽסֶ\r\n' +
        ' ד שֶׁבְּחֶֽסֶד\\nChesed sheb\'Chesed\r\n');
  });

  it('honors utm_source, utm_medium and utm_campaign', async () => {
    const response = await request(server)
        .get('/export/hebcal.ics?v=1&maj=on&year=2026&yt=G&month=3' +
            '&utm_source=zzz&utm_medium=yyy&utm_campaign=xxx');
    expect(response.status).toBe(200);
    expect(findVevent(response.text, 'Erev Purim')).toContain(
        'DESCRIPTION:Celebration of Jewish deliverance as told by Megilat Esther. I\r\n' +
        ' t commemorates a time when the Jewish people living in Persia were saved f\r\n' +
        ' rom extermination\\n\\nTorah: Esther 1:1-10:3\\n\\nhttps://hebcal.com/h/purim-\r\n' +
        ' 2026?us=zzz&um=yyy&uc=xxx\r\n');
  });

  it('adds i=on to Israel URLs', async () => {
    const response = await request(server)
        .get('/export/hebcal.ics?v=1&maj=on&i=on&year=2026&yt=G&month=3');
    expect(response.status).toBe(200);
    expect(findVevent(response.text, 'Erev Purim')).toContain(
        'https://hebcal.com/h/purim-\r\n 2026?i=on&uc=ical-israel-march-2026\r\n');
  });

  it('leaves candle lighting and havdalah without a DESCRIPTION', async () => {
    const response = await request(server)
        .get('/export/hebcal.ics?v=1&c=on&geo=geoname&geonameid=5128581&b=18&M=on&year=2026&yt=G&month=3');
    expect(response.status).toBe(200);
    expect(findVevent(response.text, 'Candle lighting')).not.toContain('DESCRIPTION:C');
    expect(findVevent(response.text, 'Havdalah')).not.toContain('DESCRIPTION:H');
  });
});
