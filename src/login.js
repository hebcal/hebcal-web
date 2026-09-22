import createError from 'http-errors';
import {rejectForgedCrossOriginPost} from './common.js';
import {matomoTrack} from './matomoTrack.js';
import {createSession, destroySession, signValue, unsignValue} from './session.js';
import {findOrCreateUser} from './userAccount.js';
import {getAccountSubscriptions, formatMonthYear} from './accountSubscriptions.js';
import {setLoginHintCookie} from './cookie.js';
import {
  isGoogleLoginConfigured,
  beginGoogleLogin,
  completeGoogleLogin,
  googleRedirectUri,
} from './oauthGoogle.js';
import {
  isAppleLoginConfigured,
  beginAppleLogin,
  completeAppleLogin,
  appleRedirectUri,
  parseAppleUserField,
} from './oauthApple.js';

// Short-lived cookie carrying the in-flight OAuth transaction secrets (PKCE
// verifier, state, nonce) between the /login/<provider> redirect and the
// callback. Signed with the same secret as the session cookie. One cookie name
// serves both providers -- only one login can be in flight at a time, and the
// payload names the provider so a callback cannot consume the other's
// transaction.
const TXN_COOKIE = 'OT';
const TXN_TTL_MS = 10 * 60 * 1000;

/**
 * None of the login routes may ever be cached by Varnish or the browser.
 * @param {import('koa').Context} ctx
 */
function noStore(ctx) {
  ctx.set('Cache-Control', 'private, no-store');
}

/**
 * @param {import('koa').Context} ctx
 * @return {string}
 */
function sessionSecret(ctx) {
  const secret = ctx.iniConfig['hebcal.session.secret'];
  if (!secret) {
    throw createError(500, 'Login is not configured on this server');
  }
  return secret;
}

/**
 * Only allow same-site relative return paths (e.g. "/yahrzeit"), never an
 * absolute or protocol-relative URL that could bounce the user off-site.
 * @param {string|undefined} next
 * @return {string}
 */
function safeNext(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/';
}

/**
 * Write the transaction cookie by hand rather than through `ctx.cookies.set()`.
 *
 * Apple mandates `response_mode=form_post`, so its callback is a cross-site
 * POST and a `SameSite=Lax` cookie would simply not be sent with it -- the
 * transaction has to be `SameSite=None`, which browsers only honour together
 * with `Secure`. But TLS terminates at Varnish/Caddy, so Koa sees an http
 * connection and `ctx.cookies.set()` refuses to emit a `Secure` cookie at all
 * (the same reason session.js cannot set one). Emitting the header ourselves
 * sidesteps that check; the edge is https-only, so the cookie still never
 * travels in the clear.
 *
 * Any previous `Set-Cookie` for this name is dropped so that setting and then
 * clearing within one response cannot leave two conflicting headers.
 *
 * Exported so the cookie contract can be unit-tested without a live round trip
 * to a provider's discovery endpoint.
 * @param {import('koa').Context} ctx
 * @param {string|null} value null clears the cookie
 * @param {boolean} crossSite true for the SameSite=None; Secure flavour
 */
export function setTxnCookie(ctx, value, crossSite) {
  const prefix = `${TXN_COOKIE}=`;
  const existing = ctx.response.get('Set-Cookie');
  const kept = (Array.isArray(existing) ? existing : existing ? [existing] : [])
      .filter((s) => !s.startsWith(prefix));
  const attrs = ['Path=/', 'HttpOnly'];
  if (crossSite) {
    attrs.push('SameSite=None', 'Secure');
  } else {
    attrs.push('SameSite=Lax');
  }
  const cookie = value === null ?
    `${prefix}; Expires=${new Date(0).toUTCString()}; ${attrs.join('; ')}` :
    `${prefix}${value}; Expires=${new Date(Date.now() + TXN_TTL_MS).toUTCString()}; ` +
      attrs.join('; ');
  ctx.set('Set-Cookie', kept.concat(cookie));
}

