import {describe, it, expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {MockMysqlDb} from './mock-mysql.js';
import {
  signValue,
  unsignValue,
  createSession,
  loadSession,
  destroySession,
  SESSION_COOKIE,
} from '../src/session.js';
import {findOrCreateUser} from '../src/userAccount.js';

const SECRET = 'unit-test-session-secret';

/**
 * Minimal ctx double for exercising session.js without booting the Koa app.
 * @param {MockMysqlDb} mysql
 * @return {object}
 */
function fakeCtx(mysql) {
  const jar = new Map();
  return {
    iniConfig: {'hebcal.session.secret': SECRET},
    mysql,
    logger: {warn() {}},
    state: {},
    request: {ip: '127.0.0.1'},
    get(name) {
      return name.toLowerCase() === 'user-agent' ? 'vitest' : '';
    },
    cookies: {
      get(name) {
        return jar.get(name);
      },
      set(name, value) {
        if (value === null || value === undefined) {
          jar.delete(name);
        } else {
          jar.set(name, value);
        }
      },
    },
    _jar: jar,
  };
}

describe('session cookie signing', () => {
  it('round-trips a value', () => {
    const id = randomBytes(16).toString('hex');
    const signed = signValue(id, SECRET);
    expect(unsignValue(signed, SECRET)).toBe(id);
  });

  it('rejects tampering, wrong secret, and malformed input', () => {
    const signed = signValue('abc', SECRET);
    expect(unsignValue('x' + signed.slice(1), SECRET)).toBe(null);
    expect(unsignValue(signed, 'other-secret')).toBe(null);
    expect(unsignValue('nodot', SECRET)).toBe(null);
    expect(unsignValue('', SECRET)).toBe(null);
    expect(unsignValue(undefined, SECRET)).toBe(null);
  });
});

describe('DB-backed sessions', () => {
  it('creates, loads, and destroys a session', async () => {
    const mysql = new MockMysqlDb();
    mysql.mockData.users['u_test'] = {
      id: 'u_test', email: 'a@example.com', email_verified: 1,
      display_name: 'Ada', created: new Date(),
    };

    const ctx1 = fakeCtx(mysql);
    const sid = await createSession(ctx1, 'u_test');
    const cookie = ctx1._jar.get(SESSION_COOKIE);
    expect(unsignValue(cookie, SECRET)).toBe(sid);

    const ctx2 = fakeCtx(mysql);
    ctx2._jar.set(SESSION_COOKIE, cookie);
    await loadSession(ctx2);
    expect(ctx2.state.user).toMatchObject({
      id: 'u_test', email: 'a@example.com', displayName: 'Ada',
    });

    await destroySession(ctx2);
    expect(ctx2._jar.get(SESSION_COOKIE)).toBeUndefined();
    expect(mysql.mockData.userSessions[sid]).toBeUndefined();

    const ctx3 = fakeCtx(mysql);
    ctx3._jar.set(SESSION_COOKIE, cookie);
    await loadSession(ctx3);
    expect(ctx3.state.user).toBeUndefined();
  });

  it('ignores a forged cookie', async () => {
    const mysql = new MockMysqlDb();
    const ctx = fakeCtx(mysql);
    ctx._jar.set(SESSION_COOKIE, signValue('0'.repeat(32), 'wrong-secret'));
    await loadSession(ctx);
    expect(ctx.state.user).toBeUndefined();
  });

  it('does not re-set the cookie for a fresh session (keeps pages cacheable)', async () => {
    const mysql = new MockMysqlDb();
    mysql.mockData.users['u_fresh'] = {
      id: 'u_fresh', email: 'f@example.com', email_verified: 1,
      display_name: null, created: new Date(),
    };
    const ctx1 = fakeCtx(mysql);
    await createSession(ctx1, 'u_fresh');
    const cookie = ctx1._jar.get(SESSION_COOKIE);

    const ctx2 = fakeCtx(mysql);
    ctx2._jar.set(SESSION_COOKIE, cookie);
    let cookieWasSet = false;
    const realSet = ctx2.cookies.set;
    ctx2.cookies.set = (name, value) => {
      if (name === SESSION_COOKIE) cookieWasSet = true;
      realSet(name, value);
    };
    await loadSession(ctx2);
    expect(ctx2.state.user).toBeTruthy();
    expect(cookieWasSet).toBe(false); // no Set-Cookie for a fresh session
  });

  it('refreshes a session that is inside the refresh window', async () => {
    const mysql = new MockMysqlDb();
    const sid = 'c'.repeat(32);
    // expires in 2 days: well past the (30 - 1) day refresh threshold.
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    mysql.seedSession({
      userId: 'u_old', email: 'o@example.com', sessionId: sid, expires: soon,
    });
    const ctx = fakeCtx(mysql);
    ctx._jar.set(SESSION_COOKIE, signValue(sid, SECRET));
    await loadSession(ctx);
    expect(ctx.state.user).toBeTruthy();
    // expiry was slid forward toward +30 days
    expect(new Date(mysql.mockData.userSessions[sid].expires).getTime())
        .toBeGreaterThan(soon.getTime());
  });

  it('drops an expired session and logs nobody in', async () => {
    const mysql = new MockMysqlDb();
    const sid = 'a'.repeat(32);
    mysql.seedSession({
      userId: 'u2', email: 'b@example.com', sessionId: sid,
      expires: new Date(Date.now() - 1000),
    });
    const ctx = fakeCtx(mysql);
    ctx._jar.set(SESSION_COOKIE, signValue(sid, SECRET));
    await loadSession(ctx);
    expect(ctx.state.user).toBeUndefined();
    expect(mysql.mockData.userSessions[sid]).toBeUndefined();
  });
});

describe('findOrCreateUser', () => {
  const profile = {
    sub: '1234567890', email: 'new@example.com',
    emailVerified: true, name: 'New Person',
  };

  it('creates a user + identity on first login', async () => {
    const mysql = new MockMysqlDb();
    const ctx = fakeCtx(mysql);
    const userId = await findOrCreateUser(ctx, 'google', profile);
    expect(userId).toBeTruthy();
    expect(mysql.mockData.users[userId].email).toBe('new@example.com');
    expect(mysql.mockData.userIdentities['google\x001234567890'].user_id).toBe(userId);
  });

  it('returns the same user on a repeat login', async () => {
    const mysql = new MockMysqlDb();
    const ctx = fakeCtx(mysql);
    const first = await findOrCreateUser(ctx, 'google', profile);
    const second = await findOrCreateUser(ctx, 'google', profile);
    expect(second).toBe(first);
    expect(Object.keys(mysql.mockData.users)).toHaveLength(1);
  });

  it('links a new provider to an existing account by verified email', async () => {
    const mysql = new MockMysqlDb();
    const ctx = fakeCtx(mysql);
    const googleId = await findOrCreateUser(ctx, 'google', profile);
    const appleId = await findOrCreateUser(ctx, 'apple', {
      sub: 'apple-sub-1', email: 'new@example.com',
      emailVerified: true, name: 'New Person',
    });
    expect(appleId).toBe(googleId);
    expect(Object.keys(mysql.mockData.users)).toHaveLength(1);
  });

  it('does NOT merge accounts on an unverified email', async () => {
    const mysql = new MockMysqlDb();
    const ctx = fakeCtx(mysql);
    const googleId = await findOrCreateUser(ctx, 'google', profile);
    const otherId = await findOrCreateUser(ctx, 'apple', {
      sub: 'apple-sub-2', email: 'new@example.com',
      emailVerified: false, name: 'Imposter',
    });
    expect(otherId).not.toBe(googleId);
  });
});
