import {describe, it, expect, beforeAll, beforeEach, vi} from 'vitest';
import request from 'supertest';
import {generateKeyPairSync} from 'node:crypto';

// The callback's one network-touching step is the token exchange with Apple.
// Stubbing just that leaves the whole rest of the handler real: transaction
// cookie, provider pinning, account resolution, session creation, redirect.
vi.mock('../src/oauthApple.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, completeAppleLogin: vi.fn()};
});
// Fire-and-forget analytics; no reason to let it dial out from the suite.
vi.mock('../src/matomoTrack.js', () => ({matomoTrack: vi.fn()}));

const {app} = await import('../src/app-www.js');
const {MockMysqlDb} = await import('./mock-mysql.js');
const {makeServer} = await import('./testServer.js');
const {signValue} = await import('../src/session.js');
const {completeAppleLogin} = await import('../src/oauthApple.js');

const server = makeServer(app);
const SECRET = 'apple-callback-secret';
const APPLE_PEM = generateKeyPairSync('ec', {namedCurve: 'prime256v1'})
    .privateKey.export({type: 'pkcs8', format: 'pem'}).replace(/\n/g, '\\n');
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
  app.context.iniConfig['hebcal.apple.oauth.client_id'] = 'com.hebcal.web';
  app.context.iniConfig['hebcal.apple.oauth.team_id'] = 'TEAM123456';
  app.context.iniConfig['hebcal.apple.oauth.key_id'] = 'KEY1234567';
  app.context.iniConfig['hebcal.apple.oauth.private_key'] = APPLE_PEM;
});

beforeEach(() => {
  vi.mocked(completeAppleLogin).mockReset();
});

/** A signed transaction cookie of the shape loginAppleStart() writes. */
function appleTxn(next = '/account') {
  const payload = {
    provider: 'apple',
    state: 'st',
    nonce: 'no',
    redirect_uri: 'https://www.hebcal.com/login/apple/callback',
    next,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `OT=${signValue(encoded, SECRET)}`;
}

/** Apple's form post, as the browser submits it to our Return URL. */
function postCallback(body, txn = appleTxn()) {
  return request(server)
      .post('/login/apple/callback')
      .set('Cookie', txn)
      .set('Origin', 'https://appleid.apple.com')
      .type('form')
      .send(body)
      .redirects(0);
}

describe('POST /login/apple/callback', () => {
  it('signs the user in and returns them to `next`', async () => {
    completeAppleLogin.mockResolvedValue({
      sub: '000123.apple.subject', email: 'new-apple@example.com',
      emailVerified: true, isPrivateEmail: false, name: undefined,
    });
    const res = await postCallback({code: 'authcode', state: 'st'});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');
    expect(res.headers['cache-control']).toContain('no-store');

    const identity = mysql.mockData.userIdentities['apple\u0000000123.apple.subject'];
    expect(identity).toBeDefined();
    expect(mysql.mockData.users[identity.user_id].email).toBe('new-apple@example.com');

    const cookies = res.headers['set-cookie'];
    // A session cookie was issued...
    expect(cookies.some((c) => c.startsWith('S='))).toBe(true);
    // ...the navbar's client-side "signed in" hint was set...
    expect(cookies.some((c) => c.startsWith('C=') && c.includes('hu=1'))).toBe(true);
    // ...and the one-time transaction cookie was consumed, exactly once.
    const ot = cookies.filter((c) => c.startsWith('OT='));
    expect(ot.length).toBe(1);
    expect(ot[0]).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('keeps the display name Apple sends only on the first authorization', async () => {
    completeAppleLogin.mockResolvedValue({
      sub: '000124.apple.subject', email: 'named@example.com',
      emailVerified: true, isPrivateEmail: false, name: undefined,
    });
    const res = await postCallback({
      code: 'authcode', state: 'st',
      user: '{"name":{"firstName":"Ada","lastName":"Lovelace"},"email":"named@example.com"}',
    });
    expect(res.status).toBe(302);
    const identity = mysql.mockData.userIdentities['apple\u0000000124.apple.subject'];
    expect(mysql.mockData.users[identity.user_id].display_name).toBe('Ada Lovelace');
  });

  it('merges onto an existing Google account with the same verified email', async () => {
    // The whole point of matching on a provider-verified address: one person,
    // one Hebcal account, whichever button they happened to press.
    const shared = 'both-providers@example.com';
    const userId = 'existing-user-id';
    mysql.mockData.users[userId] = {
      id: userId, email: shared, email_verified: 1,
      display_name: 'Existing', created: new Date(),
    };
    mysql.mockData.userIdentities['google\u0000g-sub-1'] = {
      provider: 'google', provider_sub: 'g-sub-1', user_id: userId, email: shared,
    };
    completeAppleLogin.mockResolvedValue({
      sub: '000125.apple.subject', email: shared,
      emailVerified: true, isPrivateEmail: false, name: undefined,
    });
    const res = await postCallback({code: 'authcode', state: 'st'});
    expect(res.status).toBe(302);
    expect(mysql.mockData.userIdentities['apple\u0000000125.apple.subject'].user_id)
        .toBe(userId);
  });

  it('does not let an unverified Apple email take over an existing account', async () => {
    const victim = 'victim@example.com';
    const victimId = 'victim-user-id';
    mysql.mockData.users[victimId] = {
      id: victimId, email: victim, email_verified: 1,
      display_name: 'Victim', created: new Date(),
    };
    completeAppleLogin.mockResolvedValue({
      sub: '000126.apple.subject', email: victim,
      emailVerified: false, isPrivateEmail: false, name: undefined,
    });
    const res = await postCallback({code: 'authcode', state: 'st'});
    expect(res.status).toBe(302);
    const identity = mysql.mockData.userIdentities['apple\u0000000126.apple.subject'];
    expect(identity.user_id).not.toBe(victimId);
    // The new account carries no claim on that address.
    expect(mysql.mockData.users[identity.user_id].email).toBeNull();
  });

  it('treats "Cancel" on Apple\'s consent screen as a normal return, not an error', async () => {
    const res = await postCallback({error: 'user_cancelled_authorize'}, appleTxn('/yahrzeit'));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/yahrzeit');
    expect(completeAppleLogin).not.toHaveBeenCalled();
    expect(res.headers['set-cookie'].some((c) => c.startsWith('S='))).toBe(false);
  });

  it('is a 400 when the token exchange fails', async () => {
    completeAppleLogin.mockRejectedValue(new Error('bad nonce'));
    const res = await postCallback({code: 'authcode', state: 'st'});
    expect(res.status).toBe(400);
  });

  it('refuses an off-site `next`', async () => {
    completeAppleLogin.mockResolvedValue({
      sub: '000127.apple.subject', email: 'offsite@example.com',
      emailVerified: true, isPrivateEmail: false, name: undefined,
    });
    const res = await postCallback({code: 'authcode', state: 'st'},
        appleTxn('//evil.example.com/'));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});
