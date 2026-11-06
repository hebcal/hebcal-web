import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {cacheControl} from '../src/cacheControl.js';
import {makeServer} from './testServer.js';

// A handler that sets freshness headers and then fails, as a route does when
// its template throws mid-render or MySQL times out after Cache-Control is set.
// Appended after the router, so only this otherwise-404 path reaches it.
app.use(async function setCacheThenFail(ctx, next) {
  const m = /^\/__test-5xx\/(\d{3})$/.exec(ctx.request.path);
  if (!m) return next();
  ctx.set('Cache-Control', cacheControl(7));
  ctx.set('Expires', new Date(Date.now() + 86400000).toUTCString());
  ctx.set('Last-Modified', new Date(0).toUTCString());
  ctx.set('ETag', '"abc"');
  ctx.throw(Number(m[1]), 'boom', {expose: true});
});

const server = makeServer(app);

describe('www server: 5xx responses are not cacheable', () => {
  it.each([500, 501, 503])('%i drops Cache-Control/Expires/validators', async (status) => {
    for (const accept of ['text/html', 'application/json']) {
      const res = await request(server).get(`/__test-5xx/${status}`).set('Accept', accept);
      expect(res.status).toBe(status);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['expires']).toBeUndefined();
      expect(res.headers['last-modified']).toBeUndefined();
      expect(res.headers['etag']).toBeUndefined();
    }
  });

  it('leaves 4xx alone', async () => {
    const res = await request(server).get('/__test-5xx/410');
    expect(res.status).toBe(410);
    expect(res.headers['cache-control']).toBe(cacheControl(7));
  });

  it('501 for a route served by hebcal-api-go', async () => {
    const res = await request(server).get('/zmanim?cfg=json');
    expect(res.status).toBe(501);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
