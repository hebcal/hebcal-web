import {readFileSync} from 'node:fs';
import {createPrivateKey, sign as cryptoSign, randomUUID} from 'node:crypto';
import * as oidc from 'openid-client';

/**
 * "Sign in with Apple" using OpenID Connect (Authorization Code flow). The
 * shape mirrors oauthGoogle.js -- every call into `openid-client` lives here so
 * the route handlers in login.js stay small -- but Apple differs from Google in
 * three ways that drive the code below:
 *
 *  1. **There is no static client secret.** Apple issues a `.p8` ES256 private
 *     key and expects a short-lived JWT, signed with it, in place of the
 *     client_secret on every token request. {@link makeClientSecret} mints one;
 *     `appleClientAuth` posts it. No `jose` dependency is needed -- node's
 *     crypto signs ES256 directly given `dsaEncoding: 'ieee-p1363'`, which is
 *     the (r||s) form JWS requires rather than OpenSSL's default DER.
 *  2. **The callback is a cross-site POST, not a redirect with a query
 *     string.** Apple mandates `response_mode=form_post` whenever any scope is
 *     requested, and we need the `email` scope. login.js therefore accepts POST
 *     on /login/apple/callback and hands the body here as a synthesized URL.
 *  3. **The user's name is not in the ID token.** It arrives once, in the
 *     `user` form field of that first POST, and never again.
 *
 * Configuration comes from the INI (`hebcal.apple.oauth.*`). The OpenID
 * discovery document is fetched from Apple once and cached for the life of the
 * process.
 */

const ISSUER = new URL('https://appleid.apple.com');

// Apple requires form_post once any scope is requested, and `email` is the
// whole point here -- it is what lets an Apple login merge with an existing
// account and with the email subscriptions keyed by address.
const SCOPE = 'name email';

// Apple caps the client-secret JWT's lifetime at 6 months. Nothing needs it to
// live that long: it is minted per token request, so a short window limits the
// damage if one ever leaked out of a log.
const CLIENT_SECRET_TTL_SEC = 5 * 60;

/** @type {Promise<oidc.Configuration>|null} */
let configPromise = null;

/**
 * Whether Apple login is enabled on this host. Enabled by default once the
 * Service ID, Team ID, Key ID and signing key are all configured; an explicit
 * `hebcal.apple.oauth.disabled` flag (1/true/yes/on) is a kill switch so the
 * code can ship to main but be turned off in production without removing the
 * credentials.
 * @param {Object<string,string>} iniConfig
 * @return {boolean}
 */
export function isAppleLoginConfigured(iniConfig) {
  const disabled = String(iniConfig['hebcal.apple.oauth.disabled'] ?? '').trim();
  if (/^(1|true|yes|on)$/i.test(disabled)) {
    return false;
  }
  return Boolean(
      iniConfig['hebcal.apple.oauth.client_id'] &&
      iniConfig['hebcal.apple.oauth.team_id'] &&
      iniConfig['hebcal.apple.oauth.key_id'] &&
      (iniConfig['hebcal.apple.oauth.private_key'] ||
       iniConfig['hebcal.apple.oauth.private_key_file']),
  );
}

/**
 * Apple only accepts an https Return URL and refuses loopback addresses
 * outright, so -- unlike googleRedirectUri() -- there is no dev-host special
 * case to make: the full round trip cannot be exercised from localhost at all.
 * @param {import('koa').Context} ctx
 * @return {string}
 */
export function appleRedirectUri(ctx) {
  return ctx.iniConfig['hebcal.apple.oauth.redirect_uri'] ||
    'https://www.hebcal.com/login/apple/callback';
}

/** @type {{path: string, pem: string}|null} */
let cachedKeyFile = null;

/**
 * The PEM for the `.p8` signing key, from `private_key_file` (preferred -- an
 * INI value cannot hold real newlines) or from an inline `private_key` whose
 * escaped `\n` sequences are expanded. Cached per path, since this is read on
 * every token request.
 * @param {Object<string,string>} iniConfig
 * @return {string}
 */
function privateKeyPem(iniConfig) {
  const inline = iniConfig['hebcal.apple.oauth.private_key'];
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }
  const path = iniConfig['hebcal.apple.oauth.private_key_file'];
  if (!path) {
    throw new Error('Apple login: no private_key or private_key_file configured');
  }
  if (cachedKeyFile?.path !== path) {
    cachedKeyFile = {path, pem: readFileSync(path, 'utf-8')};
  }
  return cachedKeyFile.pem;
}

/**
 * @param {Object} obj
 * @return {string}
 */
