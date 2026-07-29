/* eslint-disable max-len */
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {injectZipsMock} from './zipsMock.js';
import {expectConditionalEtag} from './conditionalEtag.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Hebcal Routes', () => {
  it('should return 200 for /hebcal with valid params', async () => {
    const response = await request(server)
        .get('/hebcal?c=on&geo=geoname&geonameid=5128581&m=50&maj=on&mf=on&min=on&mod=on&nx=on&s=on&ss=on&v=1&year=2023');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle /hebcal with JSON config', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=now&month=x&ss=off&mf=off&c=off&geo=city&city=Boston&s=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return comprehensive calendar with all features enabled', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=2023&month=x&ss=on&mf=on&c=on&geo=geoname&geonameid=3448439&M=on&s=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    // Validate response structure
    const body = response.body;
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    // Validate location information
    expect(body).toHaveProperty('location');
    expect(body.location).toHaveProperty('geo');
    expect(body.location).toHaveProperty('geonameid');
    expect(body.location.geonameid).toBe(3448439);

    // Should contain major holidays
    const holidays = body.items.filter((item) => item.category === 'holiday');
    expect(holidays.length).toBeGreaterThan(0);

    // Should contain candle lighting times (ss=on, c=on)
    const candleLighting = body.items.filter((item) => item.category === 'candles');
    expect(candleLighting.length).toBeGreaterThan(0);

    // Should contain havdalah times (M=on)
    const havdalah = body.items.filter((item) => item.category === 'havdalah');
    expect(havdalah.length).toBeGreaterThan(0);

    // Should contain Torah readings (s=on)
    const parsha = body.items.filter((item) => item.category === 'parashat');
    expect(parsha.length).toBeGreaterThan(0);

    // Should contain Rosh Chodesh (nx=on)
    const roshChodesh = body.items.filter((item) => item.title?.includes('Rosh Chodesh'));
    expect(roshChodesh.length).toBeGreaterThan(0);

    // Validate timed events have proper date format
    const timedEvents = body.items.filter((item) => item.date?.includes('T'));
    expect(timedEvents.length).toBeGreaterThan(0);
    timedEvents.forEach((item) => {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  it('should return HTML with hebrewMonths and gematriyaNumerals opts when mm=2', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&maj=on&min=on&nx=on&year=2026&month=3&mm=2');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');

    // Template embeds opts as JSON: window.hebcal.opts={...}
    // mm=2 sets both hebrewMonths and gematriyaNumerals in the opts
    expect(response.text).toContain('"hebrewMonths":true');
    expect(response.text).toContain('"gematriyaNumerals":true');
  });

  it('should return JSON calendar with mm=2 (Hebrew months & Hebrew numerals)', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&min=on&nx=on&year=2026&month=3&mm=2');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    // Should still contain major holidays even with Hebrew months enabled
    const holidays = body.items.filter((item) => item.category === 'holiday');
    expect(holidays.length).toBeGreaterThan(0);

    // Purim falls in Adar II / Adar on March 2026 (Gregorian month 3)
    const purim = body.items.find((item) => item.title === 'Purim');
    expect(purim).toBeDefined();
  });

  it('should return FullCalendar format with cfg=fc', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=fc&start=2026-03-01&end=2026-04-12&i=off&maj=on&min=on&nx=on&mf=on&ss=on&mod=on&lg=s');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    // Validate response is an array (FullCalendar format)
    const body = response.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    // Validate FullCalendar event structure
    const firstEvent = body[0];
    expect(firstEvent).toHaveProperty('title');
    expect(firstEvent).toHaveProperty('start');
    expect(typeof firstEvent.title).toBe('string');
    expect(typeof firstEvent.start).toBe('string');

    // FullCalendar events should have ISO 8601 date format
    expect(firstEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}/);

    // Some events may have additional FullCalendar properties
    const timedEvent = body.find((event) => event.start?.includes('T'));
    if (timedEvent) {
      // Timed events should have full ISO timestamp
      expect(timedEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }

    // All-day events should not have time component or have allDay property
    const allDayEvent = body.find((event) => event.start && !event.start.includes('T'));
    if (allDayEvent) {
      // All-day events should have date-only format
      expect(allDayEvent.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('ZIP code lookup with mock database', () => {
  let teardown;
  beforeAll(() => {
    teardown = injectZipsMock(app.context.db);
  });
  afterAll(() => teardown());

  it('returns HTML calendar with city name for /hebcal?zip=90210', async () => {
    const response = await request(server)
        .get('/hebcal?v=0&zip=90210&m=1&M=off&year=2023&c=on&s=on&maj=on&min=on&mod=on&mf=on&ss=on&nx=on&geo=zip');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Beverly Hills');
  });

  it('returns JSON calendar with location for /hebcal?zip=90210', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&zip=90210&geo=zip&c=on&M=on&maj=on&year=2026&month=3');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    const body = response.body;
    expect(body.location.geo).toBe('zip');
    expect(body.location.city).toBe('Beverly Hills');
    expect(body.location.zip).toBe('90210');
    expect(body.location.country).toBe('United States');
    expect(body.location.stateName).toBe('California');

    const candles = body.items.filter((item) => item.category === 'candles');
    expect(candles.length).toBeGreaterThan(0);
  });
});

describe('Hebcal output formats', () => {
  it('should return CSV format with cfg=csv', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=csv&maj=on&year=2026&month=3');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
    expect(response.text).toContain('"Subject"');
    expect(response.text).toContain('"Start Date"');
  });

  // Same treatment as download.hebcal.com: a Torah reading's CSV description
  // is the special Shabbat it falls on, not its (much too long) prose summary.
  it('describes a parsha by its special Shabbat with cfg=csv', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=csv&s=on&year=2026&month=3&i=off');
    expect(response.status).toBe(200);
    const rows = response.text.split('\r\n');
    expect(rows).toContain('"Parashat Tzav","3/28/2026",,,,"true","Shabbat HaGadol","3","Torah Reading"');
  });

  it.each([
    {cfg: 'rss', type: 'xml', text: '<rss', what: 'RSS XML'},
    {cfg: 'ics', type: 'calendar', text: 'BEGIN:VCALENDAR', what: 'iCalendar'},
    {cfg: 'e', type: 'javascript', text: 'DefineEvent(', what: 'DefineEvent JavaScript'},
    {cfg: 'e2', type: 'javascript', text: 'HEBCAL.eraw2', what: 'HEBCAL.eraw2 JavaScript'},
  ])('should return $what with cfg=$cfg', async ({cfg, type, text}) => {
    const response = await request(server)
        .get(`/hebcal?v=1&cfg=${cfg}&maj=on&year=2026&month=3`);
    expect(response.status).toBe(200);
    expect(response.type).toContain(type);
    expect(response.text).toContain(text);
  });

  it('should wrap JSON in JSONP callback when callback param is given', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&callback=myCallback');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/^myCallback\(/);
    // JSONP is a script, not JSON, and must say so
    expect(response.headers['content-type']).toMatch(/^text\/javascript/);
  });

  it('should allow a dotted callback name', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&callback=window.hebcal._cb$1');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/^window\.hebcal\._cb\$1\(/);
  });

  it('should ignore a callback containing script meta-characters', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&callback=' +
          encodeURIComponent('</script><img src=x onerror=alert(1)>'));
    expect(response.status).toBe(200);
    // falls back to plain JSON rather than emitting a scrubbed callback name
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.text).toMatch(/^\{/);
    expect(response.text).not.toContain('onerror');
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it('should ignore a callback that is not a valid identifier', async () => {
    for (const bad of ['1bad', 'foo bar', 'foo()', '.foo', 'foo..bar', 'a'.repeat(129)]) {
      const response = await request(server)
          .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&callback=' +
            encodeURIComponent(bad));
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
    }
  });

  it('should send X-Content-Type-Options: nosniff', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should omit leyning data from parasha items when leyning=off', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&s=on&maj=on&year=2026&month=3&leyning=off');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(Array.isArray(body.items)).toBe(true);
    const parashat = body.items.find((item) => item.category === 'parashat');
    if (parashat) {
      expect(parashat.leyning).toBeUndefined();
    }
  });

  it('should include heDateParts on items when hdp=1', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&hdp=1');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toHaveProperty('heDateParts');
  });
});

