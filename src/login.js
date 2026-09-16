import createError from 'http-errors';
import {rejectForgedCrossOriginPost} from './common.js';
import {matomoTrack} from './matomoTrack.js';
import {createSession, destroySession, signValue, unsignValue} from './session.js';
import {findOrCreateUser} from './userAccount.js';
import {
  isGoogleLoginConfigured,
  beginGoogleLogin,
  completeGoogleLogin,
  googleRedirectUri,
} from './oauthGoogle.js';

// Short-lived cookie carrying the in-flight OAuth transaction secrets
// (PKCE verifier, state, nonce) between the /login/google redirect and the
// callback. Signed with the same secret as the session cookie.
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
 * GET /login -- the "Sign in with Google" (and, later, Apple) page.
 * @param {import('koa').Context} ctx
 */
export async function loginPage(ctx) {
  noStore(ctx);
  const next = safeNext(ctx.request.query.next);
  if (ctx.state.user) {
    ctx.redirect(next === '/' ? '/account' : next);
    return;
  }
  // googleLoginEnabled is set globally in app-www.js sessionMiddleware.
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
  const payload = {...txn, next: safeNext(ctx.request.query.next)};
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  ctx.cookies.set(TXN_COOKIE, signValue(encoded, sessionSecret(ctx)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(Date.now() + TXN_TTL_MS),
    overwrite: true,
  });
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
  const raw = ctx.cookies.get(TXN_COOKIE);
  const encoded = raw ? unsignValue(raw, sessionSecret(ctx)) : null;
  if (!encoded) {
    ctx.throw(400, 'Login session expired or missing; please try again');
  }
  // Consume the one-time transaction cookie.
  ctx.cookies.set(TXN_COOKIE, null, {overwrite: true});
  let txn;
  try {
    txn = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch {
    ctx.throw(400, 'Malformed login state; please try again');
  }

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

  const userId = await findOrCreateUser(ctx, 'google', profile);
  await createSession(ctx, userId);
  matomoTrack(ctx, 'Login', 'signin', 'google');
  ctx.redirect(safeNext(txn.next));
}

/**
 * POST /logout -- destroy the current session.
 * @param {import('koa').Context} ctx
 */
export async function logout(ctx) {
  noStore(ctx);
  rejectForgedCrossOriginPost(ctx);
  await destroySession(ctx);
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
  return ctx.render('account', {
    title: 'Your Account - Hebcal',
    user: ctx.state.user,
  });
}
