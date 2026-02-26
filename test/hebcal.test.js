import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {injectZipsMock} from './zipsMock.js';

describe('Hebcal Routes', () => {
  it('should return 200 for /hebcal with valid params', async () => {
    const response = await request(app.callback())
        .get('/hebcal?c=on&geo=geoname&geonameid=2654285&m=50&maj=on&mf=on&min=on&mod=on&nx=on&s=on&ss=on&v=1&year=2023');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle /hebcal with JSON config', async () => {
    const response = await request(app.callback())
        .get('/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=now&month=x&ss=off&mf=off&c=off&geo=city&city=Boston&s=off');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return comprehensive calendar with all features enabled', async () => {
    const response = await request(app.callback())
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

  it('should return FullCalendar format with cfg=fc', async () => {
    const response = await request(app.callback())
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
    const response = await request(app.callback())
        .get('/hebcal?v=0&zip=90210&m=1&M=off&year=2023&c=on&s=on&maj=on&min=on&mod=on&mf=on&ss=on&nx=on&geo=zip');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Beverly Hills');
  });

  it('returns JSON calendar with location for /hebcal?zip=90210', async () => {
    const response = await request(app.callback())
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
