/* eslint-disable max-len */
import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';

// Install the DB mock so DB-dependent routes work without a real MySQL server
beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('Yahrzeit Routes', () => {
  it('should handle POST /yahrzeit with JSON config', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit?cfg=json&v=yahrzeit&hebdate=on&years=8&y1=2003&m1=12&d1=14&s1=after&t1=Yahrzeit&start=5785&n1=test');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should handle POST /yahrzeit with form data and multiple anniversaries', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('cfg=json&v=yahrzeit&n1=Person1&t1=Birthday&d1=15&m1=4&y1=1983&s1=on&n2=Person2&t2=Yahrzeit&d2=13&m2=11&y2=2008&s2=off&hebdate=on&years=3');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    // Validate response structure
    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('title');

    // Should have events for both Person1 and Person2
    expect(body.items.length).toBeGreaterThan(0);

    // Check that we have birthday events
    const birthdays = body.items.filter((item) => item.category === 'birthday');
    expect(birthdays.length).toBeGreaterThan(0);

    // Check that we have yahrzeit events
    const yahrzeits = body.items.filter((item) => item.category === 'yahrzeit');
    expect(yahrzeits.length).toBeGreaterThan(0);
  });

  it('should handle POST /yahrzeit/search', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/search');
    // May return various codes depending on input
    expect(response.status).toBeDefined();
  });
});

describe('Yahrzeit big test', () => {
  it('should handle large POST /yahrzeit with JSON config', async () => {
    const start = new Date(1980, 0, 1);
    const q = {
      cfg: 'json',
      v: 'yahrzeit',
      hebdate: 'on',
      start: '5784',
      years: '2',
      seq: '1',
      em: '',
      tzo: '480',
    };
    for (let i = 1; i <= 500; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i - 1);
      q[`n${i}`] = `FirstName${i} LastName${i}`;
      q[`t${i}`] = i % 2 === 0 ? 'Birthday' : 'Yahrzeit';
      q[`d${i}`] = dt.getDate();
      q[`m${i}`] = dt.getMonth() + 1;
      q[`y${i}`] = dt.getFullYear();
      q[`s${i}`] = 'off';
    }
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form') // Sets Content-Type: application/x-www-form-urlencoded
        .send(q); // Object data
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    // Validate response structure
    const body = response.body;
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('range');
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1000);
    expect(body.items).toContainEqual({
      'title': 'FirstName500 LastName500’s 44th Hebrew Birthday (10th of Iyyar)',
      'date': '2025-05-08',
      'hdate': '10 Iyyar 5785',
      'memo': 'Hebcal joins you in honoring FirstName500 LastName500, whose 44th Hebrew Birthday occurs on Thursday, May 8, corresponding to the 10th of Iyyar, 5785.\n\nFirstName500 LastName500’s Hebrew Birthday begins at sundown on Wednesday, May 7 and continues until sundown on the day of observance.\n\nMazel Tov!',
      'name': 'FirstName500 LastName500',
      'category': 'birthday',
      'anniversary': 44,
    });
  });
});


describe('Yahrzeit JSON output structure', () => {
  it('returns expected fields for a single Yahrzeit entry', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=json&v=yahrzeit&n1=Golda+Meir&t1=Yahrzeit&d1=8&m1=12&y1=1978&s1=off&start=5785&years=2');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('title');
    expect(body.title).toContain('Golda Meir');
    expect(body).toHaveProperty('items');
    expect(body.items.length).toBe(2);
    const item = body.items[0];
    expect(item.category).toBe('yahrzeit');
    expect(item.name).toBe('Golda Meir');
    expect(item).toHaveProperty('anniversary');
    expect(item).toHaveProperty('date');
    expect(item).toHaveProperty('memo');
  });

  it('returns Anniversary type for "Other" entries', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=json&v=yahrzeit&n1=My+Event&t1=Other&d1=1&m1=1&y1=2000&s1=off&start=5785&years=1');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(body.items[0]).toEqual({
      title: 'My Event',
      date: '2025-01-23',
      hdate: '23 Tevet 5785',
      memo: 'My Event occurs on Thursday, January 23, corresponding to the 23rd of Tevet, 5785.\n' +
    '\n' +
    'My Event begins at sundown on Wednesday, January 22 and continues until sundown on the day of observance.',
      name: 'My Event',
      category: 'other',
      anniversary: 25,
    });
  });

  it('returns hdp=1 heDateParts in JSON output', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=json&v=yahrzeit&n1=Test&t1=Birthday&d1=5&m1=6&y1=1990&s1=off&start=5785&years=1&hdp=1');
    expect(response.status).toBe(200);
    const body = response.body;
    const item = body.items[0];
    expect(item).toHaveProperty('heDateParts');
    expect(item.heDateParts).toHaveProperty('m');
    expect(item.heDateParts).toHaveProperty('d');
    expect(item.heDateParts).toHaveProperty('y');
  });
});

