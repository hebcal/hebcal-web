import * as oidc from 'openid-client';

/**
 * "Sign in with Google" using OpenID Connect (Authorization Code flow with
 * PKCE). This module isolates every call into `openid-client` so the route
 * handlers in login.js stay small and the network-touching parts are in one
 * place.
 *
 * Configuration comes from the INI (`hebcal.google.oauth.*`). The OpenID
 * discovery document is fetched from Google once and cached for the life of
 * the process.
 */

const ISSUER = new URL('https://accounts.google.com');
const SCOPE = 'openid email profile';

/** @type {Promise<oidc.Configuration>|null} */
let configPromise = null;

/**
 * Whether Google login is enabled on this host. Enabled by default when a
 * client id + secret are configured; an explicit `hebcal.google.oauth.disabled`
 * flag (1/true/yes/on) is a kill switch so the code can ship to main but be
 * turned off in production without removing the credentials.
 * @param {Object<string,string>} iniConfig
 * @return {boolean}
 */
export function isGoogleLoginConfigured(iniConfig) {
  const disabled = String(iniConfig['hebcal.google.oauth.disabled'] ?? '').trim();
  if (/^(1|true|yes|on)$/i.test(disabled)) {
    return false;
  }
  return Boolean(
      iniConfig['hebcal.google.oauth.client_id'] &&
      iniConfig['hebcal.google.oauth.client_secret'],
  );
}

/**
 * @param {import('koa').Context} ctx
 * @return {string}
 */
export function googleRedirectUri(ctx) {
  // For local development, derive the redirect URI from the request host so
  // that http://localhost:8080 and http://127.0.0.1:8080 each redirect back to
  // themselves (Google treats them as distinct URIs; both must be registered as
  // Authorized redirect URIs on the OAuth client). We only do this for loopback
  // hosts, so a spoofed Host header on a real deployment cannot influence it --
  // and production sets hebcal.google.oauth.redirect_uri explicitly anyway.
  const host = ctx.host || '';
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return `${ctx.protocol}://${host}/login/google/callback`;
  }
  return ctx.iniConfig['hebcal.google.oauth.redirect_uri'] ||
    'https://www.hebcal.com/login/google/callback';
}

/**
 * Lazily discover Google's OIDC endpoints and build a client Configuration.
 * Cached across requests; on a discovery failure the cache is cleared so a
 * later request can retry.
 * @param {import('koa').Context} ctx
 * @return {Promise<oidc.Configuration>}
 */
function getConfig(ctx) {
  if (configPromise === null) {
    const clientId = ctx.iniConfig['hebcal.google.oauth.client_id'];
    const clientSecret = ctx.iniConfig['hebcal.google.oauth.client_secret'];
    configPromise = oidc.discovery(ISSUER, clientId, clientSecret)
        .catch((err) => {
          configPromise = null; // allow retry on the next request
          throw err;
        });
  }
  return configPromise;
}

/**
 * Begin a login: generate PKCE/state/nonce, and return the Google
 * authorization URL to redirect the browser to along with the transaction
 * secrets the caller must stash (in a short-lived signed cookie) for the
 * callback.
 * @param {import('koa').Context} ctx
 * @return {Promise<{url: string, txn: {code_verifier: string, state: string, nonce: string, redirect_uri: string}}>}
 */
export async function beginGoogleLogin(ctx) {
  const config = await getConfig(ctx);
  const code_verifier = oidc.randomPKCECodeVerifier();
  const code_challenge = await oidc.calculatePKCECodeChallenge(code_verifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  // Compute once and carry it in the transaction: the token exchange in the
  // callback must use the exact same redirect_uri that was sent here.
  const redirect_uri = googleRedirectUri(ctx);
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri,
    scope: SCOPE,
    code_challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return {url: url.href, txn: {code_verifier, state, nonce, redirect_uri}};
}

/**
 * Complete a login: exchange the authorization code for tokens and return the
 * verified OpenID claims. Throws if state/nonce/PKCE validation fails.
 * @param {import('koa').Context} ctx
 * @param {URL} currentUrl the full callback URL including the query string
 * @param {{code_verifier: string, state: string, nonce: string}} txn
 * @return {Promise<{sub: string, email: string, emailVerified: boolean, name: string|undefined}>}
 */
export async function completeGoogleLogin(ctx, currentUrl, txn) {
  const config = await getConfig(ctx);
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: txn.code_verifier,
    expectedState: txn.state,
    expectedNonce: txn.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string') {
    throw new Error('Google did not return an OpenID subject');
  }
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === 'string' ? claims.name : undefined,
  };
}
