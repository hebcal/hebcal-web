import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('301 Redirects', () => {
  it.each([
    ['/privacy', 'https://www.hebcal.com/home/about/privacy-policy'],
    ['/help', 'https://www.hebcal.com/home/help'],
    ['/converter/converter.cgi', 'https://www.hebcal.com/converter'],
  ])('should redirect %s with 301', async (path, location) => {
    const response = await request(server)
        .get(path)
        .redirects(0);
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe(location);
  });

  it.each([
    '/shabbat/browse',
    '/holidays',
    '/sedrot',
  ])('should add trailing slash to %s with 301', async (path) => {
    const response = await request(server)
        .get(path)
        .redirects(0);
    expect(response.status).toBe(301);
    expect(response.headers.location).toMatch(new RegExp(`${path}/$`));
  });
});

describe('410 Gone Responses', () => {
  it.each([
    ['/dist/', 'retired Perl distribution index'],
    ['/dist/hebcal.pl', 'retired Perl script'],
    ['/dist/calc_triennial.pl', 'retired Perl script'],
    ['/holidays/yom-haatzmaut-4493', 'holiday after year 2999'],
    ['/sedrot/tazria-metzora-82230517', 'parsha after year 2999'],
    ['/holidays/chanukah-10069', 'holiday after year 2999'],
  ])('should return 410 for %s (%s)', async (path) => {
    const response = await request(server).get(path);
    expect(response.status).toBe(410);
  });
});

describe('HTTP Method Restrictions', () => {
  it('should allow GET on /converter', async () => {
    const response = await request(server)
        .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should allow POST on /converter', async () => {
    const response = await request(server)
        .post('/converter?cfg=json&hy=5786&hm=Av&hd=3&h2g=1&strict=1&gs=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return 405 for GET-only route with POST', async () => {
    const response = await request(server)
        .post('/shabbat?geonameid=293397');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });

  it('should reject PUT method with 405', async () => {
    const response = await request(server)
        .put('/');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
    expect(response.headers['allow']).toBe('GET, POST, HEAD, OPTIONS');
  });

  it('should reject DELETE method with 405', async () => {
    const response = await request(server)
        .delete('/');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
    expect(response.headers['allow']).toBe('GET, POST, HEAD, OPTIONS');
  });
});

describe('Error Handling', () => {
  it.each([
    ['non-existent route', '/this-does-not-exist-12345'],
    ['extra slash in holidays path', '/holidays/foo/bar/baz'],
    ['extra slash in sedrot path', '/sedrot/foo/bar'],
  ])('should return 404 for %s', async (why, path) => {
    const response = await request(server).get(path);
    expect(response.status).toBe(404);
    expect(response.type).toContain('html');
  });
});

describe('Short URL Redirects', () => {
  it('should handle /h/ short URL prefix', async () => {
    const response = await request(server)
        .get('/h/foo')
        .redirects(0);
    expect(response.status).toBe(302);
    expect(response.type).toContain('html');
  });

  it('should handle /s/ short URL prefix', async () => {
    const response = await request(server)
        .get('/s/5785/17')
        .redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://www.hebcal.com/sedrot/yitro-20250215?utm_source=redir&utm_medium=redir');
  });

  it('should handle /o/ short URL prefix', async () => {
    const response = await request(server)
        .get('/o/5783/4')
        .redirects(0);
    expect(response.status).toBe(302);
  });
});
