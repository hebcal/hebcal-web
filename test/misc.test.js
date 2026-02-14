import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Zmanim and Omer Routes', () => {
  it('should return 200 for /zmanim', async () => {
    const response = await request(app.callback())
        .get('/zmanim?cfg=json&geonameid=293397&date=2025-12-24');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should return Assur Melacha status with im=1 parameter', async () => {
    const response = await request(app.callback())
        .get('/zmanim?cfg=json&im=1&geonameid=3448439&dt=2025-06-21T20:08:10Z');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');

    // Validate response structure for Assur Melacha API
    const body = response.body;
    expect(body).toHaveProperty('date');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('location');
    expect(body).toHaveProperty('status');

    // Validate location object
    expect(body.location).toHaveProperty('geonameid');
    expect(body.location.geonameid).toBe(3448439);

    // Validate status object
    expect(body.status).toHaveProperty('localTime');
    expect(body.status).toHaveProperty('isAssurBemlacha');
    expect(typeof body.status.isAssurBemlacha).toBe('boolean');
    expect(typeof body.status.localTime).toBe('string');
  });

  it('should return 200 for /omer with date', async () => {
    const response = await request(app.callback())
        .get('/omer/6473/32');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Autocomplete Routes', () => {
  it('should return 200 for /complete with query', async () => {
    const response = await request(app.callback())
        .get('/complete?q=san+francisco');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should handle /complete with empty query', async () => {
    const response = await request(app.callback())
        .get('/complete?q=');
    expect(response.status).toBe(404);
    expect(response.type).toContain('json');
  });

  it('should handle /complete with international characters', async () => {
    const response = await request(app.callback())
        .get('/complete?q=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should not include admin1 in value for Berlin', async () => {
    const response = await request(app.callback())
        .get('/complete?q=Berlin');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    const body = response.body;
    expect(typeof body).toBe('object');
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toEqual({
      'admin1': 'State of Berlin',
      'asciiname': 'Berlin',
      'cc': 'DE',
      'country': 'Germany',
      'flag': '🇩🇪',
      'geo': 'geoname',
      'id': 2950159,
      'value': 'Berlin, Germany',
    });
  });
});

describe('Daily Learning Routes', () => {
  it('should return redirect /learning', async () => {
    const response = await request(app.callback())
        .get('/learning')
        .redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/learning/2');
  });

  it('should return 200 for /learning with date', async () => {
    const response = await request(app.callback())
        .get('/learning/2025-12-24');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Geo Location Routes', () => {
  it('should return 200 for /geo with valid geonameid', async () => {
    const response = await request(app.callback())
        .get('/geo?geonameid=293397');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });
});

describe('Leyning Routes', () => {
  it('should handle /leyning with cfg=json', async () => {
    const response = await request(app.callback())
        .get('/leyning?cfg=json&date=2025-12-27');
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
  });

  it('should reject POST method on /leyning with 405', async () => {
    const response = await request(app.callback())
        .post('/leyning');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });
});

describe('Delete Cookie Route', () => {
  it('should return 200 for /hebcal/del_cookie', async () => {
    const response = await request(app.callback())
        .get('/hebcal/del_cookie');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should reject POST method on /hebcal/del_cookie with 405', async () => {
    const response = await request(app.callback())
        .post('/hebcal/del_cookie');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });
});

describe('Link Routes', () => {
  it('should handle /link route', async () => {
    const response = await request(app.callback())
        .get('/link?geonameid=293397');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle POST /link route', async () => {
    const response = await request(app.callback())
        .post('/link?geonameid=293397');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Sitemap Routes', () => {
  it('should return 200 for /sitemap_zips.txt', async () => {
    const response = await request(app.callback())
        .get('/sitemap_zips.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
  });

  it('should reject POST on /sitemap_zips.txt with 405', async () => {
    const response = await request(app.callback())
        .post('/sitemap_zips.txt');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });
});

describe('Analytics Routes', () => {
  it('should return 200 for /ma/ma.js', async () => {
    const response = await request(app.callback())
        .get('/ma/ma.js');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
  });

  it('should return 200 for /matomo/matomo.js', async () => {
    const response = await request(app.callback())
        .get('/matomo/matomo.js');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
  });

  it('should return 204 for /ma/ma.php with send_image=0', async () => {
    const response = await request(app.callback())
        .get('/ma/ma.php?send_image=0');
    expect(response.status).toBe(204);
  });

  it('should return 204 for /matomo/matomo.php with send_image=0', async () => {
    const response = await request(app.callback())
        .get('/matomo/matomo.php?send_image=0');
    expect(response.status).toBe(204);
  });
});
