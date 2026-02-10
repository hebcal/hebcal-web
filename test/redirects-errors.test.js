import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

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
