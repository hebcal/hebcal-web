import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Sedrot/Parsha Routes', () => {
  it('should return 200 for /sedrot/', async () => {
    const response = await request(server)
        .get('/sedrot/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Weekly Torah Portion - Parashat haShavua - Hebcal<\/title>/);
  });

  it('should return 200 for specific parsha', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit - Torah Portion - Hebcal<\/title>/);
  });

  it('should handle parsha with date', async () => {
    const response = await request(server)
        .get('/sedrot/vayigash-20251227');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Vayigash 578\d - Torah Portion - Hebcal<\/title>/);
  });

  it('should handle parsha year search', async () => {
    const response = await request(server)
        .get('/sedrot/vayechi?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/vayechi-19800105');
  });
});

describe('Advanced Sedrot Routes', () => {
  it('should return 200 for /sedrot/grid', async () => {
    const response = await request(server)
        .get('/sedrot/grid');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Weekly Torah Readings - Parashat haShavua - Hebcal<\/title>/);
  });

  it('should return 200 for parsha RSS feed', async () => {
    const response = await request(server)
        .get('/sedrot/index.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
  });

  it('should handle parsha CSV file', async () => {
    const response = await request(server)
        .get('/sedrot/fullkriyah-5789.csv');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
  });

  it('should return 200 for parsha year page', async () => {
    const response = await request(server)
        .get('/sedrot/5786');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
  });

  it('should handle parsha year with Israel parameter', async () => {
    const response = await request(server)
        .get('/sedrot/5786?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5786 - Hebcal<\/title>/);
  });
});

describe('Sedrot Error Handling', () => {
  it('should return 404 for completely unknown parsha name', async () => {
    const response = await request(server)
        .get('/sedrot/zzz-totally-unknown-xyzabc');
    expect(response.status).toBe(404);
  });

  it('should return 400 for non-numeric gy parameter', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit?gy=notanumber');
    expect(response.status).toBe(400);
  });

  it.each([
    ['gy year greater than 2999', '/sedrot/bereshit?gy=3500'],
    ['gy year less than 100', '/sedrot/bereshit?gy=50'],
    ['date string with year out of range', '/sedrot/bereshit-30001010'],
  ])('should return 410 for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(410);
  });
});

describe('Sedrot Redirects', () => {
  // "bereshitt" has edit distance 1 from "bereshit" → triggers alias redirect
  it.each([
    {why: 'uppercase parsha name to lowercase',
      url: '/sedrot/Bereshit', to: '/sedrot/bereshit', notTo: '?'},
    {why: 'uppercase parsha name preserving Israel suffix',
      url: '/sedrot/Bereshit?i=on', to: '/sedrot/bereshit?i=on'},
    {why: 'parsha typo with redir=spelling query param',
      url: '/sedrot/bereshitt', to: '/sedrot/bereshit?redir=spelling'},
    {why: 'parsha typo with date and redir=spelling',
      url: '/sedrot/bereshitt-20241026', to: '/sedrot/bereshit-20241026?redir=spelling'},
    {why: 'date with fewer than 8 digits',
      url: '/sedrot/bereshit-202512', to: '/sedrot/bereshit', notTo: '-202512'},
    {why: 'date with fewer than 8 digits with Israel mode',
      url: '/sedrot/bereshit-202512?i=on', to: '/sedrot/bereshit?i=on'},
  ])('should redirect $why', async ({url, to, notTo}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(to);
    if (notTo) {
      expect(response.headers.location).not.toContain(notTo);
    }
  });

  it('should return 410 Gone when date year is before 1000', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit-05001010');
    expect(response.status).toBe(410);
  });

  it('should redirect gy year search with Israel mode preserving i=on suffix', async () => {
    const response = await request(server)
        .get('/sedrot/noach?gy=1980&i=on');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/sedrot\/noach-\d{8}\?i=on/);
  });

  it('should redirect gy search to specific dated parsha URL', async () => {
    const response = await request(server)
        .get('/sedrot/noach?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/sedrot\/noach-\d{8}$/);
  });
});

