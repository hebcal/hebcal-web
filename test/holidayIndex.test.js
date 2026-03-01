/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';

describe('Holiday Main Index', () => {
  it('should return 200 for /holidays/ main index', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should contain major holiday names on main index page', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Rosh Hashana');
    expect(response.text).toContain('Yom Kippur');
    expect(response.text).toContain('Pesach');
    expect(response.text).toContain('Sukkot');
    expect(response.text).toContain('Shavuot');
  });

  it('should contain all holiday category sections', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    // Major holidays, minor holidays, Rosh Chodesh, modern holidays
    expect(response.text).toContain('Chanukah');
    expect(response.text).toContain('Purim');
    expect(response.text).toContain('Rosh Chodesh');
  });

  it('should return 200 for /holidays/ with specific Hebrew year', async () => {
    const response = await request(app.callback()).get('/holidays/?year=5786');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('5786');
  });

  it('should redirect out-of-range Hebrew year (too small) to main holidays page', async () => {
    const response = await request(app.callback()).get('/holidays/?year=1000');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/');
    expect(response.headers.location).toContain('redir=year');
  });

  it('should redirect out-of-range Hebrew year (too large) to main holidays page', async () => {
    const response = await request(app.callback()).get('/holidays/?year=9999');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/holidays/');
    expect(response.headers.location).toContain('redir=year');
  });

  it('should return 200 for /holidays/ with Israel mode (i=on)', async () => {
    const response = await request(app.callback()).get('/holidays/?i=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('Yom Kippur');
  });

  it('should set Cache-Control header', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBeDefined();
  });

  it('should contain Days of the Omer in minor holidays section', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Omer');
  });

  it('should include Sukkot date range info (multi-day holiday)', async () => {
    const response = await request(app.callback()).get('/holidays/?year=5786');
    expect(response.status).toBe(200);
    // Sukkot spans multiple days - should have date range with bold formatting
    expect(response.text).toContain('Sukkot');
    // The tableCellObserved function generates <strong> wrapped date ranges
    expect(response.text).toContain('<strong>');
  });

  it('should show Pesach with bold date range and Chol HaMoed', async () => {
    const response = await request(app.callback()).get('/holidays/?year=5786');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Pesach');
    // Pesach has multiple date rows (Yom Tov + Chol HaMoed + last days)
    expect(response.text).toContain('<strong>');
    expect(response.text).toContain('<br>');
  });

  it('should include Israel asterisk note when Israel mode is on', async () => {
    const response = await request(app.callback()).get('/holidays/?i=on&year=5786');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Israel');
  });

  it('should handle non-numeric year gracefully (falls back to default year)', async () => {
    const response = await request(app.callback()).get('/holidays/?year=INVALID');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should include Shmini Atzeret in the holiday listing', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Shmini Atzeret');
  });

  it('should include Simchat Torah in the holiday listing', async () => {
    const response = await request(app.callback()).get('/holidays/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Simchat Torah');
  });
});
