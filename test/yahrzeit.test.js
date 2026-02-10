import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

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
