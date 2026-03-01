import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Holiday Detail Error Handling', () => {
  it('should return 404 for completely unknown holiday', async () => {
    const response = await request(app.callback())
        .get('/holidays/zzz-totally-unknown-holiday-xyz');
    expect(response.status).toBe(404);
  });

  it('should return 400 for non-numeric gy parameter', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur?gy=notanumber');
    expect(response.status).toBe(400);
  });

  it('should return 410 for gy year greater than 2999', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur?gy=3500');
    expect(response.status).toBe(410);
  });

  it('should return 410 for gy year less than 100', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur?gy=50');
    expect(response.status).toBe(410);
  });

  it('should return 410 for year in URL that is out of range', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-3500');
    expect(response.status).toBe(410);
  });
});

describe('Holiday Detail Redirects', () => {
  it('should redirect uppercase holiday name to lowercase', async () => {
    const response = await request(app.callback())
        .get('/holidays/Yom-Kippur');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/yom-kippur');
    expect(response.headers.location).not.toContain('redir');
  });

  it('should redirect Wikipedia alias with redir=spelling', async () => {
    // "hanukkah" is the Wikipedia article name; canonical is "chanukah"
    const response = await request(app.callback())
        .get('/holidays/hanukkah');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/chanukah');
    expect(response.headers.location).toContain('redir=spelling');
  });

  it('should redirect Wikipedia alias with year and redir=spelling', async () => {
    const response = await request(app.callback())
        .get('/holidays/hanukkah-2025');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/chanukah-2025');
    expect(response.headers.location).toContain('redir=spelling');
  });

  it('should redirect typo (edit distance 1) with redir=spelling', async () => {
    // "yom-kippurr" is 1 edit away from "yom-kippur"
    const response = await request(app.callback())
        .get('/holidays/yom-kippurr');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/yom-kippur');
    expect(response.headers.location).toContain('redir=spelling');
  });

  it('should redirect typo with year and redir=spelling', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippurr-2024');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/yom-kippur-2024');
    expect(response.headers.location).toContain('redir=spelling');
  });

  it('should redirect gy parameter to year-specific URL', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur?gy=2024');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/yom-kippur-2024');
  });

  it('should redirect holiday year with no occurrence back to holiday page', async () => {
    // Birkat HaChamah occurs every 28 years; 2025 is not a match year
    const response = await request(app.callback())
        .get('/holidays/birkat-hachamah-2025');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/birkat-hachamah');
    expect(response.headers.location).not.toContain('-2025');
  });
});

describe('Holiday Detail Israel-Only Holidays', () => {
  it('should redirect Israel-only holiday without i=on to ?i=on', async () => {
    // Herzl Day is an Israel-only holiday
    const response = await request(app.callback())
        .get('/holidays/herzl-day');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('?i=on');
  });

  it('should return 200 for Israel-only holiday with i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/herzl-day?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should redirect Israel-only holiday with year without i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/herzl-day-2024');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('?i=on');
  });

  it('should return 200 for Israel-only holiday with year and i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/herzl-day-2024?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Holiday Detail Shalosh Regalim (Pilgrim Festivals)', () => {
  it('should return 200 for Pesach with i=on (Israel)', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('(Israel)');
  });

  it('should return 200 for Pesach with i=off (Diaspora)', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach?i=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('(Diaspora)');
  });

  it('should return 200 for Shavuot with i=on (Israel)', async () => {
    const response = await request(app.callback())
        .get('/holidays/shavuot?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Sukkot with i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/sukkot?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Pesach with specific year and i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach-2025?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('2025');
  });

  it('should return 200 for Sukkot with year in Diaspora', async () => {
    const response = await request(app.callback())
        .get('/holidays/sukkot-2025?i=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Holiday Detail Special Types', () => {
  it('should return 200 for Chanukah with candle-lighting info', async () => {
    const response = await request(app.callback())
        .get('/holidays/chanukah');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Chanukah');
  });

  it('should return 200 for Days of the Omer', async () => {
    const response = await request(app.callback())
        .get('/holidays/days-of-the-omer');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Omer');
  });

  it('should return 200 for Purim', async () => {
    const response = await request(app.callback())
        .get('/holidays/purim');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Purim');
  });

  it('should return 200 for Tu BiShvat', async () => {
    const response = await request(app.callback())
        .get('/holidays/tu-bishvat');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Tisha BAv', async () => {
    const response = await request(app.callback())
        .get('/holidays/tisha-bav');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Lag BaOmer', async () => {
    const response = await request(app.callback())
        .get('/holidays/lag-baomer');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Rosh Hashana', async () => {
    const response = await request(app.callback())
        .get('/holidays/rosh-hashana');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for Rosh Chodesh Elul (minor holiday)', async () => {
    const response = await request(app.callback())
        .get('/holidays/rosh-chodesh-elul');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Holiday Detail with Gregorian Year', () => {
  it('should return 200 for Yom Kippur with specific year', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-2024');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('2024');
  });

  it('should include prev/next navigation for holiday with year', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-2024');
    expect(response.status).toBe(200);
    // prev/next links to adjacent years should be present
    expect(response.text).toMatch(/yom-kippur-202[0-9]/);
  });

  it('should return 200 for Chanukah with year', async () => {
    const response = await request(app.callback())
        .get('/holidays/chanukah-2025');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('2025');
  });

  it('should return 200 for historical year just after 1752 threshold', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-1753');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for historical year at 1752 (noindex)', async () => {
    // Years <= 1752 get noindex=true flag
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-1752');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('noindex');
  });

  it('should include warning for pre-1752 dates', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-1700');
    expect(response.status).toBe(200);
    // The page should include a historical date warning
    expect(response.text).toContain('1700');
  });

  it('should return 200 for Rosh Hashanah with specific year', async () => {
    const response = await request(app.callback())
        .get('/holidays/rosh-hashana-2024');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('2024');
  });
});

describe('Holiday Detail Content Verification', () => {
  it('should include correct title format without year', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Yom Kippur - .+ - Hebcal<\/title>/);
  });

  it('should include year in title when year is specified', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur-2024');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Yom Kippur 2024 - .+ - Hebcal<\/title>/);
  });

  it('should include Hebrew name in response', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    // Hebrew name יוֹם כִּפּוּר or similar should appear
    expect(response.text).toMatch(/יוֹם|כִּפּוּר|כיפור/);
  });

  it('should include Sefaria link for holiday with Torah reading', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    expect(response.text).toContain('sefaria.org');
  });

  it('should include Pesach-specific Israel label in title with i=on', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach-2025?i=on');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Pesach \(Israel\) 2025/);
  });

  it('should include Pesach-specific Diaspora label in title with i=off', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach-2025?i=off');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<title>Pesach \(Diaspora\) 2025/);
  });

  it('should include Rosh Chodesh Adar I with year', async () => {
    const response = await request(app.callback())
        .get('/holidays/rosh-chodesh-adar-i-2022');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Rosh Chodesh Adar I');
    expect(response.text).toContain('2022');
  });
});
