import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {policyForPath} from '../src/rateLimit.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('RateLimit headers', () => {
  it('advertises the policy on cfg=json responses', async () => {
    const r = await request(server).get('/converter?cfg=json&date=2026-10-15&g2h=1');
    expect(r.headers['ratelimit-policy']).toBe('"default";q=60;w=3');
    expect(r.headers['ratelimit']).toBe('"default";r=60;t=3');
    expect(r.headers['access-control-expose-headers']).toMatch(/RateLimit-Policy/);
  });

  it('is present on /leyning and the OpenAPI document', async () => {
    const a = await request(server).get('/leyning?cfg=json&date=2026-10-17');
    expect(a.headers['ratelimit-policy']).toBeDefined();
    const b = await request(server).get('/api-docs/openapi.json');
    expect(b.headers['ratelimit-policy']).toBeDefined();
  });

  it('is also present on API error responses', async () => {
    const r = await request(server).get('/converter?cfg=json&date=bogus&g2h=1');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.headers['ratelimit-policy']).toBeDefined();
  });

  it('is absent from ordinary HTML pages', async () => {
    const r = await request(server).get('/');
    expect(r.headers['ratelimit-policy']).toBeUndefined();
    expect(r.headers['ratelimit']).toBeUndefined();
  });

  it('uses the Varnish throttle for each route family', async () => {
    expect(policyForPath('/converter')).toEqual({quota: 60, window: 3});
    expect(policyForPath('/leyning')).toEqual({quota: 150, window: 10});
    const r = await request(server).get('/leyning?cfg=json&date=2026-10-17');
    expect(r.headers['ratelimit-policy']).toBe('"default";q=150;w=10');
    expect(r.headers['ratelimit']).toBe('"default";r=150;t=10');
  });
});
