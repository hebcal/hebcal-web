/* eslint-disable max-len */
import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from './app-www.js';

// Mock MysqlDb class for testing email verification routes
class MockMysqlDb {
  constructor() {
    this.mockData = {
      subscriptions: {
        '01jthv2t5k88yermamssn96pze': {
          email_id: '01jthv2t5k88yermamssn96pze',
          email_address: 'test@example.com',
          email_status: 'active',
          email_created: new Date('2025-01-01'),
          email_candles_zipcode: '10001',
          email_candles_city: null,
          email_candles_geonameid: null,
          email_candles_havdalah: 50,
          email_havdalah_tzeit: 0,
          email_sundown_candles: 18,
          email_use_elevation: 0,
        },
        '3fb9stfc55da9afel3aecdca': {
          email_id: '3fb9stfc55da9afel3aecdca',
          email_address: 'verify@example.com',
          email_status: 'pending',
          email_created: new Date('2025-01-01'),
          email_candles_zipcode: '90210',
          email_candles_city: null,
          email_candles_geonameid: null,
          email_candles_havdalah: 50,
          email_havdalah_tzeit: 0,
          email_sundown_candles: 18,
          email_use_elevation: 0,
        },
      },
      emailsByAddress: {
        'nobody@example.com': '01jthv2t5k88yermamssn96pze',
      },
    };
  }

  async query(sql, params) {
    // Handle SELECT queries for email verification
    if (sql.includes('SELECT') && sql.includes('hebcal_shabbat_email')) {
      if (sql.includes('WHERE email_id = ?')) {
        const subscriptionId = params;
        const row = this.mockData.subscriptions[subscriptionId];
        return row ? [row] : [];
      } else if (sql.includes('WHERE email_address = ?')) {
        const emailAddress = params;
        const subscriptionId = this.mockData.emailsByAddress[emailAddress];
        const row = subscriptionId ? this.mockData.subscriptions[subscriptionId] : null;
        return row ? [row] : [];
      }
    }

    // Handle SELECT queries for yahrzeit verification
    if (sql.includes('SELECT') && sql.includes('yahrzeit_email')) {
      // Return empty result to trigger 404 in the test
      return [];
    }

    // Handle UPDATE queries
    if (sql.includes('UPDATE hebcal_shabbat_email') || sql.includes('UPDATE yahrzeit_email')) {
      return {affectedRows: 1};
    }

    // Handle INSERT queries for email open tracking
    if (sql.includes('INSERT INTO email_open')) {
      return {insertId: 1};
    }

    // Default: return empty array
    return [];
  }

  async execute(...params) {
    return this.query(...params);
  }

  async query2(ctx, options) {
    return await this.query(options.sql, options.values);
  }

  async execute2(ctx, options) {
    return this.query2(ctx, options);
  }

  async close() {
    return true;
  }
}

