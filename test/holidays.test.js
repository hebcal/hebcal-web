import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Holidays Routes', () => {
  it.each([
    ['/holidays with year range', '/holidays/1993-1994'],
    ['/holidays with single year', '/holidays/2007'],
    ['specific holiday + year', '/holidays/rosh-chodesh-adar-i-2022'],
    ['specific holiday without year', '/holidays/yom-kippur'],
  ])('should return 200 HTML for %s', async (why, url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for holidays PDF', async () => {
    const response = await request(server)
        .get('/holidays/hebcal-2026.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/pdf');
  });

  it('should handle holiday year search', async () => {
    const response = await request(server)
        .get('/holidays/pesach?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/pesach-1980');
  });
});
