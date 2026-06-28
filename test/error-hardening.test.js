import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app as wwwApp} from '../src/app-www.js';

// Regression tests: each of these inputs previously triggered an uncaught
// exception that surfaced as a 500 Internal Server Error. They should all
// now return a client error (4xx) instead.
// (The download server's zmanim hardening is covered in download.test.js,
// since importing both Koa apps in one file double-registers Prometheus
// metrics.)

describe('www server: bad-parameter hardening', () => {
  it('400 for download-link year beyond int32 range (shabbat)', async () => {
    const res = await request(wwwApp.callback())
        .get('/shabbat?year=999999999999999999999');
    expect(res.status).toBe(400);
  });

  it('400 for download-link geonameid beyond int32 range (holidays)', async () => {
    const res = await request(wwwApp.callback())
        .get('/holidays/?geo=geoname&geonameid=999999999999');
    expect(res.status).toBe(400);
  });

  it('400 for Daf Yomi RSS before the cycle began', async () => {
    const res = await request(wwwApp.callback())
        .get('/etc/dafyomi-en.xml?gy=1&gm=1&gd=1');
    expect(res.status).toBe(400);
  });

  it('400 for parsha index in a year before triennial support', async () => {
    const res = await request(wwwApp.callback())
        .get('/sedrot/?gy=1&gm=1&gd=1');
    expect(res.status).toBe(400);
  });

  it('400 for zmanim ICS at a polar latitude with no events', async () => {
    const res = await request(wwwApp.callback())
        .get('/zmanim?cfg=ics&geo=pos&latitude=90&longitude=0&tzid=UTC');
    expect(res.status).toBe(400);
  });
});
