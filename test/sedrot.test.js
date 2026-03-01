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

describe('Sedrot Error Handling', () => {
  it('should return 404 for completely unknown parsha name', async () => {
    const response = await request(app.callback())
        .get('/sedrot/zzz-totally-unknown-xyzabc');
    expect(response.status).toBe(404);
  });

  it('should return 400 for non-numeric gy parameter', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit?gy=notanumber');
    expect(response.status).toBe(400);
  });

  it('should return 410 for gy year greater than 2999', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit?gy=3500');
    expect(response.status).toBe(410);
  });

  it('should return 410 for gy year less than 100', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit?gy=50');
    expect(response.status).toBe(410);
  });

  it('should return 410 for date string with year out of range', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-30001010');
    expect(response.status).toBe(410);
  });
});

describe('Sedrot Redirects', () => {
  it('should redirect uppercase parsha name to lowercase', async () => {
    const response = await request(app.callback())
        .get('/sedrot/Bereshit');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit');
    expect(response.headers.location).not.toContain('?');
  });

  it('should redirect uppercase parsha name preserving Israel suffix', async () => {
    const response = await request(app.callback())
        .get('/sedrot/Bereshit?i=on');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit?i=on');
  });

  it('should redirect parsha typo with redir=spelling query param', async () => {
    // "bereshitt" has edit distance 1 from "bereshit" → triggers alias redirect
    const response = await request(app.callback())
        .get('/sedrot/bereshitt');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit?redir=spelling');
  });

  it('should redirect parsha typo with date and redir=spelling', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshitt-20241026');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit-20241026?redir=spelling');
  });

  it('should redirect when date has fewer than 8 digits', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-202512');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit');
    expect(response.headers.location).not.toContain('-202512');
  });

  it('should redirect when date has fewer than 8 digits with Israel mode', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-202512?i=on');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit?i=on');
  });

  it('should redirect when date year is before 1000', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-05001010');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sedrot/bereshit');
    expect(response.headers.location).not.toContain('-0500');
  });

  it('should redirect gy year search with Israel mode preserving i=on suffix', async () => {
    const response = await request(app.callback())
        .get('/sedrot/noach?gy=1980&i=on');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/sedrot\/noach-\d{8}\?i=on/);
  });

  it('should redirect gy search to specific dated parsha URL', async () => {
    const response = await request(app.callback())
        .get('/sedrot/noach?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/sedrot\/noach-\d{8}$/);
  });
});

describe('Sedrot Israel Mode', () => {
  it('should return 200 for parsha in Israel mode without date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for parsha with date in Israel mode', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-20241026?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Bereshit 5785 - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for Vezot Haberakhah in Israel mode', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vezot-haberakhah?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for combined parsha in Israel mode', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vayakhel-pekudei?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Sedrot Special Parshiyot', () => {
  it('should return 200 for Vezot Haberakhah without date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vezot-haberakhah');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Vezot Haberakhah');
  });

  it('should return 200 for Vezot Haberakhah with specific date', async () => {
    // Simchat Torah 5785 in the Diaspora: October 24, 2024
    const response = await request(app.callback())
        .get('/sedrot/vezot-haberakhah-20241024');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Vezot Haberakhah');
  });

  it('should return 200 for combined parsha Vayakhel-Pekudei', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vayakhel-pekudei');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Vayakhel');
  });

  it('should return 200 for Lech-Lecha (hyphenated non-doubled parsha)', async () => {
    const response = await request(app.callback())
        .get('/sedrot/lech-lecha');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Lech-Lecha');
  });

  it('should return 200 for combined parsha Nitzavim-Vayeilech', async () => {
    const response = await request(app.callback())
        .get('/sedrot/nitzavim-vayeilech');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for combined parsha Tazria-Metzora', async () => {
    const response = await request(app.callback())
        .get('/sedrot/tazria-metzora');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Matot-Masei', async () => {
    const response = await request(app.callback())
        .get('/sedrot/matot-masei');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Sedrot with Dates - Content Verification', () => {
  it('should include Hebrew year in title for parsha with date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Bereshit 5785 - Torah Portion - Hebcal<\/title>/);
  });

  it('should include Sefaria links for parsha with date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    expect(response.text).toContain('sefaria.org');
  });

  it('should include Genesis references for Bereshit', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Genesis');
  });

  it('should return 200 for Noach with specific date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/noach-20241102');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Noach 5785 - Torah Portion - Hebcal<\/title>/);
  });

  it('should return 200 for Vayigash with date in Israel mode', async () => {
    const response = await request(app.callback())
        .get('/sedrot/vayigash-20251227?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should include Diaspora label in title when Israel/Diaspora differ', async () => {
    // Vezot Haberakhah always differs between Israel and Diaspora
    const response = await request(app.callback())
        .get('/sedrot/vezot-haberakhah-20241024');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Diaspora');
  });

  it('should include triennial year number for parsha with date', async () => {
    const response = await request(app.callback())
        .get('/sedrot/bereshit-20241026');
    expect(response.status).toBe(200);
    // Triennial section heading appears as "Triennial year N"
    expect(response.text).toMatch(/Triennial.*year [123]/);
  });
});

describe('Sedrot Hebrew Year Pages', () => {
  it('should return 200 for Hebrew year 5785', async () => {
    const response = await request(app.callback())
        .get('/sedrot/5785');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toMatch(/<title>Shabbat Torah Readings 5785 - Hebcal<\/title>/);
  });

  it('should return 200 for older Hebrew year 5780', async () => {
    const response = await request(app.callback())
        .get('/sedrot/5780');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});
