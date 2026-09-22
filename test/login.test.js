import {describe, it, expect, beforeAll, beforeEach} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';
import {setTxnCookie} from '../src/login.js';
import {generateKeyPairSync} from 'node:crypto';

// Apple's client secret is an ES256 JWT, so the gate needs a real key to look
// configured. None of these tests reach Apple's network endpoints.
const APPLE_PEM = generateKeyPairSync('ec', {namedCurve: 'prime256v1'})
    .privateKey.export({type: 'pkcs8', format: 'pem'}).replace(/\n/g, '\\n');

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
  delete app.context.iniConfig['hebcal.google.oauth.disabled'];
}

function enableApple() {
  app.context.iniConfig['hebcal.apple.oauth.client_id'] = 'com.hebcal.web';
  app.context.iniConfig['hebcal.apple.oauth.team_id'] = 'TEAM123456';
  app.context.iniConfig['hebcal.apple.oauth.key_id'] = 'KEY1234567';
  app.context.iniConfig['hebcal.apple.oauth.private_key'] = APPLE_PEM;
}

function disableApple() {
  delete app.context.iniConfig['hebcal.apple.oauth.client_id'];
  delete app.context.iniConfig['hebcal.apple.oauth.team_id'];
  delete app.context.iniConfig['hebcal.apple.oauth.key_id'];
  delete app.context.iniConfig['hebcal.apple.oauth.private_key'];
  delete app.context.iniConfig['hebcal.apple.oauth.disabled'];
}

beforeEach(() => {
  disableGoogle();
  disableApple();
});

/**
 * A validly-signed transaction cookie value for `provider`, minted the same way
 * login.js does, so a callback can be probed without first running a live OAuth
 * redirect.
 */
function txnCookieValue(provider) {
  const payload = {provider, state: 'st', nonce: 'no', next: '/'};
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return signValue(encoded, SECRET);
}

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

  it('honors the disabled kill switch even when credentials are present', async () => {
    enableGoogle();
    app.context.iniConfig['hebcal.google.oauth.disabled'] = '1';
    const page = await request(server).get('/login');
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('Sign in with Google');
    const start = await request(server).get('/login/google');
    expect(start.status).toBe(404);
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

describe('Apple login routes', () => {
  it('GET /login shows the Apple button when configured', async () => {
    enableApple();
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign in with Apple');
    expect(res.text).toContain('/login/apple?next=');
    expect(res.text).toContain('#icon-appleinc');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('GET /login shows both providers when both are configured', async () => {
    enableGoogle();
    enableApple();
    const res = await request(server).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign in with Google');
    expect(res.text).toContain('Sign in with Apple');
  });

  it('GET /login hides the Apple button when only Google is configured', async () => {
    enableGoogle();
    const res = await request(server).get('/login');
    expect(res.text).toContain('Sign in with Google');
    expect(res.text).not.toContain('Sign in with Apple');
  });

  it('GET /login/apple 404s when not configured', async () => {
    const res = await request(server).get('/login/apple');
    expect(res.status).toBe(404);
  });

  it('honors the disabled kill switch even when credentials are present', async () => {
    enableApple();
    app.context.iniConfig['hebcal.apple.oauth.disabled'] = '1';
    const page = await request(server).get('/login');
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('Sign in with Apple');
    const start = await request(server).get('/login/apple');
    expect(start.status).toBe(404);
  });

  it('POST /login/apple/callback without a txn cookie is a 400', async () => {
    enableApple();
    // Apple form-POSTs the authorization response, so POST must reach the
    // handler rather than being turned away as a 405.
    const res = await request(server)
        .post('/login/apple/callback')
        .type('form')
        .send({code: 'x', state: 'y'});
    expect(res.status).toBe(400);
  });

  it('POST /login/apple/callback is not blocked as a forged cross-origin POST', async () => {
    enableApple();
    // The real callback always arrives with Origin: https://appleid.apple.com.
    // Its CSRF guarantee is the state value in the transaction cookie, so the
    // origin check must not run here -- a 403 would break every Apple login.
    const res = await request(server)
        .post('/login/apple/callback')
        .set('Origin', 'https://appleid.apple.com')
        .type('form')
        .send({code: 'x', state: 'y'});
    expect(res.status).toBe(400);
  });

  it('POST /login/apple/callback 404s when Apple login is not configured', async () => {
    const res = await request(server)
        .post('/login/apple/callback')
        .type('form')
        .send({code: 'x', state: 'y'});
    expect(res.status).toBe(404);
  });

  it('rejects a Google transaction cookie replayed into the Apple callback', async () => {
    enableApple();
    // A transaction is pinned to the provider that started it: the Apple cookie
    // is SameSite=None and so rides along on cross-site requests, and this is
    // what stops one flow's state being spent in the other's callback.
    const res = await request(server)
        .post('/login/apple/callback')
        .set('Cookie', `OT=${txnCookieValue('google')}`)
        .type('form')
        .send({code: 'x', state: 'y'});
    expect(res.status).toBe(400);
    expect(res.text).toContain('does not match this provider');
  });
});

/**
 * The transaction cookie attributes are asserted here rather than through
 * /login/<provider>, because reaching that redirect means a live OpenID
 * discovery request to Google or Apple.
 */
describe('OAuth transaction cookie', () => {
  function fakeCtx(existing) {
    const headers = {};
    if (existing) {
      headers['Set-Cookie'] = existing;
    }
    return {
      response: {get: (f) => headers[f]},
      set: (f, v) => {
        headers[f] = v;
      },
      headers,
    };
  }

  it('is SameSite=None; Secure for Apple, whose callback is a cross-site POST', () => {
    const ctx = fakeCtx();
    setTxnCookie(ctx, 'abc123', true);
    const [cookie] = ctx.headers['Set-Cookie'];
    expect(cookie).toContain('OT=abc123');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
  });

  it('is SameSite=Lax and not Secure for Google, a top-level redirect back', () => {
    const ctx = fakeCtx();
    setTxnCookie(ctx, 'abc123', false);
    const [cookie] = ctx.headers['Set-Cookie'];
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('clears with an expiry in the past, keeping the same attributes', () => {
    const ctx = fakeCtx();
    setTxnCookie(ctx, null, true);
    const [cookie] = ctx.headers['Set-Cookie'];
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('SameSite=None');
  });

  it('replaces its own earlier header instead of stacking a second one', () => {
    // Setting then clearing within one response must not leave the browser
    // two conflicting OT cookies to choose between.
    const ctx = fakeCtx(['OT=stale; Path=/', 'S=session; Path=/']);
    setTxnCookie(ctx, null, false);
    const out = ctx.headers['Set-Cookie'];
    expect(out.filter((c) => c.startsWith('OT=')).length).toBe(1);
    // ...and leaves every other cookie on the response alone.
    expect(out).toContain('S=session; Path=/');
  });
});