function b64u(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/**
 * Mint the short-lived ES256 JWT that Apple's token endpoint accepts in place
 * of a client_secret.
 *
 * `iss` is the Team ID, `sub` the Service ID (our client_id), `aud` always
 * Apple's issuer -- that last one is what stops a secret captured by some other
 * relying party from being replayed at Apple.
 * @param {Object<string,string>} iniConfig
 * @return {string}
 */
export function makeClientSecret(iniConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'ES256', kid: iniConfig['hebcal.apple.oauth.key_id'], typ: 'JWT'};
  const payload = {
    iss: iniConfig['hebcal.apple.oauth.team_id'],
    iat: now,
    exp: now + CLIENT_SECRET_TTL_SEC,
    aud: ISSUER.origin,
    sub: iniConfig['hebcal.apple.oauth.client_id'],
    jti: randomUUID(),
  };
  const signingInput = `${b64u(header)}.${b64u(payload)}`;
  const key = createPrivateKey(privateKeyPem(iniConfig));
  // JWS ES256 wants the raw (r||s) pair; node's default for EC is DER.
  const sig = cryptoSign('sha256', Buffer.from(signingInput),
      {key, dsaEncoding: 'ieee-p1363'});
  return `${signingInput}.${sig.toString('base64url')}`;
}

/**
 * Lazily discover Apple's OIDC endpoints and build a client Configuration.
 * Cached across requests; on a discovery failure the cache is cleared so a
 * later request can retry.
 *
 * The client authentication is a custom function rather than
 * `oidc.ClientSecretPost('...')` because Apple's "secret" expires: it has to be
 * re-minted for each token request, not frozen into the cached Configuration.
 * @param {import('koa').Context} ctx
 * @return {Promise<oidc.Configuration>}
 */
function getConfig(ctx) {
  if (configPromise === null) {
    const iniConfig = ctx.iniConfig;
    const clientId = iniConfig['hebcal.apple.oauth.client_id'];
    const clientAuth = (_as, client, body) => {
      body.set('client_id', client.client_id);
      body.set('client_secret', makeClientSecret(iniConfig));
    };
    configPromise = oidc.discovery(ISSUER, clientId, {}, clientAuth)
        .catch((err) => {
          configPromise = null; // allow retry on the next request
          throw err;
        });
  }
  return configPromise;
}

/**
 * Begin a login: generate state/nonce and return the Apple authorization URL to
 * redirect the browser to, along with the transaction secrets the caller must
 * stash (in a short-lived signed cookie) for the callback.
 *
 * No PKCE, unlike Google: Apple does not document support for it on the web
 * flow, and this is a confidential client whose token request is already
 * authenticated by the signed client secret. `state` (bound to the browser by
 * the transaction cookie) carries the CSRF guarantee, `nonce` binds the ID
 * token to this request.
 * @param {import('koa').Context} ctx
 * @return {Promise<{url: string, txn: {state: string, nonce: string, redirect_uri: string}}>}
 */
export async function beginAppleLogin(ctx) {
  const config = await getConfig(ctx);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  // Compute once and carry it in the transaction: the token exchange in the
  // callback must use the exact same redirect_uri that was sent here.
  const redirect_uri = appleRedirectUri(ctx);
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri,
    scope: SCOPE,
    response_mode: 'form_post',
    state,
    nonce,
  });
  return {url: url.href, txn: {state, nonce, redirect_uri}};
}

/**
 * Apple sends booleans in the ID token as either real booleans or the strings
 * "true"/"false", depending on the endpoint and the vintage. Normalize.
 * @param {unknown} v
 * @return {boolean}
 */
function appleBool(v) {
  return v === true || v === 'true';
}

/**
 * The display name, available only in the `user` field of the very first
 * callback POST after the user authorizes the app. Apple never sends it again,
 * so a missing value here is normal for every later sign-in.
 * @param {string|undefined} userField raw JSON from the form post
 * @return {string|undefined}
 */
export function parseAppleUserField(userField) {
  if (typeof userField !== 'string' || userField === '') {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(userField);
  } catch {
    return undefined;
  }
  const name = parsed?.name;
  if (!name) {
    return undefined;
  }
  const full = [name.firstName, name.lastName]
      .filter((s) => typeof s === 'string' && s !== '')
      .join(' ');
  return full === '' ? undefined : full;
}

/**
 * Complete a login: exchange the authorization code for tokens and return the
 * verified OpenID claims. Throws if state/nonce validation fails.
 * @param {import('koa').Context} ctx
 * @param {URL} currentUrl callback URL carrying the authorization response
 *   parameters in its query string (login.js synthesizes this from the POST
 *   body, since Apple form-posts them)
 * @param {{state: string, nonce: string}} txn
 * @return {Promise<{sub: string, email: string, emailVerified: boolean, isPrivateEmail: boolean, name: string|undefined}>}
 */
export async function completeAppleLogin(ctx, currentUrl, txn) {
  const config = await getConfig(ctx);
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    expectedState: txn.state,
    expectedNonce: txn.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string') {
    throw new Error('Apple did not return an OpenID subject');
  }
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    emailVerified: appleBool(claims.email_verified),
    // True when the address is an @privaterelay.appleid.com alias, i.e. the
    // user chose "Hide My Email". It is still a real, deliverable address --
    // but only from a sender Apple has registered, which is why it is worth
    // knowing about rather than silently treating like any other.
    isPrivateEmail: appleBool(claims.is_private_email),
    name: typeof claims.name === 'string' ? claims.name : undefined,
  };
}
