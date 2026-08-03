import {describe, it, expect} from 'vitest';
import request from 'supertest';
import os from 'node:os';
import {app} from '../src/app-www.js';
import {pkg} from '../src/pkg.js';
import {expectConditionalEtag} from './conditionalEtag.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Homepage and Basic Routes', () => {
  it('should return 200 for homepage', async () => {
    const response = await request(server).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return robots.txt', async () => {
    const response = await request(server).get('/robots.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
    expect(response.text).toContain('User-agent:');
  });

  // Note: /ping requires a static file to exist in DOCUMENT_ROOT
});

describe('Static and Special Routes', () => {
  it.each([
    ['/ical/', 'html'],
    ['/etc/hdate-en.js', 'javascript'],
    ['/etc/hdate-he.js', 'javascript'],
  ])('should return 200 %s (%s)', async (url, type) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain(type);
  });
});

describe('Static File Serving', () => {
  it('should serve SVG sprite file with correct content type', async () => {
    const response = await request(server)
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
    const response = await request(server)
        .get('/favicon.ico');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/icon|octet-stream/);
  });

  it('should serve favicon.svg with correct content type', async () => {
    const response = await request(server)
        .get('/favicon.svg');
    expect(response.status).toBe(200);
    expect(response.type).toBe('image/svg+xml');
  });

  it('should serve WOFF2 font file with correct content type', async () => {
    const response = await request(server)
        .get('/i/adobehebrew-regular.woff2');
    expect(response.status).toBe(200);
    expect(response.type).toMatch(/woff2|font|octet-stream/);
  });

  it('should serve minified JavaScript file with correct content type', async () => {
    const response = await request(server)
        .get('/i/' + pkg.config.clientapp);
    expect(response.status).toBe(200);
    expect(response.type).toContain('javascript');
    // Verify immutable cache header
    expect(response.headers['cache-control']).toBeDefined();
    expect(response.headers['cache-control']).toMatch(/immutable/);
  });
});

describe('Security.txt', () => {
  it('should return 200 for /.well-known/security.txt', async () => {
    const response = await request(server)
        .get('/.well-known/security.txt');
    expect(response.status).toBe(200);
    expect(response.type).toContain('text');
  });
});

describe('Hidden Directory Routes', () => {
  it.each([
    ['/i hidden directory', '/i'],
    ['/i/ with trailing slash', '/i/'],
    ['/etc hidden directory', '/etc'],
  ])('should return 200 HTML for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /etc/ with trailing slash', async () => {
    const response = await request(server)
        .get('/etc/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('X-Backend header', () => {
  it.each([
    ['homepage', '/', 200],
    ['static file', '/i/sprite13.svg', 200],
    ['not found', '/bogus-page-does-not-exist', 404],
  ])('exposes the server hostname on %s', async (why, url, status) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(status);
    expect(response.headers['x-backend']).toBe(os.hostname());
  });

  it('exposes the server hostname on a 405 error response', async () => {
    const response = await request(server).put('/');
    expect(response.status).toBe(405);
    expect(response.headers['x-backend']).toBe(os.hostname());
  });
});

describe('security.txt 304 Not Modified (ETag / If-None-Match)', () => {
  it('handles conditional requests for /.well-known/security.txt', async () => {
    await expectConditionalEtag(server, '/.well-known/security.txt');
  });
});
