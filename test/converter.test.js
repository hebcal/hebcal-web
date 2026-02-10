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

  it('should handle GET /converter with XML config', async () => {
    const response = await request(app.callback())
        .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
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
});
