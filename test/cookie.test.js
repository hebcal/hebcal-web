import {describe, it, expect} from 'vitest';
import {
  doesCookieNeedRefresh,
  setHebcalCookie,
  possiblySetCookie,
} from '../src/cookie.js';

/**
 * Build a minimal mock of a Koa context for the cookie helpers.
 * @param {Object} opts
 * @param {string} [opts.cookie] value returned by ctx.cookies.get('C')
 * @param {Object} [opts.query] value of ctx.request.query
 * @param {number} [opts.status] value of ctx.status
 * @param {string} [opts.userAgent] value returned by ctx.get('user-agent')
 * @return {Object}
 */
function makeCtx({cookie, query = {}, status = 200, userAgent = 'Mozilla/5.0'} = {}) {
  const appended = {};
  return {
    request: {query},
    state: {},
    status,
    cookies: {
      get(name) {
        return name === 'C' ? cookie : undefined;
      },
    },
    append(field, val) {
      (appended[field] = appended[field] || []).push(val);
    },
    get(header) {
      if (header.toLowerCase() === 'user-agent') {
        return userAgent;
      }
      return undefined;
    },
    _appended: appended,
  };
}

/**
 * @param {number} daysFromNow
 * @return {string} YYYY-MM-DD
 */
function isoDatePlusDays(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().substring(0, 10);
}

/**
 * Run setHebcalCookie against a fresh ctx and return the raw cookie value
 * (the part between "C=" and "; path=/...") that it generated.
 * @param {Object} query
 * @return {string}
 */
function generateCookieValue(query) {
  const ctx = makeCtx({});
  setHebcalCookie(ctx, query);
  const header = ctx._appended['Set-Cookie'][0];
  return header.substring('C='.length, header.indexOf('; '));
}

describe('doesCookieNeedRefresh', () => {
  it('returns false when cfg query param is present', () => {
    const ctx = makeCtx({query: {cfg: 'json'}, cookie: undefined});
    expect(doesCookieNeedRefresh(ctx)).toBe(false);
  });

  it('returns true when no cookie is set', () => {
    const ctx = makeCtx({cookie: undefined});
    expect(doesCookieNeedRefresh(ctx)).toBe(true);
  });

  it('returns false when the user has opted out', () => {
    const ctx = makeCtx({cookie: 'opt_out'});
    expect(doesCookieNeedRefresh(ctx)).toBe(false);
  });

  it('returns true when the cookie has no exp field', () => {
    const ctx = makeCtx({cookie: 'uid=abc&c=on'});
    expect(doesCookieNeedRefresh(ctx)).toBe(true);
  });

  it('returns true when the cookie expires within 180 days', () => {
    const cookie = 'uid=abc&c=on&exp=' + isoDatePlusDays(30);
    const ctx = makeCtx({cookie});
    expect(doesCookieNeedRefresh(ctx)).toBe(true);
  });

  it('returns false when the cookie expires more than 180 days out', () => {
    const cookie = 'uid=abc&c=on&exp=' + isoDatePlusDays(365);
    const ctx = makeCtx({cookie});
    expect(doesCookieNeedRefresh(ctx)).toBe(false);
  });
});

describe('setHebcalCookie', () => {
  it('returns false when cfg query param is present', () => {
    const ctx = makeCtx({query: {cfg: 'json'}});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(false);
    expect(ctx._appended['Set-Cookie']).toBeUndefined();
  });

  it('returns false when the user has opted out', () => {
    const ctx = makeCtx({cookie: 'opt_out'});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(false);
    expect(ctx._appended['Set-Cookie']).toBeUndefined();
  });

  it('sets a new cookie and shows the banner for a first-time visitor', () => {
    const ctx = makeCtx({});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(true);
    const header = ctx._appended['Set-Cookie'][0];
    expect(header).toMatch(/^C=uid=/);
    expect(header).toContain('c=on');
    expect(header).toContain('&exp=');
    expect(header).toContain('path=/');
    expect(ctx.state.cookieBanner).toBe(true);
    expect(ctx.state.userId).toBeTruthy();
  });

  it('preserves the existing uid when updating the cookie', () => {
    const uid = '12345678-1234-1234-1234-123456789012';
    const ctx = makeCtx({cookie: 'uid=' + uid + '&c=off&exp=' + isoDatePlusDays(365)});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(true);
    const header = ctx._appended['Set-Cookie'][0];
    expect(header).toContain('uid=' + uid);
    expect(ctx.state.userId).toBe(uid);
    // returning visitor should not see the banner again
    expect(ctx.state.cookieBanner).toBeUndefined();
  });

  it('returns false when the cookie is unchanged and does not need refresh', () => {
    // build a previous cookie identical to what makeCookie would generate,
    // with an expiry well past the 180-day refresh window
    const generated = generateCookieValue({c: 'on'});
    const body = generated.substring(0, generated.indexOf('&exp='));
    const cookie = body + '&exp=' + isoDatePlusDays(365);
    const ctx = makeCtx({cookie});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(false);
    expect(ctx._appended['Set-Cookie']).toBeUndefined();
  });

  it('refreshes an unchanged cookie that is close to expiry', () => {
    const generated = generateCookieValue({c: 'on'});
    const body = generated.substring(0, generated.indexOf('&exp='));
    const cookie = body + '&exp=' + isoDatePlusDays(30);
    const ctx = makeCtx({cookie});
    expect(setHebcalCookie(ctx, {c: 'on'})).toBe(true);
    expect(ctx._appended['Set-Cookie'][0]).toMatch(/^C=uid=/);
  });

  it('writes the cookie when options change', () => {
    const generated = generateCookieValue({c: 'on'});
    const body = generated.substring(0, generated.indexOf('&exp='));
    const cookie = body + '&exp=' + isoDatePlusDays(365);
    const ctx = makeCtx({cookie});
    expect(setHebcalCookie(ctx, {c: 'on', s: 'on'})).toBe(true);
    expect(ctx._appended['Set-Cookie'][0]).toContain('s=on');
  });
});

describe('possiblySetCookie', () => {
  it('returns false for redirect responses', () => {
    const ctx = makeCtx({status: 301});
    expect(possiblySetCookie(ctx, {c: 'on'})).toBe(false);
    expect(ctx._appended['Set-Cookie']).toBeUndefined();
  });

  it('returns false for robot user agents', () => {
    const ctx = makeCtx({userAgent: 'curl/8.0.1'});
    expect(possiblySetCookie(ctx, {c: 'on'})).toBe(false);
    expect(ctx._appended['Set-Cookie']).toBeUndefined();
  });

  it('sets the cookie for a normal browser request', () => {
    const ctx = makeCtx({userAgent: 'Mozilla/5.0 (Macintosh)'});
    expect(possiblySetCookie(ctx, {c: 'on'})).toBe(true);
    expect(ctx._appended['Set-Cookie'][0]).toMatch(/^C=uid=/);
  });
});
