import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Converter Routes', () => {
  it('should return 200 for GET /converter with Hebrew date', async () => {
    const response = await request(server)
        .get('/converter?h2g=1&hd=10&hm=Av&hy=6872');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  // ?cfg=xml and ?cfg=json are served exclusively by hebcal-api-go now.
  it('should return 501 for GET /converter?cfg=json', async () => {
    const response = await request(server)
        .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(501);
  });

  it('should return 501 for GET /converter?cfg=xml', async () => {
    const response = await request(server)
        .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(501);
  });
});

describe('Converter CSV Route', () => {
  it('should handle /converter/csv with params', async () => {
    const response = await request(server)
        .get('/converter/csv?hd=4&hm=Tevet&hy=5786&h2g=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
  });

  it('should reject POST /converter/csv with 405', async () => {
    const response = await request(server)
        .post('/converter/csv');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });

  // Date-range conversion (start/end, ndays) moved to hebcal-api-go: 501, not 500.
  it('should return 501 (not 500) for /converter/csv with a date range', async () => {
    const response = await request(server)
        .get('/converter/csv?start=2024-01-01&end=2024-01-05');
    expect(response.status).toBe(501);
  });

  it('should return 501 (not 500) for /converter/csv with ndays', async () => {
    const response = await request(server)
        .get('/converter/csv?h2g=1&ndays=2');
    expect(response.status).toBe(501);
  });
});

describe('Duplicate query parameters', () => {
  // Regression: this exact URL threw a 500 because lg arrived as ['hn','h']
  // instead of a scalar. fixup0 now collapses every array-valued param.
  it('should not 500 when a param appears twice with different values', async () => {
    const response = await request(server)
        .get('/converter?g2h=1&g2h=1&gd=25&gm=12&gs=on&gy=2025&lg=hn&lg=h');
    expect(response.status).toBe(200);
  });
});
