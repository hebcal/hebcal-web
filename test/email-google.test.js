import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';

const server = makeServer(app);
const SECRET = 'email-google-secret';
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
});

function cookie(sid) {
  return `${SESSION_COOKIE}=${signValue(sid, SECRET)}`;
}

// A geonameid the test GeoDb resolves (same one the other email tests use).
const GEONAMEID = '293397';

describe('Google sign-in on /email', () => {
  it('pre-fills the signed-in email and marks the page private on GET', async () => {
    const sid = 'e'.repeat(32);
    mysql.seedSession({userId: 'ug1', email: 'signed@example.com', sessionId: sid});
    const res = await request(server).get('/email').set('Cookie', cookie(sid));
    expect(res.status).toBe(200);
    expect(res.text).toContain('signed@example.com');
    expect(res.headers['cache-control']).toContain('private');
  });

  it('shows a Google sign-in button to anonymous visitors', async () => {
    const res = await request(server).get('/email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/login/google?next=');
  });

  it('activates immediately (no verification email) when the address matches the signed-in user', async () => {
    const sid = 'f'.repeat(32);
    mysql.seedSession({userId: 'ug2', email: 'match@example.com', sessionId: sid});
    const res = await request(server)
        .post('/email')
        .set('Cookie', cookie(sid))
        .type('form')
        .send({cfg: 'json', v: '1', modify: '1', em: 'match@example.com',
          geo: 'geonameid', geonameid: GEONAMEID});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ok: true, verified: true});
    const id = mysql.mockData.emailsByAddress['match@example.com'];
    expect(mysql.mockData.subscriptions[id].email_status).toBe('active');
  });

  it('matches the signed-in email case-insensitively', async () => {
    const sid = 'h'.repeat(32);
    mysql.seedSession({userId: 'ug4', email: 'Mixed@Example.com', sessionId: sid});
    const res = await request(server)
        .post('/email')
        .set('Cookie', cookie(sid))
        .type('form')
        .send({cfg: 'json', v: '1', modify: '1', em: 'mixed@example.com',
          geo: 'geonameid', geonameid: GEONAMEID});
    expect(res.body).toMatchObject({ok: true, verified: true});
  });

  it('still requires email verification when the address differs from the signed-in user', async () => {
    const sid = 'g'.repeat(32);
    mysql.seedSession({userId: 'ug3', email: 'me@example.com', sessionId: sid});
    const res = await request(server)
        .post('/email')
        .set('Cookie', cookie(sid))
        .type('form')
        .send({cfg: 'json', v: '1', modify: '1', em: 'someone-else@example.com',
          geo: 'geonameid', geonameid: GEONAMEID});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ok: true});
    expect(res.body.verified).toBeUndefined();
    const id = mysql.mockData.emailsByAddress['someone-else@example.com'];
    expect(mysql.mockData.subscriptions[id].email_status).toBe('pending');
  });

  it('uses email verification for anonymous subscribers', async () => {
    const res = await request(server)
        .post('/email')
        .type('form')
        .send({cfg: 'json', v: '1', modify: '1', em: 'anon@example.com',
          geo: 'geonameid', geonameid: GEONAMEID});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ok: true});
    expect(res.body.verified).toBeUndefined();
  });
});