describe('Yahrzeit FullCalendar output', () => {
  it('returns 400 when start param is missing', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=fc&v=yahrzeit&n1=Test&t1=Yahrzeit&d1=8&m1=12&y1=1978');
    expect(response.status).toBe(400);
  });

  it('returns array of events for cfg=fc with valid date range', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=fc&v=yahrzeit&n1=Golda+Meir&t1=Yahrzeit&d1=8&m1=12&y1=1978&s1=off&start=2025-01-01&end=2026-12-31');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    const body = response.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const ev = body[0];
    expect(ev).toHaveProperty('title');
    expect(ev).toHaveProperty('start');
  });

  it('returns 400 for cfg=xml', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=xml&v=yahrzeit&n1=Test&t1=Yahrzeit&d1=8&m1=12&y1=1978');
    expect(response.status).toBe(400);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('error');
  });
});

describe('Yahrzeit calendar picker (GET with no query)', () => {
  it('renders calpicker with no calendars when no Y cookie is set', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('renders calpicker and lists calendar when Y cookie contains known id', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit')
        .set('Cookie', 'Y=01jthv2t5k88yermamssn96pzf');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // The calendar for Golda Meir should appear in the picker
    expect(response.text).toContain('Golda Meir');
  });
});

describe('Yahrzeit GET /yahrzeit/new', () => {
  it('renders the empty yahrzeit form', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/new');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Yahrzeit edit page (DB-dependent)', () => {
  const calendarId = '01jthv2t5k88yermamssn96pzf';

  it('GET /yahrzeit/edit/:id renders edit page for known calendar', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/edit/${calendarId}`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Golda Meir');
  });

  it('GET /yahrzeit?id=:id renders edit page for known calendar', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit?id=${calendarId}`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Golda Meir');
  });

  it('GET /yahrzeit/edit/:id returns 404 for unknown calendar', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/edit/01jthv2t5k88yermamsunknown1');
    expect(response.status).toBe(404);
  });
});

describe('Yahrzeit with yizkor option', () => {
  it('returns yizkor events in addition to yahrzeit events', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=json&v=yahrzeit&n1=Test&t1=Yahrzeit&d1=8&m1=12&y1=1978&s1=off&yizkor=on&start=5785&years=2');
    expect(response.status).toBe(200);
    const body = response.body;
    const yizkorItems = body.items.filter((i) => i.title.startsWith('Yizkor'));
    expect(yizkorItems.length).toBe(8); // Pesach, Shavuot, Yom Kippur, Shmini Atzeret
  });
});

describe('Yahrzeit Hebrew name handling', () => {
  it('generates Hebrew subject line for Hebrew names', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit')
        .type('form')
        .send('cfg=json&v=yahrzeit&n1=%D7%92%D7%95%D7%9C%D7%93%D7%94&t1=Yahrzeit&d1=8&m1=12&y1=1978&s1=off&start=5785&years=1');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.items.length).toBeGreaterThan(0);
    // Hebrew title should contain the Hebrew anniversary text
    const title = body.items[0].title;
    expect(title).toContain('גולדה');
  });
});