// Install the mock before all tests
beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('Router Tests', () => {
  describe('Homepage and Basic Routes', () => {
    it('should return 200 for homepage', async () => {
      const response = await request(app.callback()).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return robots.txt', async () => {
      const response = await request(app.callback()).get('/robots.txt');
      expect(response.status).toBe(200);
      expect(response.type).toContain('text');
      expect(response.text).toContain('User-agent:');
    });

    // Note: /ping requires a static file to exist in DOCUMENT_ROOT
  });

  describe('Converter Routes', () => {
    it('should return 200 for GET /converter with valid params', async () => {
      const response = await request(app.callback())
          .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should return 400 for GET /converter with invalid params', async () => {
      const response = await request(app.callback())
          .get('/converter?cfg=json&hy=5785&hm=&hd=24&h2g=1&strict=1');
      expect(response.status).toBe(400);
      expect(response.type).toContain('json');
    });

    it('should return 200 for GET /converter with Hebrew date', async () => {
      const response = await request(app.callback())
          .get('/converter?h2g=1&hd=10&hm=Av&hy=6872');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle POST /converter with JSON config', async () => {
      const response = await request(app.callback())
          .post('/converter?cfg=json&hy=5786&hm=Cheshvan&hd=14&h2g=1&strict=1&gs=off');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should handle GET /converter with XML config', async () => {
      const response = await request(app.callback())
          .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });
  });

  describe('Hebcal Routes', () => {
    it('should return 200 for /hebcal with valid params', async () => {
      const response = await request(app.callback())
          .get('/hebcal?c=on&geo=geoname&geonameid=2654285&m=50&maj=on&mf=on&min=on&mod=on&nx=on&s=on&ss=on&v=1&year=2023');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle /hebcal with JSON config', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=now&month=x&ss=off&mf=off&c=off&geo=zip&zip=07039&s=off');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should return comprehensive calendar with all features enabled', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=2023&month=x&ss=on&mf=on&c=on&geo=geoname&geonameid=3448439&M=on&s=on');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');

      // Validate response structure
      const body = response.body;
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('date');
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);

      // Validate location information
      expect(body).toHaveProperty('location');
      expect(body.location).toHaveProperty('geo');
      expect(body.location).toHaveProperty('geonameid');
      expect(body.location.geonameid).toBe(3448439);

      // Should contain major holidays
      const holidays = body.items.filter((item) => item.category === 'holiday');
      expect(holidays.length).toBeGreaterThan(0);

      // Should contain candle lighting times (ss=on, c=on)
      const candleLighting = body.items.filter((item) => item.category === 'candles');
      expect(candleLighting.length).toBeGreaterThan(0);

      // Should contain havdalah times (M=on)
      const havdalah = body.items.filter((item) => item.category === 'havdalah');
      expect(havdalah.length).toBeGreaterThan(0);

      // Should contain Torah readings (s=on)
      const parsha = body.items.filter((item) => item.category === 'parashat');
      expect(parsha.length).toBeGreaterThan(0);

      // Should contain Rosh Chodesh (nx=on)
      const roshChodesh = body.items.filter((item) => item.title?.includes('Rosh Chodesh'));
      expect(roshChodesh.length).toBeGreaterThan(0);

      // Validate timed events have proper date format
      const timedEvents = body.items.filter((item) => item.date?.includes('T'));
      expect(timedEvents.length).toBeGreaterThan(0);
      timedEvents.forEach((item) => {
        expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    it('should handle /hebcal with zip code', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=0&zip=37876&m=1&M=off&year=2023&c=on&s=on&maj=on&min=on&mod=on&mf=on&ss=on&nx=on&geo=zip');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return FullCalendar format with cfg=fc', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=1&cfg=fc&start=2026-03-01&end=2026-04-12&i=off&maj=on&min=on&nx=on&mf=on&ss=on&mod=on&lg=s');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');

      // Validate response is an array (FullCalendar format)
      const body = response.body;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // Validate FullCalendar event structure
      const firstEvent = body[0];
      expect(firstEvent).toHaveProperty('title');
      expect(firstEvent).toHaveProperty('start');
      expect(typeof firstEvent.title).toBe('string');
      expect(typeof firstEvent.start).toBe('string');

      // FullCalendar events should have ISO 8601 date format
      expect(firstEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}/);

      // Some events may have additional FullCalendar properties
      const timedEvent = body.find((event) => event.start?.includes('T'));
      if (timedEvent) {
        // Timed events should have full ISO timestamp
        expect(timedEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }

      // All-day events should not have time component or have allDay property
      const allDayEvent = body.find((event) => event.start && !event.start.includes('T'));
      if (allDayEvent) {
        // All-day events should have date-only format
        expect(allDayEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

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

    it('should handle /shabbat with zip code', async () => {
      const response = await request(app.callback())
          .get('/shabbat?cfg=json&b=15&M=on&gy=2025&gm=12&gd=24&zip=75061');
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

    it('should redirect when X-Client-IP header is set with no query params', async () => {
      const response = await request(app.callback())
          .get('/shabbat')
          .set('X-Client-IP', '108.35.203.40')
          .redirects(0);
      expect(response.status).toBe(302);
      // Should redirect to a URL with zip code based on GeoIP lookup
      expect(response.headers.location).toMatch(/\/shabbat\?zip=\d{5}&ue=off&b=18&M=on&lg=s&geoip=zip/);
    });
  });

  describe('Holidays Routes', () => {
    it('should return 200 for /holidays with year range', async () => {
      const response = await request(app.callback())
          .get('/holidays/1993-1994');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for /holidays with single year', async () => {
      const response = await request(app.callback())
          .get('/holidays/2007');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for specific holiday + year', async () => {
      const response = await request(app.callback())
          .get('/holidays/rosh-chodesh-adar-i-2022');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for specific holiday without year', async () => {
      const response = await request(app.callback())
          .get('/holidays/yom-kippur');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for holidays PDF', async () => {
      const response = await request(app.callback())
          .get('/holidays/hebcal-2026.pdf');
      expect(response.status).toBe(200);
      expect(response.type).toBe('application/pdf');
    });

    it('should handle holiday year search', async () => {
      const response = await request(app.callback())
          .get('/holidays/pesach?gy=1980');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/holidays/pesach-1980');
    });
  });

  describe('Sedrot/Parsha Routes', () => {
    it('should return 200 for /sedrot/', async () => {
      const response = await request(app.callback())
          .get('/sedrot/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Weekly Torah Portion - Parashat haShavua - Hebcal<\/title>/);
    });

    it('should return 200 for specific parsha', async () => {
      const response = await request(app.callback())
          .get('/sedrot/bereshit');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Bereshit - Torah Portion - Hebcal<\/title>/);
    });

    it('should handle parsha with date', async () => {
      const response = await request(app.callback())
          .get('/sedrot/vayigash-20251227');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Vayigash 578\d - Torah Portion - Hebcal<\/title>/);
    });

    it('should handle parsha year search', async () => {
      const response = await request(app.callback())
          .get('/sedrot/vayechi?gy=1980');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/sedrot/vayechi-19800105');
    });
  });

  describe('Yahrzeit Routes', () => {
    it('should handle POST /yahrzeit with JSON config', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit?cfg=json&v=yahrzeit&hebdate=on&years=8&y1=2003&m1=12&d1=14&s1=after&t1=Yahrzeit&start=5785&n1=test');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should handle POST /yahrzeit with form data and multiple anniversaries', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('cfg=json&v=yahrzeit&n1=Person1&t1=Birthday&d1=15&m1=4&y1=1983&s1=on&n2=Person2&t2=Yahrzeit&d2=13&m2=11&y2=2008&s2=off&hebdate=on&years=3');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');

      // Validate response structure
      const body = response.body;
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      expect(body).toHaveProperty('title');

      // Should have events for both Person1 and Person2
      expect(body.items.length).toBeGreaterThan(0);

      // Check that we have birthday events
      const birthdays = body.items.filter((item) => item.category === 'birthday');
      expect(birthdays.length).toBeGreaterThan(0);

      // Check that we have yahrzeit events
      const yahrzeits = body.items.filter((item) => item.category === 'yahrzeit');
      expect(yahrzeits.length).toBeGreaterThan(0);
    });

    it('should handle POST /email/', async () => {
      const response = await request(app.callback())
          .post('/email/');
      // May return 200 or 400 depending on validation
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle POST /yahrzeit/search', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit/search');
      // May return various codes depending on input
      expect(response.status).toBeDefined();
    });
  });

  describe('Zmanim and Omer Routes', () => {
    it('should return 200 for /zmanim', async () => {
      const response = await request(app.callback())
          .get('/zmanim?cfg=json&geonameid=293397&date=2025-12-24');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should return Assur Melacha status with im=1 parameter', async () => {
      const response = await request(app.callback())
          .get('/zmanim?cfg=json&im=1&geonameid=3448439&dt=2025-06-21T20:08:10Z');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');

      // Validate response structure for Assur Melacha API
      const body = response.body;
      expect(body).toHaveProperty('date');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('location');
      expect(body).toHaveProperty('status');

      // Validate location object
      expect(body.location).toHaveProperty('geonameid');
      expect(body.location.geonameid).toBe(3448439);

      // Validate status object
      expect(body.status).toHaveProperty('localTime');
      expect(body.status).toHaveProperty('isAssurBemlacha');
      expect(typeof body.status.isAssurBemlacha).toBe('boolean');
      expect(typeof body.status.localTime).toBe('string');
    });

    it('should return 200 for /omer with date', async () => {
      const response = await request(app.callback())
          .get('/omer/6473/32');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Static and Special Routes', () => {
    it('should return 200 for /ical/', async () => {
      const response = await request(app.callback())
          .get('/ical/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for hdate JS files', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-en.js');
      expect(response.status).toBe(200);
      expect(response.type).toContain('javascript');
    });

    it('should return 200 for hdate Hebrew JS files', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-he.js');
      expect(response.status).toBe(200);
      expect(response.type).toContain('javascript');
    });
  });

  describe('Static File Serving', () => {
    it('should serve SVG sprite file with correct content type', async () => {
      const response = await request(app.callback())
          .get('/i/sprite13.svg');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/svg/);
      // Verify long-lived cache headers
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
      const maxAge = Number.parseInt(response.headers['cache-control'].match(/max-age=(\d+)/)?.[1] || '0');
      expect(maxAge).toBeGreaterThanOrEqual(31536000); // At least 1 year (31536000 seconds)
    });

    it('should serve favicon with correct content type', async () => {
      const response = await request(app.callback())
          .get('/favicon.ico');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/icon|octet-stream/);
    });

    it('should serve WOFF2 font file with correct content type', async () => {
      const response = await request(app.callback())
          .get('/i/adobehebrew-regular.woff2');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/woff2|font|octet-stream/);
    });

    it('should serve minified JavaScript file with correct content type', async () => {
      const response = await request(app.callback())
          .get('/i/hebcal-app-5.2.1.min.js');
      expect(response.status).toBe(200);
      expect(response.type).toContain('javascript');
      // Verify immutable cache header
      expect(response.headers['cache-control']).toBeDefined();
      expect(response.headers['cache-control']).toMatch(/immutable/);
    });
  });

  describe('301 Redirects', () => {
    it('should redirect /privacy to external URL with 301', async () => {
      const response = await request(app.callback())
          .get('/privacy')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe('https://www.hebcal.com/home/about/privacy-policy');
    });

    it('should redirect /help to external URL with 301', async () => {
      const response = await request(app.callback())
          .get('/help')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe('https://www.hebcal.com/home/help');
    });

    it('should redirect /converter/converter.cgi with 301', async () => {
      const response = await request(app.callback())
          .get('/converter/converter.cgi')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe('https://www.hebcal.com/converter');
    });

    it('should add trailing slash to /shabbat/browse with 301', async () => {
      const response = await request(app.callback())
          .get('/shabbat/browse')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toMatch(/\/shabbat\/browse\/$/);
    });

    it('should add trailing slash to /holidays with 301', async () => {
      const response = await request(app.callback())
          .get('/holidays')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toMatch(/\/holidays\/$/);
    });

    it('should add trailing slash to /sedrot with 301', async () => {
      const response = await request(app.callback())
          .get('/sedrot')
          .redirects(0);
      expect(response.status).toBe(301);
      expect(response.headers.location).toMatch(/\/sedrot\/$/);
    });
  });

  describe('410 Gone Responses', () => {
    it('should return 410 for /dist/', async () => {
      const response = await request(app.callback())
          .get('/dist/');
      expect(response.status).toBe(410);
    });

    it('should return 410 for /dist/hebcal.pl', async () => {
      const response = await request(app.callback())
          .get('/dist/hebcal.pl');
      expect(response.status).toBe(410);
    });

    it('should return 410 for /dist/calc_triennial.pl', async () => {
      const response = await request(app.callback())
          .get('/dist/calc_triennial.pl');
      expect(response.status).toBe(410);
    });

    it('should return 410 for /holidays after year 2999 (Yom HaAtzmaut)', async () => {
      const response = await request(app.callback())
          .get('/holidays/yom-haatzmaut-4493');
      expect(response.status).toBe(410);
    });

    it('should return 410 for /sedrot after year 2999', async () => {
      const response = await request(app.callback())
          .get('/sedrot/tazria-metzora-82230517');
      expect(response.status).toBe(410);
    });

    it('should return 410 for /holidays after year 2999 (Chanukah)', async () => {
      const response = await request(app.callback())
          .get('/holidays/chanukah-10069');
      expect(response.status).toBe(410);
    });
  });

  describe('HTTP Method Restrictions', () => {
    it('should allow GET on /converter', async () => {
      const response = await request(app.callback())
          .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should allow POST on /converter', async () => {
      const response = await request(app.callback())
          .post('/converter?cfg=json&hy=5786&hm=Av&hd=3&h2g=1&strict=1&gs=off');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should return 405 for GET-only route with POST', async () => {
      const response = await request(app.callback())
          .post('/shabbat?geonameid=293397');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });

    it('should reject PUT method with 405', async () => {
      const response = await request(app.callback())
          .put('/');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });

    it('should reject DELETE method with 405', async () => {
      const response = await request(app.callback())
          .delete('/');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback())
          .get('/this-does-not-exist-12345');
      expect(response.status).toBe(404);
      expect(response.type).toContain('html');
    });

    it('should return 404 for extra slash in holidays path', async () => {
      const response = await request(app.callback())
          .get('/holidays/foo/bar/baz');
      expect(response.status).toBe(404);
      expect(response.type).toContain('html');
    });

    it('should return 404 for extra slash in sedrot path', async () => {
      const response = await request(app.callback())
          .get('/sedrot/foo/bar');
      expect(response.status).toBe(404);
      expect(response.type).toContain('html');
    });
  });

  describe('Security.txt', () => {
    it('should return 200 for /.well-known/security.txt', async () => {
      const response = await request(app.callback())
          .get('/.well-known/security.txt');
      expect(response.status).toBe(200);
      expect(response.type).toContain('text');
    });
  });

  describe('Autocomplete Routes', () => {
    it('should return 200 for /complete with query', async () => {
      const response = await request(app.callback())
          .get('/complete?q=san+francisco');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should handle /complete with empty query', async () => {
      const response = await request(app.callback())
          .get('/complete?q=');
      expect(response.status).toBe(404);
      expect(response.type).toContain('json');
    });

    it('should handle /complete with international characters', async () => {
      const response = await request(app.callback())
          .get('/complete?q=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });
  });

  describe('Daily Learning Routes', () => {
    it('should return redirect /learning', async () => {
      const response = await request(app.callback())
          .get('/learning')
          .redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/learning/2');
    });

    it('should return 200 for /learning with date', async () => {
      const response = await request(app.callback())
          .get('/learning/2025-12-24');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Geo Location Routes', () => {
    it('should return 200 for /geo with valid geonameid', async () => {
      const response = await request(app.callback())
          .get('/geo?geonameid=293397');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should handle /geo with zip code', async () => {
      const response = await request(app.callback())
          .get('/geo?zip=10001');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
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

  describe('Converter CSV Route', () => {
    it('should handle /converter/csv with params', async () => {
      const response = await request(app.callback())
          .get('/converter/csv?hd=4&hm=Tevet&hy=5786&h2g=1');
      expect(response.status).toBe(200);
      expect(response.type).toContain('csv');
    });

    it('should reject POST /converter/csv with 405', async () => {
      const response = await request(app.callback())
          .post('/converter/csv');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });
  });

  describe('Leyning Routes', () => {
    it('should handle /leyning with cfg=json', async () => {
      const response = await request(app.callback())
          .get('/leyning?cfg=json&date=2025-12-27');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
    });

    it('should reject POST method on /leyning with 405', async () => {
      const response = await request(app.callback())
          .post('/leyning');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });
  });

  describe('Delete Cookie Route', () => {
    it('should return 200 for /hebcal/del_cookie', async () => {
      const response = await request(app.callback())
          .get('/hebcal/del_cookie');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should reject POST method on /hebcal/del_cookie with 405', async () => {
      const response = await request(app.callback())
          .post('/hebcal/del_cookie');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });
  });

  describe('Yahrzeit Email Routes', () => {
    it('should reject GET /yahrzeit/email', async () => {
      const response = await request(app.callback())
          .get('/yahrzeit/email');
      expect(response.status).toBe(400);
    });

    it('should handle POST /yahrzeit/email', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit/email');
      expect(response.status).toBe(400);
    });

    it('should handle /yahrzeit/verify with token', async () => {
      const response = await request(app.callback())
          .get('/yahrzeit/verify/01jthv2t5k88yermamssn96pze');
      expect(response.status).toBe(404);
      expect(response.type).toContain('html');
    });
  });

  describe('Short URL Redirects', () => {
    it('should handle /h/ short URL prefix', async () => {
      const response = await request(app.callback())
          .get('/h/foo')
          .redirects(0);
      expect(response.status).toBe(302);
      expect(response.type).toContain('html');
    });

    it('should handle /s/ short URL prefix', async () => {
      const response = await request(app.callback())
          .get('/s/5785/17')
          .redirects(0);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://www.hebcal.com/sedrot/yitro-20250215?utm_source=redir&utm_medium=redir');
    });

    it('should handle /o/ short URL prefix', async () => {
      const response = await request(app.callback())
          .get('/o/5783/4')
          .redirects(0);
      expect(response.status).toBe(302);
    });
  });

  // These tests use a mocked MySQL database connection.
  describe('Email Verification Routes', () => {
    it('should handle /email/verify.php with token', async () => {
      const response = await request(app.callback())
          .get('/email/verify.php?3fb9stfc55da9afel3aecdca');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle /email/open tracking pixel', async () => {
      const response = await request(app.callback())
          .get('/email/open?msgid=01jthv2t5k88yermamssn96pze.1746503035074&loc=Boston');
      expect(response.status).toBe(200);
      expect(response.type).toContain('gif');
    });

    it('GET /email base64 decodes arg', async () => {
      const response = await request(app.callback())
          .get('/email?e=bm9ib2R5QGV4YW1wbGUuY29t');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toContain('nobody@example.com');
    });
  });

  describe('Link Routes', () => {
    it('should handle /link route', async () => {
      const response = await request(app.callback())
          .get('/link?geonameid=293397');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle POST /link route', async () => {
      const response = await request(app.callback())
          .post('/link?geonameid=293397');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('RSS and XML Routes', () => {
    describe('Hebrew Date RSS Feeds', () => {
      it('should return Today\'s Hebrew Date in English', async () => {
        const response = await request(app.callback())
            .get('/etc/hdate-en.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
      });

      it('should return Today\'s Hebrew Date in Hebrew', async () => {
        const response = await request(app.callback())
            .get('/etc/hdate-he.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
      });

      it('should return Today\'s Hebrew Date in German', async () => {
        const response = await request(app.callback())
            .get('/etc/hdate-de.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
      });

      it('should reject POST on /etc/hdate XML with 405', async () => {
        const response = await request(app.callback())
            .post('/etc/hdate-en.xml');
        expect(response.status).toBe(405);
        expect(response.type).toContain('html');
      });
    });

    describe('Parashat ha-Shavua RSS Feeds', () => {
      it('should return Torah reading RSS in English', async () => {
        const response = await request(app.callback())
            .get('/sedrot/index-en.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
        expect(response.text).toContain('<item>');
      });

      it('should return Torah reading RSS for Israel in English', async () => {
        const response = await request(app.callback())
            .get('/sedrot/israel-en.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
        expect(response.text).toContain('<item>');
      });

      it('should return Torah reading RSS in French', async () => {
        const response = await request(app.callback())
            .get('/sedrot/index-fr.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
        expect(response.text).toContain('<item>');
      });
    });

    describe('Daily Learning RSS Feeds', () => {
      it('should return 200 for /etc/dafyomi RSS feed', async () => {
        const response = await request(app.callback())
            .get('/etc/dafyomi-en.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
      });

      it('should return 200 for /etc/myomi RSS feed', async () => {
        const response = await request(app.callback())
            .get('/etc/myomi-en.xml');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
      });
    });

    describe('Shabbat Times RSS Feeds', () => {
      it('should return Shabbat times RSS with zip code', async () => {
        const response = await request(app.callback())
            .get('/shabbat?geo=zip&zip=90210&m=50&cfg=r');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
        expect(response.text).toContain('<item>');
        // Should contain candle lighting information
        expect(response.text).toMatch(/Candle lighting|Havdalah/i);
      });

      it('should return Shabbat times RSS with geonameid', async () => {
        const response = await request(app.callback())
            .get('/shabbat?cfg=r&geonameid=293397&M=on');
        expect(response.status).toBe(200);
        expect(response.type).toContain('xml');
        expect(response.text).toContain('<?xml');
        expect(response.text).toContain('<rss');
        expect(response.text).toContain('<channel>');
        expect(response.text).toContain('<item>');
      });
    });
  });

  describe('Advanced Sedrot Routes', () => {
    it('should return 200 for /sedrot/grid', async () => {
      const response = await request(app.callback())
          .get('/sedrot/grid');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Weekly Torah Readings - Parashat haShavua - Hebcal<\/title>/);
    });

    it('should return 200 for parsha RSS feed', async () => {
      const response = await request(app.callback())
          .get('/sedrot/index.xml');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });

    it('should handle parsha CSV file', async () => {
      const response = await request(app.callback())
          .get('/sedrot/fullkriyah-5789.csv');
      expect(response.status).toBe(200);
      expect(response.type).toContain('csv');
    });

    it('should return 200 for parsha year page', async () => {
      const response = await request(app.callback())
          .get('/sedrot/5786');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
    });

    it('should handle parsha year with Israel parameter', async () => {
      const response = await request(app.callback())
          .get('/sedrot/5786?i=on');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
      expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
    });
  });

  describe('Sitemap Routes', () => {
    it('should return 200 for /sitemap_zips.txt', async () => {
      const response = await request(app.callback())
          .get('/sitemap_zips.txt');
      expect(response.status).toBe(200);
      expect(response.type).toContain('text');
    });

    it('should reject POST on /sitemap_zips.txt with 405', async () => {
      const response = await request(app.callback())
          .post('/sitemap_zips.txt');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });
  });

  describe('Analytics Routes', () => {
    it('should return 200 for /ma/ma.js', async () => {
      const response = await request(app.callback())
          .get('/ma/ma.js');
      expect(response.status).toBe(200);
      expect(response.type).toContain('javascript');
    });

    it('should return 200 for /matomo/matomo.js', async () => {
      const response = await request(app.callback())
          .get('/matomo/matomo.js');
      expect(response.status).toBe(200);
      expect(response.type).toContain('javascript');
    });

    it('should return 204 for /ma/ma.php with send_image=0', async () => {
      const response = await request(app.callback())
          .get('/ma/ma.php?send_image=0');
      expect(response.status).toBe(204);
    });

    it('should return 204 for /matomo/matomo.php with send_image=0', async () => {
      const response = await request(app.callback())
          .get('/matomo/matomo.php?send_image=0');
      expect(response.status).toBe(204);
    });
  });

  describe('Hidden Directory Routes', () => {
    it('should return 200 for /i hidden directory', async () => {
      const response = await request(app.callback())
          .get('/i');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for /i/ with trailing slash', async () => {
      const response = await request(app.callback())
          .get('/i/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for /etc hidden directory', async () => {
      const response = await request(app.callback())
          .get('/etc');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for /etc/ with trailing slash', async () => {
      const response = await request(app.callback())
          .get('/etc/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Yahrzeit big test', () => {
    it('should handle large POST /yahrzeit with JSON config', async () => {
      const start = new Date(1980, 0, 1);
      const q = {
        cfg: 'json',
        v: 'yahrzeit',
        hebdate: 'on',
        start: '5784',
        years: '2',
        seq: '1',
        em: '',
        tzo: '480',
      };
      for (let i = 1; i <= 500; i++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + i - 1);
        q[`n${i}`] = `FirstName${i} LastName${i}`;
        q[`t${i}`] = i % 2 === 0 ? 'Birthday' : 'Yahrzeit';
        q[`d${i}`] = dt.getDate();
        q[`m${i}`] = dt.getMonth() + 1;
        q[`y${i}`] = dt.getFullYear();
        q[`s${i}`] = 'off';
      }
      const response = await request(app.callback())
          .post('/yahrzeit')
          .type('form') // Sets Content-Type: application/x-www-form-urlencoded
          .send(q); // Object data
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');

      // Validate response structure
      const body = response.body;
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('date');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('range');
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBe(1000);
      expect(body.items).toContainEqual({
        'title': 'FirstName500 LastName500’s 44th Hebrew Birthday (10th of Iyyar)',
        'date': '2025-05-08',
        'hdate': '10 Iyyar 5785',
        'memo': 'Hebcal joins you in honoring FirstName500 LastName500, whose 44th Hebrew Birthday occurs on Thursday, May 8, corresponding to the 10th of Iyyar, 5785.\n\nFirstName500 LastName500’s Hebrew Birthday begins at sundown on Wednesday, May 7 and continues until sundown on the day of observance.\n\nMazel Tov!',
        'name': 'FirstName500 LastName500',
        'category': 'birthday',
        'anniversary': 44,
      });
    });
  });
});
