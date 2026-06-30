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

test('returns null for a 204 not-found response', async () => {
  const client = makeGeoipClient({socketPath});
  expect(await client.lookup('0.0.0.0')).toBe(null);
});

test('returns null for a non-200 response', async () => {
  const client = makeGeoipClient({socketPath});
  expect(await client.lookup('not-an-ip')).toBe(null);
});

test('returns null for empty input without contacting the service', async () => {
  const client = makeGeoipClient({socketPath});
  expect(await client.lookup('')).toBe(null);
});

test('falls back to null when the service is down (no socket)', async () => {
  const client = makeGeoipClient({socketPath: path.join(sockDir, 'does-not-exist.sock')});
  expect(await client.lookup('8.8.8.8')).toBe(null);
});

test('reuses keep-alive connections across lookups', async () => {
  const client = makeGeoipClient({socketPath});
  for (let i = 0; i < 5; i++) {
    expect(await client.lookup('8.8.8.8')).toBeTruthy();
  }
});
