import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';

// Install the mock before all tests in this file
beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

describe('Yahrzeit Email Routes', () => {
  it('should reject GET /yahrzeit/email', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/email');
    expect(response.status).toBe(400);
  });

  it('should handle POST /yahrzeit/email', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email');
    expect(response.status).toBe(400);
  });

  it('should handle /yahrzeit/verify with token', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/verify/01jthv2t5k88yermamssn96pze');
    expect(response.status).toBe(404);
    expect(response.type).toContain('html');
  });

  it('should handle POST /email/', async () => {
    const response = await request(app.callback())
        .post('/email/');
    // May return 200 or 400 depending on validation
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Email Verification Routes', () => {
  it('should handle /email/verify.php with token', async () => {
    const response = await request(app.callback())
        .get('/email/verify.php?3fb9stfc55da9afel3aecdca');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should handle /email/open tracking pixel', async () => {
    const response = await request(app.callback())
        .get('/email/open?msgid=01jthv2t5k88yermamssn96pze.1746503035074&loc=Boston');
    expect(response.status).toBe(200);
    expect(response.type).toContain('gif');
  });

  it('GET /email base64 decodes arg', async () => {
    const response = await request(app.callback())
        .get('/email?e=bm9ib2R5QGV4YW1wbGUuY29t');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('nobody@example.com');
  });
});
