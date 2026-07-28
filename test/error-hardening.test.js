import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app as wwwApp} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(wwwApp);

// Regression tests: each of these inputs previously triggered an uncaught
// exception that surfaced as a 500 Internal Server Error. They should all
// now return a client error (4xx) instead.
// (The download server's zmanim hardening is covered in download.test.js,
// since importing both Koa apps in one file double-registers Prometheus
// metrics.)

describe('www server: bad-parameter hardening', () => {
  it.each([
    ['download-link year beyond int32 range (shabbat)',
      '/shabbat?year=999999999999999999999'],
    ['download-link geonameid beyond int32 range (holidays)',
      '/holidays/?geo=geoname&geonameid=999999999999'],
    ['Daf Yomi RSS before the cycle began',
      '/etc/dafyomi-en.xml?gy=1&gm=1&gd=1'],
    ['parsha index in a year before triennial support',
      '/sedrot/?gy=1&gm=1&gd=1'],
    ['zmanim ICS at a polar latitude with no events',
      '/zmanim?cfg=ics&geo=pos&latitude=90&longitude=0&tzid=UTC'],
  ])('400 for %s', async (why, url) => {
    const res = await request(server).get(url);
    expect(res.status).toBe(400);
  });
});
