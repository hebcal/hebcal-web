import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';

// Install the mock before all tests in this file
beforeAll(() => {
  app.context.mysql = new MockMysqlDb();
});

// IDs used throughout these tests (must be exactly 26 chars)
const CALENDAR_ID = '01jthv2t5k88yermamssn96pzf'; // Golda Meir calendar
const PENDING_SUB_ID = '01jthv2t5k88yermamssn96pza'; // pending subscription
const ACTIVE_SUB_ID = '01jthv2t5k88yermamssn96pzb'; // active subscription

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

describe('Shabbat Email Verification Routes', () => {
  it('should handle /email/verify.php with token', async () => {
    const response = await request(app.callback())
        .get('/email/verify.php?3fb9stfc55da9afel3aecdca');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 400 for /email/verify.php with invalid token', async () => {
    const response = await request(app.callback())
        .get('/email/verify.php?bogus');
    expect(response.status).toBe(400);
  });

  it('should return 404 for /email/verify.php with not-found token', async () => {
    const response = await request(app.callback())
        .get('/email/verify.php?4rn3dorohk2w7buwmm80uxx6');
    expect(response.status).toBe(404);
  });

  it('GET /email base64 decodes arg', async () => {
    const response = await request(app.callback())
        .get('/email?e=bm9ib2R5QGV4YW1wbGUuY29t');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('nobody@example.com');
  });
});

describe('Email tracking pixel Routes', () => {
  it('should handle /email/open tracking pixel', async () => {
    const response = await request(app.callback())
        .get('/email/open?msgid=01jthv2t5k88yermamssn96pze.1746503035074&loc=Boston');
    expect(response.status).toBe(200);
    expect(response.type).toContain('gif');
  });
});


describe('Yahrzeit Email Verification', () => {
  it.skip('displays verify page for a pending subscription', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/verify/${PENDING_SUB_ID}`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // Should show confirmation prompt with the subscriber's email
    expect(response.text).toContain('pending@example.com');
  });

  it('rejects verify request with token shorter than 26 chars', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/verify/tooshort');
    expect(response.status).toBe(400);
  });

  it('returns 404 when verify token does not exist in DB', async () => {
    // Valid 26-char ULID that has no subscription in mock
    const response = await request(app.callback())
        .get('/yahrzeit/verify/01jthv2t5k88yermamssunknwn');
    expect(response.status).toBe(404);
  });

  it.skip('confirms subscription when commit=1 is supplied', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/verify/${PENDING_SUB_ID}?commit=1`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // The confirmation page should reflect the confirmed state
    expect(response.text).toContain('pending@example.com');
  });
});

describe('Yahrzeit Email Search', () => {
  it('renders not-found page when em param is missing', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/search');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('returns 400 and not-found page for invalid email address', async () => {
    const response = await request(app.callback())
        .get('/yahrzeit/search?em=not-an-email');
    expect(response.status).toBe(400);
    expect(response.type).toContain('html');
  });

  it('returns 404 when email has no active subscriptions', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/search')
        .type('form')
        .send('em=nobody@example.com');
    // nobody@example.com has shabbat email but no yahrzeit subscription
    expect(response.status).toBe(404);
    expect(response.type).toContain('html');
  });

  it.skip('sends search results for an email with active subscriptions', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/search')
        .type('form')
        .send('em=active@example.com');
    // active@example.com has an active yahrzeit subscription
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('active@example.com');
  });
});

describe('Yahrzeit Email Subscribe', () => {
  it('returns 400 when em param is missing', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(400);
  });

  it('returns 400 when ulid param is missing', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send('em=new@example.com&type=Yahrzeit');
    expect(response.status).toBe(400);
  });

  it('returns 400 when type param is missing', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=new@example.com&ulid=${CALENDAR_ID}`);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid email address', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=not-valid&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(400);
  });

  it('returns 404 when calendar id does not exist in DB', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send('em=new@example.com&ulid=01jthv2t5k88yermamsunknwn1&type=Yahrzeit');
    expect(response.status).toBe(404);
  });

  it('creates a new pending subscription for a new email', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=brandnew@example.com&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });

  it.skip('returns alreadySubscribed flag for an already-active subscriber', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=active@example.com&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true, alreadySubscribed: true});
  });

  it('re-subscribes a previously pending subscriber', async () => {
    const response = await request(app.callback())
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=pending@example.com&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    const body = response.body;
    expect(body.ok).toBe(true);
    // Status should reflect the previous subscription state
    expect(body.alreadySubscribed).toBeUndefined();
  });
});

describe('Yahrzeit Email Unsubscribe', () => {
  it.skip('shows pre-unsubscribe page for num=all without commit', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('active@example.com');
  });

  it.skip('completes unsubscribe for num=all with commit=1', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&commit=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('active@example.com');
  });

  it('returns JSON ok response for unsubscribe with cfg=json', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&commit=1&cfg=json`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });

  it.skip('shows pre-unsubscribe page for individual entry (num=1) without commit', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=1&unsubscribe=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('completes individual entry unsubscribe with commit=1 and cfg=json', async () => {
    const response = await request(app.callback())
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=1&unsubscribe=1&commit=1&cfg=json`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });
});
