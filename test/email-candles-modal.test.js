import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';

const server = makeServer(app);
const SECRET = 'candles-secret';
// nobody@example.com has an active sub for geonameid 3530597 in the mock.
const SUBSCRIBED_GEO = '3530597';
const OTHER_GEO = '293397';
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
  app.context.iniConfig['hebcal.google.oauth.client_id'] = 'id';
  app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'secret';
  delete app.context.iniConfig['hebcal.google.oauth.disabled'];
});

function cookie(sid) {
  return `${SESSION_COOKIE}=${signValue(sid, SECRET)}`;
}

describe('/email/subscription-status', () => {
  it('returns loggedIn:false and no-store for anonymous', async () => {
    const res = await request(server).get(`/email/subscription-status?geonameid=${OTHER_GEO}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({loggedIn: false});
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('reports hasActiveSub:true when the user has any active subscription (even for another city)', async () => {
    const sid = 'a'.repeat(32);
    mysql.seedSession({userId: 'u1', email: 'nobody@example.com', sessionId: sid});
    // nobody@example.com is subscribed to SUBSCRIBED_GEO; ask about OTHER_GEO.
    const res = await request(server)
        .get(`/email/subscription-status?geonameid=${OTHER_GEO}`)
        .set('Cookie', cookie(sid));
    expect(res.body).toMatchObject({
      loggedIn: true, email: 'nobody@example.com', hasActiveSub: true,
    });
  });

  it('reports hasActiveSub:false when the user has no subscription', async () => {
    const sid = 'b'.repeat(32);
    mysql.seedSession({userId: 'u2', email: 'no-sub@example.com', sessionId: sid});
    const res = await request(server)
        .get(`/email/subscription-status?geonameid=${SUBSCRIBED_GEO}`)
        .set('Cookie', cookie(sid));
    expect(res.body).toMatchObject({loggedIn: true, hasActiveSub: false});
  });
});

describe('candles modal renders on shabbat and hebcal routes', () => {
  it('shabbat route includes the modal signed-in variants + status script', async () => {
    const res = await request(server).get(`/shabbat?geonameid=${OTHER_GEO}&b=20`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="emc-subscribe-me"');
    expect(res.text).toContain('id="emc-update"');
    expect(res.text).toContain('/email/subscription-status');
  });

  it('hebcal route includes the modal signed-in variants + status script', async () => {
    const res = await request(server)
        .get(`/hebcal?v=1&geo=geoname&geonameid=${OTHER_GEO}&b=20&yt=H&year=5788&c=on&s=on&maj=on&i=on`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="emc-subscribe-me"');
    expect(res.text).toContain('/email/subscription-status');
  });
});
