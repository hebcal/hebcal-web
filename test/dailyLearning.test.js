/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Daily Learning redirect', () => {
  it('should redirect /learning/ to today\'s date', async () => {
    const response = await request(server).get('/learning/');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });

  it('should redirect /learning (no trailing slash) to today\'s date', async () => {
    const response = await request(server).get('/learning');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });
});

describe('Daily Learning sitemap', () => {
  it('should return sitemap with list of URLs', async () => {
    const response = await request(server).get('/learning/sitemap.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
    expect(response.text).toContain('https://www.hebcal.com/learning/');
    expect(response.text).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}/);
  });
});

describe('Daily Learning page', () => {
  it.each([
    {why: 'a specific date (Sunday 2026-03-01)',
      url: '/learning/2026-03-01', text: '2026-03-01'},
    {why: 'the learning categories listed on 2026-03-01',
      url: '/learning/2026-03-01', text: 'Daf Yomi'},
    {why: 'Monday 2026-03-09',
      url: '/learning/2026-03-09', text: 'Weekday Torah reading'},
    {why: 'Saturday 2026-03-07',
      url: '/learning/2026-03-07', text: 'Shabbat Torah reading'},
    {why: 'Israel mode (i=on)',
      url: '/learning/2026-03-01?i=on', text: 'Daf Yomi'},
    // 2026-04-20 is during the Omer (between Pesach and Shavuot in 5786)
    {why: 'a date during the Omer',
      url: '/learning/2026-04-20', text: 'Omer'},
    // Pirkei Avot is read on Shabbat during the Omer; 2026-04-25 is such a Saturday
    {why: 'a Shabbat during the Omer',
      url: '/learning/2026-04-25', text: 'Shabbat Torah reading'},
    // 2026-03-03 is Purim (14 Adar in 5786)
    {why: 'a date that is a holiday',
      url: '/learning/2026-03-03', text: 'Purim'},
  ])('should return 200 HTML containing "$text" for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain(text);
  });

  it('should include prev/next day navigation links', async () => {
    const response = await request(server).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    // Should have links to adjacent days
    expect(response.text).toContain('2026-02-28');
    expect(response.text).toContain('2026-03-02');
  });

  it('should return learning with Hebrew locale (lg=he)', async () => {
    const response = await request(server).get('/learning/2026-03-01?lg=he');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should set Cache-Control header for date pages', async () => {
    const response = await request(server).get('/learning/2026-03-01');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBeDefined();
  });

  // The Amud HaYomi (Dirshu) program started 2023-10-16 (1 Cheshvan 5784)
  const DIRSHU = 'Amud HaYomi (Dirshu)';
  it.each([
    {why: 'a date after program start', url: '/learning/2026-03-01',
      has: [DIRSHU]},
    {why: 'a date after program start, with a Sefaria link', url: '/learning/2026-03-01',
      has: ['sefaria.org', DIRSHU]},
    {why: 'the first day of the program', url: '/learning/2023-10-16',
      has: [DIRSHU, 'Berakhot']},
    {why: 'Israel mode', url: '/learning/2026-03-01?i=on',
      has: [DIRSHU]},
    {why: 'one day before the program started', url: '/learning/2023-10-15',
      has: [], hasNot: [DIRSHU]},
  ])('Amud HaYomi (Dirshu) on $why', async ({url, has, hasNot = []}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    for (const text of has) {
      expect(response.text).toContain(text);
    }
    for (const text of hasNot) {
      expect(response.text).not.toContain(text);
    }
  });

  // 929 runs Sun-Thu only
  it.each([
    {why: 'included on a weekday (Sunday 2026-03-01)', url: '/learning/2026-03-01',
      has: ['929', 'Numbers 14']},
    {why: 'omitted on Shabbat (2026-03-07)', url: '/learning/2026-03-07',
      has: [], hasNot: ['929:']},
    {why: 'omitted on Friday (2026-03-06)', url: '/learning/2026-03-06',
      has: [], hasNot: ['929:']},
  ])('929 is $why', async ({url, has, hasNot = []}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    for (const text of has) {
      expect(response.text).toContain(text);
    }
    for (const text of hasNot) {
      expect(response.text).not.toContain(text);
    }
  });
});
