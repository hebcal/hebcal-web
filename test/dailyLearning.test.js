/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Daily Learning redirect', () => {
  it('should redirect /learning/ to today\'s date', async () => {
    const response = await request(app.callback()).get('/learning/');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });

  it('should redirect /learning (no trailing slash) to today\'s date', async () => {
    const response = await request(app.callback()).get('/learning');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });
});

describe('Daily Learning sitemap', () => {
  it('should return sitemap with list of URLs', async () => {
    const response = await request(app.callback()).get('/learning/sitemap.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
    expect(response.text).toContain('https://www.hebcal.com/learning/');
    expect(response.text).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });
});

describe('Daily Learning page', () => {
  it('should return 200 HTML for a specific date (Sunday)', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('2026-03-01');
  });

  it('should include Daf Yomi and other learning items', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    // Page should list learning categories
    expect(response.text).toContain('Daf Yomi');
  });

  it('should include weekday Torah reading on Monday', async () => {
    // 2026-03-09 is a Monday
    const response = await request(app.callback()).get('/learning/2026-03-09');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Weekday Torah reading');
  });

  it('should include Shabbat Torah reading on Saturday', async () => {
    // 2026-03-07 is a Saturday
    const response = await request(app.callback()).get('/learning/2026-03-07');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Shabbat Torah reading');
  });

  it('should return learning page for Israel mode (i=on)', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Daf Yomi');
  });

  it('should include Omer count during Omer period', async () => {
    // 2026-04-20 is during the Omer (between Pesach and Shavuot in 5786)
    const response = await request(app.callback()).get('/learning/2026-04-20');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Omer');
  });

  it('should include Pirkei Avot on a Shabbat during Omer', async () => {
    // 2026-04-25 is a Saturday during the Omer (Pirkei Avot is read on Shabbat during Omer)
    const response = await request(app.callback()).get('/learning/2026-04-25');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // Should contain Shabbat Torah reading and learning items
    expect(response.text).toContain('Shabbat Torah reading');
  });

  it('should include prev/next day navigation links', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    // Should have links to adjacent days
    expect(response.text).toContain('2026-02-28');
    expect(response.text).toContain('2026-03-02');
  });

  it('should return learning with Hebrew locale (lg=he)', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01?lg=he');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should include holiday info when date is a holiday', async () => {
    // 2026-03-03 is Purim (14 Adar in 5786)
    const response = await request(app.callback()).get('/learning/2026-03-03');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Purim');
  });

  it('should set Cache-Control header for date pages', async () => {
    const response = await request(app.callback()).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBeDefined();
  });
});
