import {describe, it, expect} from 'vitest';
import {googleRedirectUri, isGoogleLoginConfigured} from '../src/oauthGoogle.js';

function fakeCtx({host, protocol = 'http', iniConfig = {}}) {
  return {host, protocol, iniConfig};
}

describe('googleRedirectUri', () => {
  it('derives from a localhost request host', () => {
    const ctx = fakeCtx({host: 'localhost:8080'});
    expect(googleRedirectUri(ctx)).toBe('http://localhost:8080/login/google/callback');
  });

  it('derives from a 127.0.0.1 request host', () => {
    const ctx = fakeCtx({host: '127.0.0.1:8080'});
    expect(googleRedirectUri(ctx)).toBe('http://127.0.0.1:8080/login/google/callback');
  });

  it('derives from ::1 (IPv6 loopback)', () => {
    const ctx = fakeCtx({host: '[::1]:8080'});
    expect(googleRedirectUri(ctx)).toBe('http://[::1]:8080/login/google/callback');
  });

  it('uses the configured redirect_uri for a real host', () => {
    const ctx = fakeCtx({
      host: 'www.hebcal.com',
      protocol: 'https',
      iniConfig: {'hebcal.google.oauth.redirect_uri': 'https://www.hebcal.com/login/google/callback'},
    });
    expect(googleRedirectUri(ctx)).toBe('https://www.hebcal.com/login/google/callback');
  });

  it('does NOT let a real host use a configured value when the request is loopback', () => {
    // A local dev machine whose ini carries the production redirect_uri should
    // still redirect back to localhost, not to production.
    const ctx = fakeCtx({
      host: 'localhost:8080',
      iniConfig: {'hebcal.google.oauth.redirect_uri': 'https://www.hebcal.com/login/google/callback'},
    });
    expect(googleRedirectUri(ctx)).toBe('http://localhost:8080/login/google/callback');
  });

  it('falls back to the production default for a real host with no config', () => {
    const ctx = fakeCtx({host: 'example.com', protocol: 'https'});
    expect(googleRedirectUri(ctx)).toBe('https://www.hebcal.com/login/google/callback');
  });
});

describe('isGoogleLoginConfigured', () => {
  const creds = {
    'hebcal.google.oauth.client_id': 'id',
    'hebcal.google.oauth.client_secret': 'secret',
  };

  it('is enabled by default when credentials are present', () => {
    expect(isGoogleLoginConfigured({...creds})).toBe(true);
  });

  it('is disabled when credentials are missing', () => {
    expect(isGoogleLoginConfigured({})).toBe(false);
  });

  it('is disabled by the kill switch even with credentials', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
      expect(isGoogleLoginConfigured({...creds, 'hebcal.google.oauth.disabled': v})).toBe(false);
    }
  });

  it('stays enabled for falsey flag values', () => {
    for (const v of ['0', 'false', 'no', 'off', '']) {
      expect(isGoogleLoginConfigured({...creds, 'hebcal.google.oauth.disabled': v})).toBe(true);
    }
  });
});
