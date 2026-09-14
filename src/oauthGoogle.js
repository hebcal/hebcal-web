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
 * @param {Object<string,string>} iniConfig
 * @return {boolean} whether Google login is configured on this host
 */
export function isGoogleLoginConfigured(iniConfig) {
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
 * @return {Promise<{url: string, txn: {code_verifier: string, state: string, nonce: string}}>}
 */
export async function beginGoogleLogin(ctx) {
  const config = await getConfig(ctx);
  const code_verifier = oidc.randomPKCECodeVerifier();
  const code_challenge = await oidc.calculatePKCECodeChallenge(code_verifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: googleRedirectUri(ctx),
    scope: SCOPE,
    code_challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return {url: url.href, txn: {code_verifier, state, nonce}};
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
