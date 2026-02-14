import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Hebrew Date RSS Feeds', () => {
  it('should return Today\'s Hebrew Date in English', async () => {
    const response = await request(app.callback())
        .get('/etc/hdate-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should return Today\'s Hebrew Date in Hebrew', async () => {
    const response = await request(app.callback())
        .get('/etc/hdate-he.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should return Today\'s Hebrew Date in German', async () => {
    const response = await request(app.callback())
        .get('/etc/hdate-de.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should reject POST on /etc/hdate XML with 405', async () => {
    const response = await request(app.callback())
        .post('/etc/hdate-en.xml');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });
});

describe('Parashat ha-Shavua RSS Feeds', () => {
  it('should return Torah reading RSS in English', async () => {
    const response = await request(app.callback())
        .get('/sedrot/index-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });

  it('should return Torah reading RSS for Israel in English', async () => {
    const response = await request(app.callback())
        .get('/sedrot/israel-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });

  it('should return Torah reading RSS in French', async () => {
    const response = await request(app.callback())
        .get('/sedrot/index-fr.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });
});

describe('Daily Learning RSS Feeds', () => {
  it('should return 200 for /etc/dafyomi RSS feed', async () => {
    const response = await request(app.callback())
        .get('/etc/dafyomi-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
  });

  it('should return 200 for /etc/myomi RSS feed', async () => {
    const response = await request(app.callback())
        .get('/etc/myomi-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
  });
});

describe('Shabbat Times RSS Feeds', () => {
  it('should return Shabbat times RSS with city=', async () => {
    const response = await request(app.callback())
        .get('/shabbat?city=Los+Angeles&m=50&cfg=r');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
    // Should contain candle lighting information
    expect(response.text).toMatch(/Candle lighting|Havdalah/i);
  });

  it('should return Shabbat times RSS with geonameid', async () => {
    const response = await request(app.callback())
        .get('/shabbat?cfg=r&geonameid=293397&M=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });
});
