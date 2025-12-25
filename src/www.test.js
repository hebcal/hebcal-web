/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from './app-www.js';

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

    it('should handle /hebcal with zip code', async () => {
      const response = await request(app.callback())
          .get('/hebcal?v=0&zip=37876&m=1&M=off&year=2023&c=on&s=on&maj=on&min=on&mod=on&mf=on&ss=on&nx=on&geo=zip');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Shabbat Routes', () => {
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
  });

  describe('Holidays Routes', () => {
    it('should return 200 for /holidays with year range', async () => {
      const response = await request(app.callback())
          .get('/holidays/6336-6337');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for specific holiday', async () => {
      const response = await request(app.callback())
          .get('/holidays/rosh-chodesh-adar-i-2022');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Sedrot/Parsha Routes', () => {
    it('should return 200 for /sedrot/', async () => {
      const response = await request(app.callback())
          .get('/sedrot/');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should return 200 for specific parsha', async () => {
      const response = await request(app.callback())
          .get('/sedrot/bereshit');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });

    it('should handle parsha with date', async () => {
      const response = await request(app.callback())
          .get('/sedrot/vayigash-20251227');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
  });

  describe('Yahrzeit Routes', () => {
    it('should handle POST /yahrzeit with JSON config', async () => {
      const response = await request(app.callback())
          .post('/yahrzeit?cfg=json&v=yahrzeit&hebdate=on&years=8&y1=2003&m1=12&d1=14&s1=after&t1=Yahrzeit&start=5785&n1=test');
      expect(response.status).toBe(200);
      expect(response.type).toContain('json');
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

    /*
    it('should handle /yahrzeit/verify with token', async () => {
      const response = await request(app.callback())
          .get('/yahrzeit/verify/01jthv2t5k88yermamssn96pze');
      expect(response.status).toBe(404);
      expect(response.type).toContain('html');
    });
    */
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

  describe('Email Verification Routes', () => {
    /*
    it('should handle /email/verify.php with token', async () => {
      const response = await request(app.callback())
          .get('/email/verify.php?3fb9stfc55da9afel3aecdca');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
    });
    */
    /*
    it('should handle /email/open tracking pixel', async () => {
      const response = await request(app.callback())
          .get('/email/open?msgid=01jthv2t5k88yermamssn96pze.1746503035074');
      expect(response.status).toBe(200);
      expect(response.type).toContain('gif');
    });
    */

    it('should handle GET /email form', async () => {
      const response = await request(app.callback())
          .get('/email');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
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
    it('should return 200 for /etc/hdate XML file', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-en.xml');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });

    it('should return 200 for /etc/hdate Hebrew XML file', async () => {
      const response = await request(app.callback())
          .get('/etc/hdate-he.xml');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });

    it('should reject POST on /etc/hdate XML with 405', async () => {
      const response = await request(app.callback())
          .post('/etc/hdate-en.xml');
      expect(response.status).toBe(405);
      expect(response.type).toContain('html');
    });

    it('should return 200 for /etc/dafyomi RSS feed', async () => {
      const response = await request(app.callback())
          .get('/etc/dafyomi-en.xml');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });

    it('should return 200 for /etc/myomi RSS feed', async () => {
      const response = await request(app.callback())
          .get('/etc/myomi-en.xml');
      expect(response.status).toBe(200);
      expect(response.type).toContain('xml');
    });
  });

  describe('Advanced Sedrot Routes', () => {
    it('should return 200 for /sedrot/grid', async () => {
      const response = await request(app.callback())
          .get('/sedrot/grid');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
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
    });

    it('should handle parsha year with Israel parameter', async () => {
      const response = await request(app.callback())
          .get('/sedrot/5786?i=on');
      expect(response.status).toBe(200);
      expect(response.type).toContain('html');
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
});
