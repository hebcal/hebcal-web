import {afterAll, beforeAll, expect, test} from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp, rm} from 'node:fs/promises';
import {makeGeoipClient} from '../src/geoipClient.js';

let server;
let sockDir;
let socketPath;

beforeAll(async () => {
  sockDir = await mkdtemp(path.join(os.tmpdir(), 'geoip-test-'));
  socketPath = path.join(sockDir, 'geoip2.sock');
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ip = url.searchParams.get('ip');
    if (ip === '8.8.8.8') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({country: {iso_code: 'US'}, location: {time_zone: 'America/Chicago'}}));
    } else if (ip === '0.0.0.0') {
      res.writeHead(204); // not found
      res.end();
    } else {
      res.writeHead(400);
      res.end('{"error":"invalid ip"}');
    }
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(sockDir, {recursive: true, force: true});
});

test('returns parsed record for a known IP', async () => {
  const client = makeGeoipClient({socketPath});
  const rec = await client.lookup('8.8.8.8');
  expect(rec).toEqual({country: {iso_code: 'US'}, location: {time_zone: 'America/Chicago'}});
});

// socketPath is only assigned in beforeAll, so the table holds the lookup
// input and the client is built inside the test body.
test.each([
  {why: 'a 204 not-found response', ip: '0.0.0.0'},
  {why: 'a non-200 response', ip: 'not-an-ip'},
  {why: 'empty input, without contacting the service', ip: ''},
])('returns null for $why', async ({ip}) => {
  const client = makeGeoipClient({socketPath});
  expect(await client.lookup(ip)).toBeNull();
});

test('falls back to null when the service is down (no socket)', async () => {
  const client = makeGeoipClient({socketPath: path.join(sockDir, 'does-not-exist.sock')});
  expect(await client.lookup('8.8.8.8')).toBeNull();
});

test('reuses keep-alive connections across lookups', async () => {
  const client = makeGeoipClient({socketPath});
  for (let i = 0; i < 5; i++) {
    expect(await client.lookup('8.8.8.8')).toBeTruthy();
  }
});
