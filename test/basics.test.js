import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Homepage and Basic Routes', () => {
  it('should return 200 for homepage', async () => {
    const response = await request(app.callback()).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return robots.txt', async () => {
    const response = await request(app.callback()).get('/robots.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
    expect(response.text).toContain('User-agent:');
  });

  // Note: /ping requires a static file to exist in DOCUMENT_ROOT
});

describe('Static and Special Routes', () => {
  it('should return 200 for /ical/', async () => {
    const response = await request(app.callback())
        .get('/ical/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for hdate JS files', async () => {
    const response = await request(app.callback())
        .get('/etc/hdate-en.js');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
  });

  it('should return 200 for hdate Hebrew JS files', async () => {
    const response = await request(app.callback())
        .get('/etc/hdate-he.js');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
  });
});

describe('Static File Serving', () => {
  it('should serve SVG sprite file with correct content type', async () => {
    const response = await request(app.callback())
        .get('/i/sprite13.svg');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/svg/);
    // Verify long-lived cache headers
    expect(response.headers['cache-control']).toBeDefined();
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
    const maxAge = Number.parseInt(response.headers['cache-control'].match(/max-age=(\d+)/)?.[1] || '0');
    expect(maxAge).toBeGreaterThanOrEqual(31536000); // At least 1 year (31536000 seconds)
  });

  it('should serve favicon with correct content type', async () => {
    const response = await request(app.callback())
        .get('/favicon.ico');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/icon|octet-stream/);
  });

  it('should serve WOFF2 font file with correct content type', async () => {
    const response = await request(app.callback())
        .get('/i/adobehebrew-regular.woff2');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/woff2|font|octet-stream/);
  });

  it('should serve minified JavaScript file with correct content type', async () => {
    const response = await request(app.callback())
        .get('/i/hebcal-app-5.2.1.min.js');
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
    // Verify immutable cache header
    expect(response.headers['cache-control']).toBeDefined();
    expect(response.headers['cache-control']).toMatch(/immutable/);
  });
});

describe('Security.txt', () => {
  it('should return 200 for /.well-known/security.txt', async () => {
    const response = await request(app.callback())
        .get('/.well-known/security.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
  });
});

describe('Hidden Directory Routes', () => {
  it('should return 200 for /i hidden directory', async () => {
    const response = await request(app.callback())
        .get('/i');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /i/ with trailing slash', async () => {
    const response = await request(app.callback())
        .get('/i/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /etc hidden directory', async () => {
    const response = await request(app.callback())
        .get('/etc');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /etc/ with trailing slash', async () => {
    const response = await request(app.callback())
        .get('/etc/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});
