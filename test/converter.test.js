import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Converter Routes', () => {
  it('should return 200 for GET /converter with valid params', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return 400 for GET /converter with invalid params', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&hy=5785&hm=&hd=24&h2g=1&strict=1');
    expect(response.status).toBe(400);
    expect(response.type).toContain('json');
  });

  it('should return 200 for GET /converter with Hebrew date', async () => {
    const response = await request(app.callback())
        .get('/converter?h2g=1&hd=10&hm=Av&hy=6872');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle POST /converter with JSON config', async () => {
    const response = await request(app.callback())
        .post('/converter?cfg=json&hy=5786&hm=Cheshvan&hd=14&h2g=1&strict=1&gs=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should report a clear error for h2g missing the hm param', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&hd=12&hy=5801&h2g=1');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Hebrew month is required');
  });

  it('should handle GET /converter with XML config', async () => {
    const response = await request(app.callback())
        .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
  });
});

describe('Converter compression', () => {
  it('should compress a large batch date range response', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&start=2025-01-01&end=2025-12-31')
        .set('Accept-Encoding', 'gzip');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeDefined();
    expect(response.headers['vary']).toContain('Accept-Encoding');
  });

  it('should not compress a small single date response', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1')
        .set('Accept-Encoding', 'gzip');
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.headers['vary']).toBeUndefined();
  });
});

describe('Converter CSV Route', () => {
  it('should handle /converter/csv with params', async () => {
    const response = await request(app.callback())
        .get('/converter/csv?hd=4&hm=Tevet&hy=5786&h2g=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
  });

  it('should reject POST /converter/csv with 405', async () => {
    const response = await request(app.callback())
        .post('/converter/csv');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });

  it('should return 400 (not 500) for /converter/csv with a date range', async () => {
    const response = await request(app.callback())
        .get('/converter/csv?start=2024-01-01&end=2024-01-05');
    expect(response.status).toBe(400);
  });

  it('should return 400 (not 500) for /converter/csv with ndays', async () => {
    const response = await request(app.callback())
        .get('/converter/csv?h2g=1&ndays=2');
    expect(response.status).toBe(400);
  });
});

describe('Converter h2g ndays', () => {
  it('should convert a Hebrew date plus ndays into a range', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&h2g=1&ndays=3&hy=5785&hm=Av&hd=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(Object.keys(response.body.hdates).length).toBe(3);
  });

  it('should return 400 for ndays with a non-numeric Hebrew date', async () => {
    const response = await request(app.callback())
        .get('/converter?cfg=json&h2g=1&ndays=3&hy=abc&hm=Av&hd=1');
    expect(response.status).toBe(400);
  });
});
