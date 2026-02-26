
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {injectZipsMock} from './zipsMock.js';

describe('Shabbat Routes', () => {
  it('should handle semicolon-separated query parameters', async () => {
    const response = await request(app.callback())
        .get('/shabbat/?geo=city;city=Toronto;m=42;cfg=j;tgt=_top');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
    // Verify the response contains Toronto-specific event data
    expect(response.text).toContain('Toronto');
    // The cfg=j parameter should produce JavaScript output with document.write calls
    expect(response.text).toContain('document.write');
    // Verify it contains Shabbat-related events (candle lighting, havdalah, etc.)
    expect(response.text).toMatch(/Candle lighting|Havdalah/);
  });

  it('should return 200 for /shabbat with geonameid', async () => {
    const response = await request(app.callback())
        .get('/shabbat?geonameid=293397&M=on&lg=h&gy=2025&gm=12&gd=24');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle /shabbat with JSON config', async () => {
    const response = await request(app.callback())
        .get('/shabbat?cfg=json&geonameid=293397&M=on&lg=h&gy=2025&gm=12&gd=24');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return 200 for /shabbat/', async () => {
    const response = await request(app.callback())
        .get('/shabbat/?geonameid=2451778');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /shabbat/browse/', async () => {
    const response = await request(app.callback())
        .get('/shabbat/browse/italy-sicily');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /shabbat/browse/sitemap.xml', async () => {
    const response = await request(app.callback())
        .get('/shabbat/browse/sitemap.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
  });

  it('should return 200 for /shabbat/browse/costa-rica.xml', async () => {
    const response = await request(app.callback())
        .get('/shabbat/browse/costa-rica.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
  });

  it('should return 404 for /shabbat/browse/bogus.xml', async () => {
    const response = await request(app.callback())
        .get('/shabbat/browse/bogus.xml');
    expect(response.status).toBe(404);
  });

  it.skip('should redirect when X-Client-IP header is set with no query params', async () => {
    const response = await request(app.callback())
        .get('/shabbat')
        .set('X-Client-IP', '108.35.203.40')
        .redirects(0);
    expect(response.status).toBe(302);
    // Should redirect to a URL with zip code based on GeoIP lookup
    expect(response.headers.location).toMatch(/\/shabbat\?zip=\d{5}&ue=off&b=18&M=on&lg=s&geoip=zip/);
  });
});

describe('Fridge Routes', () => {
  it('should handle /fridge route', async () => {
    const response = await request(app.callback())
        .get('/fridge?geonameid=293397');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle /shabbat/fridge.cgi route', async () => {
    const response = await request(app.callback())
        .get('/shabbat/fridge.cgi?geonameid=293397');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('ZIP code lookup with mock database', () => {
  let teardown;
  beforeAll(() => {
    teardown = injectZipsMock(app.context.db);
  });
  afterAll(() => teardown());

  it('returns 200 HTML for /shabbat?zip=90210 (Beverly Hills)', async () => {
    const response = await request(app.callback())
        .get('/shabbat?zip=90210');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Beverly Hills');
  });
});
