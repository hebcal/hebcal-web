import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';
import pkg from '../package.json' with {type: 'json'};

const server = makeServer(app);

describe('Converter Routes', () => {
  it('should return 200 for GET /converter with Hebrew date', async () => {
    const response = await request(server)
        .get('/converter?h2g=1&hd=10&hm=Av&hy=6872');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  // ?cfg=xml and ?cfg=json are served exclusively by hebcal-api-go now.
  it('should return 501 for GET /converter?cfg=json', async () => {
    const response = await request(server)
        .get('/converter?cfg=json&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(501);
  });

  it('should return 501 for GET /converter?cfg=xml', async () => {
    const response = await request(server)
        .get('/converter/?cfg=xml&gy=2025&gm=12&gd=24&g2h=1');
    expect(response.status).toBe(501);
  });
});

describe('Converter Gregorian date input', () => {
  it('renders a native date input, with the legacy fields disabled', async () => {
    const response = await request(server)
        .get('/converter?gd=14&gm=5&gy=1948&g2h=1');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<input type="date" class="form-control" required name="date" id="gdate" value="1948-05-14"/);
    expect(response.text).toMatch(/required disabled name="gd"/);
    expect(response.text).toMatch(/required disabled name="gy"/);
  });

  it('pads years below 1000 to four digits', async () => {
    const response = await request(server)
        .get('/converter?gd=1&gm=2&gy=70&g2h=1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('id="gdate" value="0070-02-01"');
  });

  it('falls back to the Day/Month/Year fields for a BCE year', async () => {
    const response = await request(server)
        .get('/converter?gd=1&gm=3&gy=-500&g2h=1');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/required disabled name="date" id="gdate" value=""/);
    expect(response.text).toMatch(/required name="gy" placeholder="year" value="-500"/);
  });

  it('accepts ?date= as submitted by the date input without JS', async () => {
    const response = await request(server)
        .get('/converter?date=1948-05-14&g2h=1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="https://www.hebcal.com/converter?gd=14&amp;gm=5&amp;gy=1948&amp;g2h=1"');
  });
});

describe('Gregorian datepicker bundle', () => {
  it('redirects a stale /i/datepicker-*.js to the current version', async () => {
    const response = await request(server).get('/i/datepicker-0.0.min.js');
    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).pathname).toBe(`/i/${pkg.config.datepickerApp}`);
  });
});

describe('Converter CSV Route', () => {
  it('should handle /converter/csv with params', async () => {
    const response = await request(server)
        .get('/converter/csv?hd=4&hm=Tevet&hy=5786&h2g=1');
    expect(response.status).toBe(200);
    expect(response.type).toContain('csv');
  });

  it('should reject POST /converter/csv with 405', async () => {
    const response = await request(server)
        .post('/converter/csv');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });

  // Date-range conversion (start/end, ndays) moved to hebcal-api-go: 501, not 500.
  it('should return 501 (not 500) for /converter/csv with a date range', async () => {
    const response = await request(server)
        .get('/converter/csv?start=2024-01-01&end=2024-01-05');
    expect(response.status).toBe(501);
  });

  it('should return 501 (not 500) for /converter/csv with ndays', async () => {
    const response = await request(server)
        .get('/converter/csv?h2g=1&ndays=2');
    expect(response.status).toBe(501);
  });
});

describe('Duplicate query parameters', () => {
  // Regression: this exact URL threw a 500 because lg arrived as ['hn','h']
  // instead of a scalar. fixup0 now collapses every array-valued param.
  it('should not 500 when a param appears twice with different values', async () => {
    const response = await request(server)
        .get('/converter?g2h=1&g2h=1&gd=25&gm=12&gs=on&gy=2025&lg=hn&lg=h');
    expect(response.status).toBe(200);
  });
});