describe('Sedrot Israel Mode', () => {
  it('should return 200 for parsha in Israel mode without date', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for parsha with date in Israel mode', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit-20241026?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit 5785 - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for Vezot Haberakhah in Israel mode', async () => {
    const response = await request(server)
        .get('/sedrot/vezot-haberakhah?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for combined parsha in Israel mode', async () => {
    const response = await request(server)
        .get('/sedrot/vayakhel-pekudei?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Sedrot Special Parshiyot', () => {
  // Simchat Torah 5785 in the Diaspora: October 24, 2024
  it.each([
    {why: 'Vezot Haberakhah without date',
      url: '/sedrot/vezot-haberakhah', text: 'Vezot Haberakhah'},
    {why: 'Vezot Haberakhah with specific date',
      url: '/sedrot/vezot-haberakhah-20241024', text: 'Vezot Haberakhah'},
    {why: 'combined parsha Vayakhel-Pekudei',
      url: '/sedrot/vayakhel-pekudei', text: 'Vayakhel'},
    {why: 'Lech-Lecha (hyphenated non-doubled parsha)',
      url: '/sedrot/lech-lecha', text: 'Lech-Lecha'},
    {why: 'combined parsha Nitzavim-Vayeilech',
      url: '/sedrot/nitzavim-vayeilech'},
    {why: 'combined parsha Tazria-Metzora',
      url: '/sedrot/tazria-metzora'},
    {why: 'Matot-Masei',
      url: '/sedrot/matot-masei'},
  ])('should return 200 for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    if (text) {
      expect(response.text).toContain(text);
    }
  });
});

describe('Sedrot with Dates - Content Verification', () => {
  // Triennial section heading appears as "Triennial year N"
  it.each([
    ['Hebrew year in the title', /<title>Bereshit 5785 - Torah Portion - Hebcal<\/title>/],
    ['Sefaria links', 'sefaria.org'],
    ['Genesis references', 'Genesis'],
    ['the triennial year number', /Triennial.*year [123]/],
  ])('should include %s for a parsha with a date', async (what, expected) => {
    const response = await request(server)
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(expected);
  });

  it('should return 200 for Noach with specific date', async () => {
    const response = await request(server)
        .get('/sedrot/noach-20241102');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Noach 5785 - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for Vayigash with date in Israel mode', async () => {
    const response = await request(server)
        .get('/sedrot/vayigash-20251227?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should include Diaspora label in title when Israel/Diaspora differ', async () => {
    // Vezot Haberakhah always differs between Israel and Diaspora
    const response = await request(server)
        .get('/sedrot/vezot-haberakhah-20241024');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Diaspora');
  });

});

describe('Sedrot Haftarot of Admonition and Consolation', () => {
  it.each([
    {why: 'Devarim', url: '/sedrot/devarim-20260718',
      text: 'Third Haftarah of Admonition'},
    {why: 'Vaetchanan', url: '/sedrot/vaetchanan-20260725',
      text: 'First Haftarah of Consolation'},
    {why: 'combined Matot-Masei (dated)', url: '/sedrot/matot-masei-20260711',
      text: 'Second Haftarah of Admonition'},
    {why: 'combined Matot-Masei (undated)', url: '/sedrot/matot-masei',
      text: 'Second Haftarah of Admonition'},
  ])('should show "$text" for $why', async ({url, text}) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.text).toContain(text);
  });

  it('should show Seventh Haftarah of Consolation for combined Nitzavim-Vayeilech (dated)', async () => {
    const response = await request(server)
        .get('/sedrot/nitzavim-vayeilech-20260905');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Seventh Haftarah of Consolation');
  });

  it('should show Seventh Haftarah of Consolation for combined Nitzavim-Vayeilech (undated)', async () => {
    const response = await request(server)
        .get('/sedrot/nitzavim-vayeilech');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Seventh Haftarah of Consolation');
  });

  it('should not show a Haftarah theme for a parsha unrelated to Tisha B\'Av', async () => {
    const response = await request(server)
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Haftarah of Admonition');
    expect(response.text).not.toContain('Haftarah of Consolation');
  });

  it('should render "Third and Fifth" for the rare Ki Teitzei consolation 3,5 special case', async () => {
    // In 2029, Parashat Re'eh coincides with Shabbat Rosh Chodesh Elul, displacing
    // the 3rd Haftarah of Consolation onto Ki Teitzei alongside the usual 5th.
    const response = await request(server)
        .get('/sedrot/ki-teitzei-20290825');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Third and Fifth Haftarah of Consolation');
  });
});

describe('Sedrot Hebrew Year Pages', () => {
  it('should return 200 for Hebrew year 5785', async () => {
    const response = await request(server)
        .get('/sedrot/5785');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5785 - Hebcal<\/title>/);
  });

  it('should return 200 for older Hebrew year 5780', async () => {
    const response = await request(server)
        .get('/sedrot/5780');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});
