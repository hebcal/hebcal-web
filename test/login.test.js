import {describe, it, expect, beforeAll, beforeEach} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';

const server = makeServer(app);
const SECRET = 'route-test-secret';
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
});

function enableGoogle() {
  app.context.iniConfig['hebcal.google.oauth.client_id'] = 'test-client-id';
  app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'test-client-secret';
}

function disableGoogle() {
  delete app.context.iniConfig['hebcal.google.oauth.client_id'];
  delete app.context.iniConfig['hebcal.google.oauth.client_secret'];
}

beforeEach(() => {
  disableGoogle();
});

describe('login routes', () => {
  it('GET /login shows the Google button when configured', async () => {
    enableGoogle();
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign in with Google');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('GET /login/google 404s when not configured', async () => {
    const res = await request(server).get('/login/google');
    expect(res.status).toBe(404);
  });

  it('GET /login/google/callback without a txn cookie is a 400', async () => {
    enableGoogle();
    const res = await request(server).get('/login/google/callback?code=x&state=y');
    expect(res.status).toBe(400);
  });

  it('GET /account redirects anonymous users to /login', async () => {
    const res = await request(server).get('/account').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?next=%2Faccount');
  });

  it('GET /account shows the email for a logged-in user', async () => {
    const sid = 'b'.repeat(32);
    mysql.seedSession({
      userId: 'u_route', email: 'you@example.com',
      displayName: 'You', sessionId: sid,
    });
    const res = await request(server)
        .get('/account')
        .set('Cookie', `${SESSION_COOKIE}=${signValue(sid, SECRET)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('you@example.com');
  });

  it('POST /logout redirects home', async () => {
    const res = await request(server).post('/logout').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('rejects a non-GET on /login', async () => {
    const res = await request(server).post('/login');
    expect(res.status).toBe(405);
  });
});
