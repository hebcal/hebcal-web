import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-download.js';
import {MockMysqlDb} from './mock-mysql.js';

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
  it('returns 200 CSV for /v4/.../hebcal_2026_patrick_eur.csv', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEQARgBIAEoATABQAFQAViX17kBYOoPagFziAEB2AEB/hebcal_2026_patrick_eur.csv');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/csv/);
    expect(response.text).toBeTruthy();
  });
});

describe('v4 PDF downloads', () => {
  it('returns 200 PDF for /v4/.../hebcal_2020_bayshore_gardens.pdf', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEYAUABWPaN_QFg5A9qAXN4EogBAQ/hebcal_2020_bayshore_gardens.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/pdf/);
  });

  it('returns 200 PDF for /v4/.../hebcal_2021_alberti.pdf', async () => {
    const response = await request(app.callback())
        .get('/v4/CAEYAUABUAFYr_7rAWDlD2oBc3gSiAEB/hebcal_2021_alberti.pdf');
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
});
