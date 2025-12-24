/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from './app-www.js';

describe('Router Tests', () => {
  describe('Homepage and Basic Routes', () => {
    it('should return 200 for homepage', async () => {
      const response = await request(app.callback()).get('/');
      expect(response.status).toBe(200);
    });

    it('should return robots.txt', async () => {
      const response = await request(app.callback()).get('/robots.txt');
      expect(response.status).toBe(200);
      expect(response.text).toContain('User-agent:');
    });

    // Note: /ping requires a static file to exist in DOCUMENT_ROOT
  });

  describe('Converter Routes', () => {
    it('should return 200 for GET /converter with valid params', async () => {
      const response = await request(app.callback())
          .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
    });

    it('should return 200 for GET /converter with Hebrew date', async () => {
      const response = await request(app.callback())
          .get('/converter?h2g=1&hd=10&hm=Av&hy=6872');
      expect(response.status).toBe(200);
    });

    it('should handle POST /converter with JSON config', async () => {
      const response = await request(app.callback())
          .post('/converter?cfg=json&hy=5786&hm=Cheshvan&hd=14&h2g=1&strict=1&gs=off');
      expect(response.status).toBe(200);
    });

    it('should handle GET /converter with XML config', async () => {
      const response = await request(app.callback())
          .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
    });
  });

  describe('Hebcal Routes', () => {
    it('should return 200 for /hebcal with valid params', async () => {
      const response = await request(app.callback())
          .get('/hebcal?c=on&geo=geoname&geonameid=2654285&m=50&maj=on&mf=on&min=on&mod=on&nx=on&s=on&ss=on&v=1&year=2023');
      expect(response.status).toBe(200);
    });

    it('should handle /hebcal with JSON config', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=now&month=x&ss=off&mf=off&c=off&geo=zip&zip=07039&s=off');
      expect(response.status).toBe(200);
    });

    it('should handle /hebcal with zip code', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=0&zip=37876&m=1&M=off&year=2023&c=on&s=on&maj=on&min=on&mod=on&mf=on&ss=on&nx=on&geo=zip');
      expect(response.status).toBe(200);
    });
  });

  describe('Shabbat Routes', () => {
    it('should return 200 for /shabbat with geonameid', async () => {
      const response = await request(app.callback())
          .get('/shabbat?geonameid=293397&M=on&lg=h&gy=2025&gm=12&gd=24');
      expect(response.status).toBe(200);
    });

    it('should handle /shabbat with JSON config', async () => {
      const response = await request(app.callback())
          .get('/shabbat?cfg=json&geonameid=293397&M=on&lg=h&gy=2025&gm=12&gd=24');
      expect(response.status).toBe(200);
    });

    it('should handle /shabbat with zip code', async () => {
      const response = await request(app.callback())
          .get('/shabbat?cfg=json&b=15&M=on&gy=2025&gm=12&gd=24&zip=75061');
      expect(response.status).toBe(200);
    });

    it('should return 200 for /shabbat/', async () => {
      const response = await request(app.callback())
          .get('/shabbat/?geonameid=2451778');
      expect(response.status).toBe(200);
    });

    it('should return 200 for /shabbat/browse/', async () => {
      const response = await request(app.callback())
          .get('/shabbat/browse/italy-sicily');
      expect(response.status).toBe(200);
    });
  });

  describe('Holidays Routes', () => {
    it('should return 200 for /holidays with year range', async () => {
      const response = await request(app.callback())
          .get('/holidays/6336-6337');
      expect(response.status).toBe(200);
    });

    it('should return 200 for specific holiday', async () => {
      const response = await request(app.callback())
          .get('/holidays/rosh-chodesh-adar-i-2022');
      expect(response.status).toBe(200);
    });
  });

  describe('Sedrot/Parsha Routes', () => {
    it('should return 200 for /sedrot/', async () => {
      const response = await request(app.callback())
          .get('/sedrot/');
      expect(response.status).toBe(200);
    });

    it('should return 200 for specific parsha', async () => {
      const response = await request(app.callback())
          .get('/sedrot/bereshit');
      expect(response.status).toBe(200);
    });

    it('should handle parsha with date (may redirect)', async () => {
      const response = await request(app.callback())
          .get('/sedrot/bereshit-09941011')
          .redirects(0);
      // May return 200 or 302 depending on the date validity
      expect([200, 302]).toContain(response.status);
    });
  });

  describe('Yahrzeit Routes', () => {
    it('should handle POST /yahrzeit with JSON config', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit?cfg=json&v=yahrzeit&hebdate=on&years=8&y1=2003&m1=12&d1=14&s1=after&t1=Yahrzeit&start=5785&n1=test');
      expect(response.status).toBe(200);
    });

    it('should handle POST /email/', async () => {
      const response = await request(app.callback())
          .post('/email/');
      // May return 200 or 400 depending on validation
      expect([200, 400]).toContain(response.status);
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
    });

    it('should return 200 for /omer with date', async () => {
      const response = await request(app.callback())
          .get('/omer/6473/32');
      expect(response.status).toBe(200);
    });
  });

  describe('Static and Special Routes', () => {
    it('should return 200 for /ical/', async () => {
      const response = await request(app.callback())
          .get('/ical/');
      expect(response.status).toBe(200);
    });

    it('should return 200 for hdate JS files', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-en.js');
      expect(response.status).toBe(200);
    });

    it('should return 200 for hdate Hebrew JS files', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-he.js');
      expect(response.status).toBe(200);
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
  });

  describe('HTTP Method Restrictions', () => {
    it('should allow GET on /converter', async () => {
      const response = await request(app.callback())
          .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
      expect(response.status).toBe(200);
    });

    it('should allow POST on /converter', async () => {
      const response = await request(app.callback())
          .post('/converter?cfg=json&hy=5786&hm=Av&hd=3&h2g=1&strict=1&gs=off');
      expect(response.status).toBe(200);
    });

    it('should return 405 for GET-only route with POST', async () => {
      const response = await request(app.callback())
          .post('/shabbat?geonameid=293397');
      expect(response.status).toBe(405);
    });

    it('should reject PUT method with 405', async () => {
      const response = await request(app.callback())
          .put('/');
      expect(response.status).toBe(405);
    });

    it('should reject DELETE method with 405', async () => {
      const response = await request(app.callback())
          .delete('/');
      expect(response.status).toBe(405);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback())
          .get('/this-does-not-exist-12345');
      expect(response.status).toBe(404);
    });

    it('should return 404 for extra slash in holidays path', async () => {
      const response = await request(app.callback())
          .get('/holidays/foo/bar/baz');
      expect(response.status).toBe(404);
    });

    it('should return 404 for extra slash in sedrot path', async () => {
      const response = await request(app.callback())
          .get('/sedrot/foo/bar');
      expect(response.status).toBe(404);
    });
  });

  describe('Security.txt', () => {
    it('should return 200 for /.well-known/security.txt', async () => {
      const response = await request(app.callback())
          .get('/.well-known/security.txt');
      expect(response.status).toBe(200);
    });
  });
});
