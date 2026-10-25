import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {acceptsPost} from '../src/postRoutes.js';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

describe('acceptsPost', () => {
  it.each([
    '/converter', '/link', '/email', '/email/', '/email/verify', '/logout',
    '/login/apple/callback', '/yahrzeit', '/yahrzeit/email',
    '/yahrzeit/search', '/yahrzeit/verify/abc', '/yahrzeit/edit/abc',
    '/ma/matomo.php',
  ])('accepts POST to %s', (p) => expect(acceptsPost(p)).toBe(true));

  it.each([
    '/', '/api', '/shabbat', '/hebcal', '/holidays/pesach', '/sedrot/',
    '/converter/csv', '/yahrzeit/email-status', '/email/open',
    '/login', '/login/google', '/account', '/complete', '/llms.txt',
  ])('rejects POST to %s', (p) => expect(acceptsPost(p)).toBe(false));
});

describe('POST gate before bodyParser', () => {
  const server = makeServer(app);

  it('returns 405 for POST / even with a corrupt brotli body', async () => {
    const response = await request(server)
        .post('/')
        .set('Content-Encoding', 'br')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(Buffer.from('not brotli at all'));
    expect(response.status).toBe(405);
    expect(response.headers['allow']).toBe('GET, HEAD');
  });

  it('returns 405 for OPTIONS on a GET-only path', async () => {
    const response = await request(server).options('/shabbat');
    expect(response.status).toBe(405);
    expect(response.headers['allow']).toBe('GET, HEAD');
  });

  it('still answers a cfg= preflight with 204', async () => {
    const response = await request(server).options('/shabbat?cfg=json');
    expect(response.status).toBe(204);
  });
});