/**
 * Stash the in-flight OAuth transaction in the signed, short-lived cookie.
 * @param {import('koa').Context} ctx
 * @param {string} provider 'google' or 'apple'
 * @param {Object} txn
 * @param {string} next
 */
function startTxn(ctx, provider, txn, next) {
  const payload = {...txn, provider, next};
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  setTxnCookie(ctx, signValue(encoded, sessionSecret(ctx)), provider === 'apple');
}

/**
 * Read, verify and consume the transaction cookie. Throws a 400 when it is
 * missing, unsigned, malformed, or belongs to the other provider's flow.
 * @param {import('koa').Context} ctx
 * @param {string} provider the provider whose callback is running
 * @return {Object} the transaction payload
 */
function consumeTxn(ctx, provider) {
  const raw = ctx.cookies.get(TXN_COOKIE);
  const encoded = raw ? unsignValue(raw, sessionSecret(ctx)) : null;
  if (!encoded) {
    ctx.throw(400, 'Login session expired or missing; please try again');
  }
  // Consume the one-time transaction cookie.
  setTxnCookie(ctx, null, provider === 'apple');
  let txn;
  try {
    txn = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch {
    ctx.throw(400, 'Malformed login state; please try again');
  }
  // An Apple transaction cookie is SameSite=None, so it rides along on
  // cross-site requests in a way the Google one never does. Pinning each
  // transaction to its provider stops one flow's state being replayed into the
  // other's callback.
  if (txn.provider !== provider) {
    ctx.throw(400, 'Login state does not match this provider; please try again');
  }
  return txn;
}

/**
 * Everything that happens once a provider has vouched for a profile: resolve
 * it to a user, start a session, flip the navbar hint cookie, and bounce the
 * browser to wherever the login started from.
 * @param {import('koa').Context} ctx
 * @param {string} provider
 * @param {{sub: string, email: string, emailVerified: boolean, name: string|undefined}} profile
 * @param {string} next
 */
async function finishLogin(ctx, provider, profile, next) {
  const userId = await findOrCreateUser(ctx, provider, profile);
  await createSession(ctx, userId);
  setLoginHintCookie(ctx, true);
  matomoTrack(ctx, 'Login', 'signin', provider);
  ctx.redirect(safeNext(next));
}

/**
 * GET /login -- the "Sign in with Google" / "Sign in with Apple" page.
 * @param {import('koa').Context} ctx
 */
export async function loginPage(ctx) {
  noStore(ctx);
  const next = safeNext(ctx.request.query.next);
  if (ctx.state.user) {
    ctx.redirect(next === '/' ? '/account' : next);
    return;
  }
  // googleLoginEnabled / appleLoginEnabled are set globally in app-www.js.
  return ctx.render('login', {
    title: 'Sign in - Hebcal',
    next,
  });
}

/**
 * GET /login/google -- start the OAuth flow.
 * @param {import('koa').Context} ctx
 */
export async function loginGoogleStart(ctx) {
  noStore(ctx);
  if (!isGoogleLoginConfigured(ctx.iniConfig)) {
    ctx.throw(404, 'Google login is not configured');
  }
  const {url, txn} = await beginGoogleLogin(ctx);
  startTxn(ctx, 'google', txn, safeNext(ctx.request.query.next));
  ctx.redirect(url);
}

/**
 * GET /login/google/callback -- finish the OAuth flow.
 * @param {import('koa').Context} ctx
 */
export async function loginGoogleCallback(ctx) {
  noStore(ctx);
  if (!isGoogleLoginConfigured(ctx.iniConfig)) {
    ctx.throw(404, 'Google login is not configured');
  }
  const txn = consumeTxn(ctx, 'google');

  // Rebuild the callback URL from the redirect_uri that was recorded in the
  // signed transaction cookie at the start of the flow (plus the real query
  // string). Using the stored value -- not a fresh derivation -- guarantees the
  // token exchange's redirect_uri exactly matches the one sent to Google, which
  // matters when the dev host (localhost vs 127.0.0.1) determined it.
  const cbUrl = new URL(txn.redirect_uri || googleRedirectUri(ctx));
  cbUrl.search = ctx.request.querystring;

  let profile;
  try {
    profile = await completeGoogleLogin(ctx, cbUrl, txn);
  } catch (err) {
    ctx.logger.warn(err, 'Google login callback failed');
    ctx.throw(400, 'Google sign-in could not be completed; please try again');
  }

  await finishLogin(ctx, 'google', profile, txn.next);
}

/**
 * GET /login/apple -- start the OAuth flow.
 * @param {import('koa').Context} ctx
 */
export async function loginAppleStart(ctx) {
  noStore(ctx);
  if (!isAppleLoginConfigured(ctx.iniConfig)) {
    ctx.throw(404, 'Apple login is not configured');
  }
  const {url, txn} = await beginAppleLogin(ctx);
  startTxn(ctx, 'apple', txn, safeNext(ctx.request.query.next));
  ctx.redirect(url);
}

/**
 * POST (or GET) /login/apple/callback -- finish the OAuth flow.
 *
 * Apple form-posts the authorization response cross-site, so unlike the Google
 * callback the parameters arrive in the request body. `rejectForgedCrossOriginPost()`
 * is deliberately NOT called here: the POST is a legitimate cross-origin one
 * from appleid.apple.com, and its CSRF guarantee is the `state` value bound to
 * this browser by the transaction cookie.
 * @param {import('koa').Context} ctx
 */
export async function loginAppleCallback(ctx) {
  noStore(ctx);
  if (!isAppleLoginConfigured(ctx.iniConfig)) {
    ctx.throw(404, 'Apple login is not configured');
  }
  const params = ctx.method === 'POST' ?
    (ctx.request.body || {}) : ctx.request.query;
  const txn = consumeTxn(ctx, 'apple');

  // "Cancel" on Apple's consent screen is a normal outcome, not an error page:
  // send the user back where they came from.
  if (typeof params.error === 'string' && params.error !== '') {
    ctx.logger.info({appleError: params.error}, 'Apple login declined');
    ctx.redirect(safeNext(txn.next));
    return;
  }

  // openid-client reads the authorization response from a URL's query string;
  // Apple put it in the body, so put it back where the library looks.
  const cbUrl = new URL(txn.redirect_uri || appleRedirectUri(ctx));
  for (const key of ['code', 'state', 'id_token']) {
    if (typeof params[key] === 'string' && params[key] !== '') {
      cbUrl.searchParams.set(key, params[key]);
    }
  }

  let profile;
  try {
    profile = await completeAppleLogin(ctx, cbUrl, txn);
  } catch (err) {
    ctx.logger.warn(err, 'Apple login callback failed');
    ctx.throw(400, 'Apple sign-in could not be completed; please try again');
  }

  // Apple sends the display name exactly once -- in this first callback's
  // `user` field, never in the ID token and never again on a later sign-in.
  // Grab it here or lose it.
  const name = profile.name || parseAppleUserField(params.user);
  await finishLogin(ctx, 'apple', {...profile, name}, txn.next);
}

/**
 * POST /logout -- destroy the current session.
 * @param {import('koa').Context} ctx
 */
export async function logout(ctx) {
  noStore(ctx);
  rejectForgedCrossOriginPost(ctx);
  await destroySession(ctx);
  setLoginHintCookie(ctx, false);
  ctx.redirect('/');
}

/**
 * GET /account -- the signed-in user's account page.
 * @param {import('koa').Context} ctx
 */
export async function accountPage(ctx) {
  noStore(ctx);
  if (!ctx.state.user) {
    ctx.redirect('/login?next=%2Faccount');
    return;
  }
  const {shabbat, yahrzeit} = await getAccountSubscriptions(ctx, ctx.state.user.email);
  return ctx.render('account', {
    title: 'Your Account - Hebcal',
    user: ctx.state.user,
    shabbat,
    yahrzeit,
    formatMonthYear,
  });
}
