import request from 'supertest';
import {expect} from 'vitest';

/**
 * Resolves the caller's argument to something supertest can drive directly.
 * A shared, already-listening http.Server is used as-is; a Koa app falls back
 * to per-request `app.callback()` (legacy behavior).
 * @param {object} appOrServer Koa app or http.Server
 * @return {object}
 */
function handle(appOrServer) {
  return typeof appOrServer?.callback === 'function' ?
    appOrServer.callback() :
    appOrServer;
}

/**
 * Exercises conditional-request (ETag / If-None-Match) handling for a GET
 * request, asserting all three caller scenarios:
 *   - absent If-None-Match    -> 200 with an ETag response header
 *   - matching If-None-Match  -> 304 Not Modified with an empty body
 *   - mismatched If-None-Match -> 200 (the resource is regenerated)
 * @param {object} appOrServer shared http.Server (or Koa app) under test
 * @param {string} url request path (with query string)
 * @return {Promise<string>} the ETag returned by the first response
 */
export async function expectConditionalEtag(appOrServer, url) {
  // Absent If-None-Match: a normal request returns 200 and advertises an ETag.
  const fresh = await request(handle(appOrServer)).get(url);
  expect(fresh.status, `GET ${url} (no If-None-Match)`).toBe(200);
  const etag = fresh.headers['etag'];
  expect(etag, `ETag header for ${url}`).toBeDefined();

  // Matching If-None-Match: the client's cached copy is still fresh -> 304.
  const matched = await request(handle(appOrServer))
      .get(url)
      .set('If-None-Match', etag);
  expect(matched.status, `GET ${url} (matching If-None-Match)`).toBe(304);
  expect(matched.text, `304 body for ${url}`).toBeFalsy();

  // Mismatched If-None-Match: the cached copy is stale -> full 200 response.
  const mismatched = await request(handle(appOrServer))
      .get(url)
      .set('If-None-Match', '"not-the-right-etag"');
  expect(mismatched.status, `GET ${url} (mismatched If-None-Match)`).toBe(200);

  return etag;
}
