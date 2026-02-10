import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Sedrot/Parsha Routes', () => {
  it('should return 200 for /sedrot/', async () => {
    const response = await request(app.callback())
        .get('/sedrot/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Weekly Torah Portion - Parashat haShavua - Hebcal<\/title>/);
  });

  it('should return 200 for specific parsha', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit - Torah Portion - Hebcal<\/title>/);
  });

  it('should handle parsha with date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vayigash-20251227');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Vayigash 578\d - Torah Portion - Hebcal<\/title>/);
  });

  it('should handle parsha year search', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vayechi?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/vayechi-19800105');
  });
});

describe('Advanced Sedrot Routes', () => {
  it('should return 200 for /sedrot/grid', async () => {
    const response = await request(app.callback())
        .get('/sedrot/grid');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Weekly Torah Readings - Parashat haShavua - Hebcal<\/title>/);
  });

  it('should return 200 for parsha RSS feed', async () => {
    const response = await request(app.callback())
        .get('/sedrot/index.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
  });

  it('should handle parsha CSV file', async () => {
    const response = await request(app.callback())
        .get('/sedrot/fullkriyah-5789.csv');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
  });

  it('should return 200 for parsha year page', async () => {
    const response = await request(app.callback())
        .get('/sedrot/5786');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
  });

  it('should handle parsha year with Israel parameter', async () => {
    const response = await request(app.callback())
        .get('/sedrot/5786?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
  });
});
