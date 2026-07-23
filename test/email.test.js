import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

// Install the mysql mock before all tests in this file
beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

// A fresh email address not present in the mock so the modify path falls
// through to writeStagingInfo() where the range checks live.
const NEW_EMAIL = 'range-test@example.com';

// Base of a valid Shabbat-email subscribe POST; individual tests override the
// out-of-range field. cfg=json makes emailForm() surface validation errors as
// a clean JSON 400 instead of an HTML page.
function subscribeForm(overrides) {
  return {
    cfg: 'json',
    v: '1',
    modify: '1',
    em: NEW_EMAIL,
    geo: 'geonameid',
    geonameid: '293397',
    ...overrides,
  };
}

describe('Shabbat email subscription range validation', () => {
  it('rejects candle-lighting minutes greater than 99 (email_sundown_candles)', async () => {
    const response = await request(server)
        .post('/email')
        .type('form')
        .send(subscribeForm({b: '180'}));
    expect(response.status).toBe(400);
  });

  it('rejects negative candle-lighting minutes', async () => {
    const response = await request(server)
        .post('/email')
        .type('form')
        .send(subscribeForm({b: '-5'}));
    expect(response.status).toBe(400);
  });

  it('rejects Havdalah minutes past sundown greater than 99 (email_candles_havdalah)', async () => {
    const response = await request(server)
        .post('/email')
        .type('form')
        .send(subscribeForm({M: 'off', m: '200'}));
    expect(response.status).toBe(400);
  });

  it('rejects Havdalah degrees out of range (email_havdalah_degrees)', async () => {
    const response = await request(server)
        .post('/email')
        .type('form')
        .send(subscribeForm({M: 'on', td: '999'}));
    expect(response.status).toBe(400);
  });

  it('accepts a two-digit candle-lighting value', async () => {
    const response = await request(server)
        .post('/email')
        .type('form')
        .send(subscribeForm({b: '40'}));
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
