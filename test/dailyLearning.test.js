/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';
import {learningPageSlug} from '../src/dailyLearning.js';
import {dailyLearningConfig} from '../src/urlArgs.js';
import {pkg} from '../src/pkg.js';

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

describe('Daily Learning sitemap calendar pages', () => {
  it('lists dated pages from 2 weeks before this Sunday through 78 weeks after it', async () => {
    const response = await request(server).get('/learning/sitemap.txt');
    const dates = response.text.trim().split('\n')
        .map((line) => line.match(/\/learning\/(\d{4}-\d{2}-\d{2})$/)?.[1])
        .filter(Boolean);
    const sundayOffset = -new Date().getDay();
    const fmt = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + sundayOffset + offset);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    };
    expect(dates.length).toBe(14 + (78 * 7) + 1);
    expect(dates[0]).toBe(fmt(-2 * 7));
    expect(dates.at(-1)).toBe(fmt(78 * 7));
  });

  it('lists every calendar page before the dated pages', async () => {
    const response = await request(server).get('/learning/sitemap.txt');
    const lines = response.text.trim().split('\n');
    const slugs = dailyLearningConfig.filter((cfg) => cfg.dailyLearningOptName).map(learningPageSlug);
    expect(lines.slice(0, slugs.length)).toEqual(slugs.map((slug) => `https://www.hebcal.com/learning/${slug}`));
    expect(lines[slugs.length]).toMatch(/\/learning\/\d{4}-\d{2}-\d{2}$/);
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
    {why: 'the Tanya Yomi daily portion',
      url: '/learning/2026-03-01', text: 'Tanya Yomi'},
    {why: 'the Chasidut group heading',
      url: '/learning/2026-03-01', text: 'Chasidut'},
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
  // dailyLearning.ejs wraps the parenthetical in <small>
  const DIRSHU = 'Amud HaYomi <small>(Dirshu)</small>';
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

describe('Daily Learning calendar pages', () => {
  const configs = dailyLearningConfig.filter((cfg) => cfg.dailyLearningOptName);

  it('has one page per DailyLearning schedule', () => {
    const slugs = configs.map(learningPageSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('daf-yomi');
    expect(slugs).toContain('yerushalmi-vilna');
    expect(slugs).toContain('shemirat-halashon');
    expect(slugs).not.toContain('torah-readings-diaspora');
  });

  it.each(configs.map((cfg) => [learningPageSlug(cfg), cfg]))('renders /learning/%s', async (slug, cfg) => {
    const response = await request(server).get(`/learning/${slug}`);
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    const html = response.text;
    expect(html).toContain('<h2>' + cfg.shortName.replaceAll('\'', '&#39;') + '</h2>');
    const desc = cfg.descLong || cfg.descMedium;
    if (desc) {
      const escaped = desc.replaceAll('&', '&amp;').replaceAll('\'', '&#39;').replaceAll('"', '&#34;');
      expect(html).toContain(`<p>${escaped}</p>`);
    } else {
      expect(html).not.toMatch(/<\/button>\n<p>/);
    }
    expect(html).toContain(`<div id="calendar" data-schedule="${cfg.dailyLearningOptName}"`);
    expect(html).toContain('id="hcdl-modal"');
    expect(html).toContain('<script defer nonce="');
    expect(html).toContain(`src="/i/${pkg.config.dailyLearningApp}"></script>`);
    if (cfg.downloadSlug) {
      expect(html).toContain(`/ical/${cfg.downloadSlug}.ics`);
    }
  });

  it('links each schedule on the date page to its calendar page', async () => {
    const response = await request(server).get('/learning/2025-01-15');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<a class="text-body learning-hdr" href="/learning/daf-yomi">Daf Yomi <small>(Babylonian Talmud)</small>');
    expect(response.text).not.toContain('/hebcal?v=1&amp;F=on');
    expect(response.text).not.toContain('#bi-calendar3');
  });

  it('carries i=on through to the calendar page links', async () => {
    const response = await request(server).get('/learning/2025-01-15?i=on');
    expect(response.text).toContain('<a class="text-body learning-hdr" href="/learning/daf-yomi?i=on">');
  });
});

describe('Daily Learning bundle', () => {
  it('redirects a stale /i/dl-*.js to the current version', async () => {
    const response = await request(server).get('/i/dl-0.9.min.js');
    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).pathname).toBe(`/i/${pkg.config.dailyLearningApp}`);
  });
});
