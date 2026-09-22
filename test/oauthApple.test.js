import {describe, it, expect} from 'vitest';
import {createPublicKey, createPrivateKey, generateKeyPairSync, verify} from 'node:crypto';
import {writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  appleRedirectUri,
  isAppleLoginConfigured,
  makeClientSecret,
  parseAppleUserField,
} from '../src/oauthApple.js';

// A throwaway P-256 key: the real AuthKey_*.p8 lives in hebcal-devops and must
// never be committed here, and ES256 does not care whose key it is.
const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
const PEM = privateKey.export({type: 'pkcs8', format: 'pem'});

const creds = {
  'hebcal.apple.oauth.client_id': 'com.hebcal.web',
  'hebcal.apple.oauth.team_id': 'TEAM123456',
  'hebcal.apple.oauth.key_id': 'KEY1234567',
  'hebcal.apple.oauth.private_key': PEM.replace(/\n/g, '\\n'),
};

describe('isAppleLoginConfigured', () => {
  it('is enabled by default when every credential is present', () => {
    expect(isAppleLoginConfigured({...creds})).toBe(true);
  });

  it('is disabled when credentials are missing', () => {
    expect(isAppleLoginConfigured({})).toBe(false);
  });

  it('needs the team id, key id and a signing key, not just a client id', () => {
    for (const missing of [
      'hebcal.apple.oauth.client_id',
      'hebcal.apple.oauth.team_id',
      'hebcal.apple.oauth.key_id',
      'hebcal.apple.oauth.private_key',
    ]) {
      const partial = {...creds};
      delete partial[missing];
      expect(isAppleLoginConfigured(partial)).toBe(false);
    }
  });

  it('accepts private_key_file in place of an inline private_key', () => {
    const partial = {...creds};
    delete partial['hebcal.apple.oauth.private_key'];
    partial['hebcal.apple.oauth.private_key_file'] = '/etc/hebcal-apple-authkey.p8';
    expect(isAppleLoginConfigured(partial)).toBe(true);
  });

  it('is disabled by the kill switch even with credentials', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
      expect(isAppleLoginConfigured({...creds, 'hebcal.apple.oauth.disabled': v})).toBe(false);
    }
  });

  it('stays enabled for falsey flag values', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      expect(isAppleLoginConfigured({...creds, 'hebcal.apple.oauth.disabled': v})).toBe(true);
    }
  });
});

describe('appleRedirectUri', () => {
  it('uses the configured value', () => {
    const ctx = {host: 'www.hebcal.com', iniConfig: {
      'hebcal.apple.oauth.redirect_uri': 'https://www.hebcal.com/login/apple/callback',
    }};
    expect(appleRedirectUri(ctx)).toBe('https://www.hebcal.com/login/apple/callback');
  });

  it('falls back to the production default', () => {
    expect(appleRedirectUri({host: 'example.com', iniConfig: {}}))
        .toBe('https://www.hebcal.com/login/apple/callback');
  });

  it('does NOT derive a loopback URI in dev, unlike Google', () => {
    // Apple refuses non-https and loopback Return URLs outright, so there is
    // nothing useful to derive -- always hand back the registered one.
    expect(appleRedirectUri({host: 'localhost:8080', iniConfig: {}}))
        .toBe('https://www.hebcal.com/login/apple/callback');
  });
});

describe('makeClientSecret', () => {
  function parts(jwt) {
    const [h, p, s] = jwt.split('.');
    return {
      header: JSON.parse(Buffer.from(h, 'base64url').toString()),
      payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
      sig: Buffer.from(s, 'base64url'),
      signingInput: `${h}.${p}`,
    };
  }

  it('produces the ES256 JWT Apple expects in place of a client_secret', () => {
    const {header, payload} = parts(makeClientSecret(creds));
    expect(header).toEqual({alg: 'ES256', kid: 'KEY1234567', typ: 'JWT'});
    expect(payload.iss).toBe('TEAM123456');
    expect(payload.sub).toBe('com.hebcal.web');
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(payload.exp).toBeGreaterThan(payload.iat);
    // Apple caps the lifetime at 6 months; ours is far shorter.
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(6 * 30 * 24 * 60 * 60);
  });

  it('signs with the raw (r||s) form JWS requires, not DER', () => {
    const {sig, signingInput} = parts(makeClientSecret(creds));
    // A DER-wrapped ECDSA signature is variable-length and starts with 0x30;
    // P-1363 is exactly 64 bytes for P-256.
    expect(sig.length).toBe(64);
    const pub = createPublicKey(createPrivateKey(PEM));
    expect(verify('sha256', Buffer.from(signingInput),
        {key: pub, dsaEncoding: 'ieee-p1363'}, sig)).toBe(true);
  });

  it('mints a distinct token each time, so a cached secret cannot go stale', () => {
    expect(makeClientSecret(creds)).not.toBe(makeClientSecret(creds));
  });

  it('reads the key from private_key_file when there is no inline key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apple-key-'));
    const path = join(dir, 'AuthKey_TEST.p8');
    writeFileSync(path, PEM);
    const fileCreds = {...creds};
    delete fileCreds['hebcal.apple.oauth.private_key'];
    fileCreds['hebcal.apple.oauth.private_key_file'] = path;
    const {sig, signingInput} = parts(makeClientSecret(fileCreds));
    const pub = createPublicKey(createPrivateKey(PEM));
    expect(verify('sha256', Buffer.from(signingInput),
        {key: pub, dsaEncoding: 'ieee-p1363'}, sig)).toBe(true);
  });
});

describe('parseAppleUserField', () => {
  it('joins the first and last name Apple sends on the first authorization', () => {
    expect(parseAppleUserField(
        '{"name":{"firstName":"Ada","lastName":"Lovelace"},"email":"a@b.com"}'))
        .toBe('Ada Lovelace');
  });

  it('copes with a partial name', () => {
    expect(parseAppleUserField('{"name":{"firstName":"Ada"}}')).toBe('Ada');
  });

  it('returns undefined for the (normal) case of no user field at all', () => {
    // Apple sends `user` only on the very first sign-in, never again.
    expect(parseAppleUserField(undefined)).toBeUndefined();
    expect(parseAppleUserField('')).toBeUndefined();
  });

  it('returns undefined rather than throwing on garbage', () => {
    expect(parseAppleUserField('not json')).toBeUndefined();
    expect(parseAppleUserField('{"email":"a@b.com"}')).toBeUndefined();
    expect(parseAppleUserField('{"name":{}}')).toBeUndefined();
  });
});
