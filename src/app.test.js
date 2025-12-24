import {describe, test, expect} from 'vitest';
import request from 'supertest';
import {app} from './app-www.js';

describe('hebcal-web', () => {
  test('GET /', async () => {
    const response = await request(app.callback()).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Jewish Calendar, Hebrew Date Converter, Holidays');
  });

  test('GET /robots.txt', async () => {
    const response = await request(app.callback()).get('/robots.txt');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/plain');
    expect(response.text).toContain('User-agent: *');
  });

  test('GET /shabbat/browse', async () => {
    const response = await request(app.callback()).get('/shabbat/browse');
    expect(response.status).toBe(301);
    expect(response.headers.location).toMatch(/\/shabbat\/browse\//);
  });

  test('GET /foobar', async () => {
    const response = await request(app.callback()).get('/foobar');
    expect(response.status).toBe(404);
  });

  test('GET /dist', async () => {
    const response = await request(app.callback()).get('/dist');
    expect(response.status).toBe(410);
  });

  test('GET /converter', async () => {
    const response = await request(app.callback()).get('/converter?gd=24&gm=12&gy=2025&g2h=1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Hebrew Date Converter');
  });

  test('GET /shabbat', async () => {
    const response = await request(app.callback()).get('/shabbat');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Shabbat Times for New York City');
  });
});