describe('Hebcal error handling', () => {
  it('should return 400 for non-numeric year with cfg=json', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=INVALID');
    expect(response.status).toBe(400);
  });

  it.each([
    ['Gregorian year > 9999', '/hebcal?v=1&maj=on&year=10000'],
    ['Hebrew year > 13760', '/hebcal?v=1&maj=on&yt=H&year=13761'],
    ['invalid year with v=1', '/hebcal?v=1&maj=on&year=INVALID'],
  ])('should return a 400 HTML form for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(400);
    expect(response.type).toContain('html');
  });

  it('should return 400 for cfg=fc when start and end are both missing', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=fc&maj=on');
    expect(response.status).toBe(400);
  });

  it('should return 400 with error message in HTML when no event types selected', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&maj=off&min=off&mod=off&nx=off&ss=off&mf=off&s=off&c=off&year=2026&month=3');
    expect(response.status).toBe(400);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Please select at least one event option');
  });
});

describe('Hebcal HTML rendering options', () => {
  it('should auto-detect current year when no year param is given', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('should auto-detect Hebrew year when yt=H with no year param', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&yt=H');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('should return Israel holiday set when Israel mode (i=on) is requested', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=json&maj=on&year=2026&month=3&i=on');
    expect(response.status).toBe(200);
    const body = response.body;
    expect(body).toHaveProperty('items');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('should render HTML calendar for date range using start/end params', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&maj=on&start=2026-03-01&end=2026-03-31&set=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should render HTML calendar with Hebrew locale (lg=he)', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&maj=on&year=2026&month=3&lg=he&set=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should set Cache-Control header when set=off prevents cookie writing', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&maj=on&year=2026&month=3&set=off');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBeDefined();
  });
});

