import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Holidays Routes', () => {
  it('should return 200 for /holidays with year range', async () => {
    const response = await request(app.callback())
        .get('/holidays/1993-1994');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for /holidays with single year', async () => {
    const response = await request(app.callback())
        .get('/holidays/2007');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for specific holiday + year', async () => {
    const response = await request(app.callback())
        .get('/holidays/rosh-chodesh-adar-i-2022');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for specific holiday without year', async () => {
    const response = await request(app.callback())
        .get('/holidays/yom-kippur');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 200 for holidays PDF', async () => {
    const response = await request(app.callback())
        .get('/holidays/hebcal-2026.pdf');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/pdf');
  });

  it('should handle holiday year search', async () => {
    const response = await request(app.callback())
        .get('/holidays/pesach?gy=1980');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/pesach-1980');
  });
});
