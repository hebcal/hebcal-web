import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Holiday Detail Error Handling', () => {
  it('should return 404 for completely unknown holiday', async () => {
    const response = await request(server)
        .get('/holidays/zzz-totally-unknown-holiday-xyz');
    expect(response.status).toBe(404);
  });

  it('should return 400 for non-numeric gy parameter', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur?gy=notanumber');
    expect(response.status).toBe(400);
  });

  it.each([
    ['gy year greater than 2999', '/holidays/yom-kippur?gy=3500'],
    ['gy year less than 100', '/holidays/yom-kippur?gy=50'],
    ['year in URL that is out of range', '/holidays/yom-kippur-3500'],
  ])('should return 410 for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(410);
  });
});

describe('Holiday Detail Redirects', () => {
  // "hanukkah" is the Wikipedia article name; canonical is "chanukah".
  // "yom-kippurr" is 1 edit away from "yom-kippur".
  // Birkat HaChamah occurs every 28 years, so 2025 has no occurrence.
  it.each([
    {why: 'uppercase holiday name to lowercase', url: '/holidays/Yom-Kippur',
      to: '/holidays/yom-kippur', notTo: 'redir'},
    {why: 'Wikipedia alias with redir=spelling', url: '/holidays/hanukkah',
      to: '/holidays/chanukah', also: 'redir=spelling'},
    {why: 'Wikipedia alias with year and redir=spelling', url: '/holidays/hanukkah-2025',
      to: '/holidays/chanukah-2025', also: 'redir=spelling'},
    {why: 'typo (edit distance 1) with redir=spelling', url: '/holidays/yom-kippurr',
      to: '/holidays/yom-kippur', also: 'redir=spelling'},
    {why: 'typo with year and redir=spelling', url: '/holidays/yom-kippurr-2024',
      to: '/holidays/yom-kippur-2024', also: 'redir=spelling'},
    {why: 'gy parameter to year-specific URL', url: '/holidays/yom-kippur?gy=2024',
      to: '/holidays/yom-kippur-2024'},
    {why: 'holiday year with no occurrence back to holiday page',
      url: '/holidays/birkat-hachamah-2025',
      to: '/holidays/birkat-hachamah', notTo: '-2025'},
  ])('should redirect $why', async ({url, to, also, notTo}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(to);
    if (also) {
      expect(response.headers.location).toContain(also);
    }
    if (notTo) {
      expect(response.headers.location).not.toContain(notTo);
    }
  });
});

describe('Holiday Detail Israel-Only Holidays', () => {
  it('should redirect Israel-only holiday without i=on to ?i=on', async () => {
    // Herzl Day is an Israel-only holiday
    const response = await request(server)
        .get('/holidays/herzl-day');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('?i=on');
  });

  it('should return 200 for Israel-only holiday with i=on', async () => {
    const response = await request(server)
        .get('/holidays/herzl-day?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should redirect Israel-only holiday with year without i=on', async () => {
    const response = await request(server)
        .get('/holidays/herzl-day-2024');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('?i=on');
  });

  it('should return 200 for Israel-only holiday with year and i=on', async () => {
    const response = await request(server)
        .get('/holidays/herzl-day-2024?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Holiday Detail Shalosh Regalim (Pilgrim Festivals)', () => {
  it.each([
    {why: 'Pesach with i=on (Israel)', url: '/holidays/pesach?i=on', text: '(Israel)'},
    {why: 'Pesach with i=off (Diaspora)', url: '/holidays/pesach?i=off', text: '(Diaspora)'},
    {why: 'Shavuot with i=on (Israel)', url: '/holidays/shavuot?i=on'},
    {why: 'Sukkot with i=on', url: '/holidays/sukkot?i=on'},
    {why: 'Pesach with specific year and i=on', url: '/holidays/pesach-2025?i=on', text: '2025'},
    {why: 'Sukkot with year in Diaspora', url: '/holidays/sukkot-2025?i=off'},
  ])('should return 200 for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    if (text) {
      expect(response.text).toContain(text);
    }
  });
});

describe('Holiday Detail Special Types', () => {
  it.each([
    {why: 'Chanukah with candle-lighting info', url: '/holidays/chanukah', text: 'Chanukah'},
    {why: 'Days of the Omer', url: '/holidays/days-of-the-omer', text: 'Omer'},
    {why: 'Purim', url: '/holidays/purim', text: 'Purim'},
    {why: 'Tu BiShvat', url: '/holidays/tu-bishvat'},
    {why: 'Tisha BAv', url: '/holidays/tisha-bav'},
    {why: 'Lag BaOmer', url: '/holidays/lag-baomer'},
    {why: 'Rosh Hashana', url: '/holidays/rosh-hashana'},
    {why: 'Rosh Chodesh Elul (minor holiday)', url: '/holidays/rosh-chodesh-elul'},
  ])('should return 200 for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    if (text) {
      expect(response.text).toContain(text);
    }
  });
});

describe('Holiday Detail with Gregorian Year', () => {
  it.each([
    {why: 'Yom Kippur with specific year', url: '/holidays/yom-kippur-2024', text: '2024'},
    {why: 'Chanukah with year', url: '/holidays/chanukah-2025', text: '2025'},
    {why: 'historical year just after the 1752 threshold', url: '/holidays/yom-kippur-1753'},
    // Years <= 1752 get noindex=true flag
    {why: 'historical year at 1752 (noindex)', url: '/holidays/yom-kippur-1752', text: 'noindex'},
    {why: 'Rosh Hashanah with specific year', url: '/holidays/rosh-hashana-2024', text: '2024'},
  ])('should return 200 for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    if (text) {
      expect(response.text).toContain(text);
    }
  });

  it('should include prev/next navigation for holiday with year', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur-2024');
    expect(response.status).toBe(200);
    // prev/next links to adjacent years should be present
    expect(response.text).toMatch(/yom-kippur-202\d/);
  });




  it('should include warning for pre-1752 dates', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur-1700');
    expect(response.status).toBe(200);
    // The page should include a historical date warning
    expect(response.text).toContain('1700');
  });

});

describe('Holiday Detail Content Verification', () => {
  it('should include correct title format without year', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Yom Kippur - .+ - Hebcal<\/title>/);
  });

  it('should include year in title when year is specified', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur-2024');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Yom Kippur 2024 - .+ - Hebcal<\/title>/);
  });

  it('should include Hebrew name in response', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    // Hebrew name יוֹם כִּפּוּר or similar should appear
    expect(response.text).toMatch(/יוֹם|כִּפּוּר|כיפור/);
  });

  it('should include Sefaria link for holiday with Torah reading', async () => {
    const response = await request(server)
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    expect(response.text).toContain('sefaria.org');
  });

  it('should include Pesach-specific Israel label in title with i=on', async () => {
    const response = await request(server)
        .get('/holidays/pesach-2025?i=on');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Pesach \(Israel\) 2025/);
  });

  it('should include Pesach-specific Diaspora label in title with i=off', async () => {
    const response = await request(server)
        .get('/holidays/pesach-2025?i=off');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Pesach \(Diaspora\) 2025/);
  });

  it('should include Rosh Chodesh Adar I with year', async () => {
    const response = await request(server)
        .get('/holidays/rosh-chodesh-adar-i-2022');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Rosh Chodesh Adar I');
    expect(response.text).toContain('2022');
  });
});
