import {describe, it, expect, vi, afterEach} from 'vitest';
import http from 'node:http';
import {matomoTrack} from '../src/matomoTrack.js';

/**
 * Builds a fake outbound request object that records the event handlers
 * registered on it, so tests can inspect them and simulate a response.
 */
function makeFakeReq() {
  const handlers = {};
  return {
    on(event, cb) {
      handlers[event] = cb;
      return this;
    },
    setTimeout: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    handlers,
  };
}

/**
 * Builds a minimal Koa-like ctx sufficient for matomoTrack().
 */
function makeCtx(overrides = {}) {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'accept-language': 'en-US',
    ...overrides.headers,
  };
  return {
    get(name) {
      return headers[name.toLowerCase()] || '';
    },
    request: {
      href: overrides.href ?? 'https://www.hebcal.com/converter?date=2025-12-24',
      hostname: overrides.hostname ?? 'www.hebcal.com',
      ip: '203.0.113.7',
      query: overrides.query ?? {},
    },
    state: {
      startTime: Date.now() - 42,
      userId: overrides.userId,
    },
    logger: {info: vi.fn(), error: vi.fn()},
  };
}

/**
 * Parses the querystring out of the request options.path.
 */
function parseArgs(options) {
  const qs = options.path.split('?')[1] || '';
  return new URLSearchParams(qs);
}

describe('matomoTrack', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips robot user-agents when includeRobots is false', () => {
    const spy = vi.spyOn(http, 'request').mockImplementation(makeFakeReq);
    const ctx = makeCtx({headers: {'user-agent': 'curl/8.0.1'}});
    matomoTrack(ctx, 'Event', 'click');
    expect(spy).not.toHaveBeenCalled();
  });

  it('tracks robot user-agents when includeRobots is true', () => {
    const spy = vi.spyOn(http, 'request').mockImplementation(makeFakeReq);
    const ctx = makeCtx({headers: {'user-agent': 'Claude-User/1.0'}});
    matomoTrack(ctx, null, null, 'AI Chatbot', true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('builds a POST to www.hebcal.com /ma/matomo.php with event params', () => {
    const spy = vi.spyOn(http, 'request').mockImplementation(makeFakeReq);
    const ctx = makeCtx();
    matomoTrack(ctx, 'Category', 'Action', 'Name');

    const options = spy.mock.calls[0][0];
    expect(options.method).toBe('POST');
    expect(options.hostname).toBe('www.hebcal.com');
    expect(options.path.startsWith('/ma/matomo.php?')).toBe(true);

    const args = parseArgs(options);
    expect(args.get('rec')).toBe('1');
    expect(args.get('apiv')).toBe('1');
    expect(args.get('idsite')).toBe('1');
    expect(args.get('e_c')).toBe('Category');
    expect(args.get('e_a')).toBe('Action');
    expect(args.get('e_n')).toBe('Name');
  });

  it('uses idsite=3 for download.hebcal.com', () => {
    const spy = vi.spyOn(http, 'request').mockImplementation(makeFakeReq);
    const ctx = makeCtx({hostname: 'download.hebcal.com'});
    matomoTrack(ctx, 'Category', 'Action');
    const args = parseArgs(spy.mock.calls[0][0]);
    expect(args.get('idsite')).toBe('3');
  });

  it('sets action_name and pf_srv when no category/action (chatbot pageview)', () => {
    const spy = vi.spyOn(http, 'request').mockImplementation(makeFakeReq);
    const ctx = makeCtx();
    matomoTrack(ctx, null, null, 'AI Chatbot', true);
    const args = parseArgs(spy.mock.calls[0][0]);
    expect(args.get('action_name')).toBe('AI Chatbot');
    expect(args.has('pf_srv')).toBe(true);
    expect(args.has('e_c')).toBe(false);
  });

  it('drains the response so the keep-alive socket is released', () => {
    const fakeReq = makeFakeReq();
    vi.spyOn(http, 'request').mockReturnValue(fakeReq);
    const ctx = makeCtx();
    matomoTrack(ctx, 'Category', 'Action');

    // A 'response' handler must be registered...
    expect(typeof fakeReq.handlers.response).toBe('function');

    // ...and invoking it must drain the response body via resume().
    const res = {resume: vi.fn()};
    fakeReq.handlers.response(res);
    expect(res.resume).toHaveBeenCalledTimes(1);
  });
});
