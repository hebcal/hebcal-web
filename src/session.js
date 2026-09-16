import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {getIpAddress} from './getIpAddress.js';

/**
 * Server-side, database-backed login sessions.
 *
 * Each www host runs a single node process and there are several w servers
 * behind Varnish, so a user's next request can land on a different host. An
 * in-memory session store therefore will not work; sessions live in the
 * `user_session` MySQL table (shared) and the browser holds only an opaque,
 * signed cookie naming the session id.
 *
 * The cookie value is `<sessionId>.<hmac>` where the HMAC (keyed by
 * `hebcal.session.secret` from the INI) lets us reject a forged or corrupted
 * cookie without a database round-trip. The session id itself is 128 bits of
 * randomness, so the signature is defense-in-depth rather than the sole check
 * -- the authoritative test is that the id exists and is unexpired in the DB.
 */

export const SESSION_COOKIE = 'S';

// 399-day rolling sessions, matching the `C` preference cookie and sitting just
// under the ~400-day cap browsers clamp persistent cookies to. Long-lived on
// purpose: this is a calendar site, not a bank, users expect to stay signed in,
// and the TTL only bounds *inactive* sessions -- an active user's `expires` is
// pushed forward (see touchIfStale) so they are never logged out from under
// themselves. What keeps a lifetime this long safe is that every session is a
// `user_session` row we can revoke server-side (logout, admin, prune); a
// stateless token could not afford this.
//
// The refresh interval is the most a session's `expires` may lag "now" before
// we re-stamp it. Kept coarse (weekly) because each refresh emits a Set-Cookie,
// and Varnish will not cache a response that carries one -- so a shorter
// interval would needlessly bypass the cache for active users.
const SESSION_TTL_MS = 399 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {import('koa').Context} ctx
 * @return {string}
 */
function sessionSecret(ctx) {
  const secret = ctx.iniConfig['hebcal.session.secret'];
  if (!secret) {
    throw new Error('hebcal.session.secret is not configured');
  }
  return secret;
}

/**
 * Append an HMAC to an opaque value so a tampered cookie can be rejected
 * cheaply.
 * @param {string} value
 * @param {string} secret
 * @return {string}
 */
export function signValue(value, secret) {
  const mac = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

/**
 * Verify and strip the HMAC produced by {@link signValue}. Returns the original
 * value, or null if the input is malformed or the signature does not match.
 * @param {string} signed
 * @param {string} secret
 * @return {string|null}
 */
export function unsignValue(signed, secret) {
  if (typeof signed !== 'string') {
    return null;
  }
  const dot = signed.lastIndexOf('.');
  if (dot < 1) {
    return null;
  }
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard it first.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return value;
}

/**
 * Create a new login session for a user, persist it, and set the signed
 * session cookie on the response.
 * @param {import('koa').Context} ctx
 * @param {string} userId
 * @return {Promise<string>} the new session id
 */
export async function createSession(ctx, userId) {
  const sessionId = randomBytes(16).toString('hex'); // 32 hex chars
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  const ua = ctx.get('user-agent') || null;
  const sql = `INSERT INTO user_session
    (id, user_id, created, expires, ip, user_agent)
    VALUES (?, ?, NOW(), ?, ?, ?)`;
  await ctx.mysql.query(sql, [
    sessionId,
    userId,
    expires,
    getIpAddress(ctx),
    ua ? ua.substring(0, 255) : null,
  ]);
  setSessionCookie(ctx, sessionId, expires);
  return sessionId;
}

/**
 * @param {import('koa').Context} ctx
 * @param {string} sessionId
 * @param {Date} expires
 */
function setSessionCookie(ctx, sessionId, expires) {
  const signed = signValue(sessionId, sessionSecret(ctx));
  ctx.cookies.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    // No `secure`: TLS is terminated at Varnish/Caddy, so Koa sees an http
    // connection and would throw "Cannot send secure cookie over unencrypted
    // connection". The edge is https-only, so the cookie still only travels
    // over TLS between the browser and the terminator.
    sameSite: 'lax',
    expires,
    overwrite: true,
  });
}