function uniqueYears(items) {
  const years = new Set(items.map((item) => item.date.substring(0, 4)));
  return years.size;
}

describe('Hebcal ny (number of years) parameter', () => {
  it.each([
    {ny: '1', years: 1, why: ''},
    {ny: '0', years: 1, why: ' (below minimum)'},
    {ny: '-5', years: 1, why: ' (negative)'},
    {ny: '3', years: 3, why: ''},
    {ny: '5', years: 5, why: ''},
    {ny: '10', years: 10, why: ''},
    {ny: '15', years: 10, why: ' (capped at maximum)'},
  ])('should return $years year(s) when ny=$ny$why', async ({ny, years}) => {
    const response = await request(server)
        .get(`/hebcal?v=1&cfg=json&maj=on&year=2023&month=x&ny=${ny}`);
    expect(response.status).toBe(200);
    expect(uniqueYears(response.body.items)).toBe(years);
  });
});

describe('304 Not Modified (ETag / If-None-Match)', () => {
  it.each([
    ['cfg=json', '/hebcal?v=1&cfg=json&maj=on&year=2026&month=3'],
    ['cfg=ics', '/hebcal?v=1&cfg=ics&maj=on&year=2026&month=3'],
    ['cfg=fc', '/hebcal?v=1&cfg=fc&start=2026-03-01&end=2026-04-12&maj=on&min=on&nx=on'],
    ['cfg=csv', '/hebcal?v=1&cfg=csv&maj=on&year=2026&month=3'],
    ['cfg=rss', '/hebcal?v=1&cfg=rss&maj=on&year=2026&month=3'],
    ['HTML calendar (no cfg)', '/hebcal?v=1&maj=on&year=2026&month=3&set=off'],
  ])('handles conditional requests for %s', async (what, url) => {
    await expectConditionalEtag(server, url);
  });
});
