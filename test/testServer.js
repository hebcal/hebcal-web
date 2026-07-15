import http from 'node:http';
import {beforeAll, afterAll} from 'vitest';

/**
 * Creates one long-lived, already-listening HTTP server for a Koa app and
 * shares it across a whole test file.
 *
 * The server is bound in a beforeAll hook *before* any test runs. This matters:
 * if you hand supertest a non-listening server (or `app.callback()`), it calls
 * `listen(0)` and then `close()` around every single request — spinning up a
 * fresh ephemeral server per request. Under a full parallel suite that churns
 * hundreds of ephemeral servers/ports and intermittently misroutes a request to
 * the wrong (closing) server, yielding spurious 4xx/5xx. Passing an
 * already-listening server makes supertest reuse its address and never close
 * it, so every request hits one stable port.
 * @param {import('koa')} app Koa app under test
 * @return {import('http').Server}
 */
export function makeServer(app) {
  const server = http.createServer(app.callback());
  beforeAll(() => new Promise((resolve) => server.listen(0, resolve)));
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  return server;
}