/**
 * Koa middleware: if a valid session cookie is present, load the user and
 * attach it as `ctx.state.user` ({id, email, displayName}). Otherwise leaves
 * `ctx.state.user` undefined. Never throws for an anonymous or bad-cookie
 * request -- it simply results in no user.
 * @param {import('koa').Context} ctx
 */
export async function loadSession(ctx) {
  ctx.state.user = undefined;
  const raw = ctx.cookies.get(SESSION_COOKIE);
  if (!raw) {
    return;
  }
  let sessionId;
  try {
    sessionId = unsignValue(raw, sessionSecret(ctx));
  } catch (err) {
    ctx.logger.warn(err, 'session secret missing while loading session');
    return;
  }
  if (!sessionId || !/^[0-9a-f]{32}$/.test(sessionId)) {
    return;
  }
  const sql = `SELECT s.user_id, s.expires, s.created,
      u.email, u.display_name
    FROM user_session s
    JOIN user u ON u.id = s.user_id
    WHERE s.id = ?`;
  const rows = await ctx.mysql.query(sql, [sessionId]);
  const row = rows?.[0];
  if (!row) {
    return;
  }
  if (new Date(row.expires).getTime() < Date.now()) {
    // Expired: drop the row and clear the cookie.
    await destroySessionById(ctx, sessionId);
    clearSessionCookie(ctx);
    return;
  }
  ctx.state.session = {id: sessionId, expires: row.expires};
  ctx.state.user = {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
  };
  await touchIfStale(ctx, sessionId, row.expires);
}

/**
 * Slide the expiry forward for an active session, but at most once per refresh
 * window (a day). This must NOT run on every request: re-setting the cookie
 * emits a `Set-Cookie` header, and Varnish refuses to cache any response that
 * carries one -- so a per-request refresh would make every cacheable page
 * uncacheable for a logged-in user. Gating it means the common case emits no
 * `Set-Cookie` and the page caches normally.
 * @param {import('koa').Context} ctx
 * @param {string} sessionId
 * @param {Date} expires current expiry from the DB
 */
async function touchIfStale(ctx, sessionId, expires) {
  const now = Date.now();
  const remaining = new Date(expires).getTime() - now;
  // `remaining` starts at SESSION_TTL_MS and shrinks; refresh once it has
  // dropped by a full refresh window (i.e. ~a day has passed since last set).
  if (remaining > SESSION_TTL_MS - SESSION_REFRESH_MS) {
    return;
  }
  const newExpires = new Date(now + SESSION_TTL_MS);
  await ctx.mysql.query('UPDATE user_session SET expires = ? WHERE id = ?',
      [newExpires, sessionId]);
  setSessionCookie(ctx, sessionId, newExpires);
}

/**
 * @param {import('koa').Context} ctx
 * @param {string} sessionId
 */
export async function destroySessionById(ctx, sessionId) {
  await ctx.mysql.query('DELETE FROM user_session WHERE id = ?', [sessionId]);
}

/**
 * Log the current user out: delete the active session row and clear the cookie.
 * @param {import('koa').Context} ctx
 */
export async function destroySession(ctx) {
  const raw = ctx.cookies.get(SESSION_COOKIE);
  if (raw) {
    let sessionId = null;
    try {
      sessionId = unsignValue(raw, sessionSecret(ctx));
    } catch {
      sessionId = null;
    }
    if (sessionId && /^[0-9a-f]{32}$/.test(sessionId)) {
      await destroySessionById(ctx, sessionId);
    }
  }
  clearSessionCookie(ctx);
}

/**
 * @param {import('koa').Context} ctx
 */
function clearSessionCookie(ctx) {
  ctx.cookies.set(SESSION_COOKIE, null, {
    httpOnly: true,
    // No `secure` -- see setSessionCookie().
    sameSite: 'lax',
    overwrite: true,
  });
}
