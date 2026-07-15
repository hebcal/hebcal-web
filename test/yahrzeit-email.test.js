import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

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
    const response = await request(server)
        .get('/yahrzeit/email');
    expect(response.status).toBe(400);
  });

  it('should handle POST /yahrzeit/email', async () => {
    const response = await request(server)
        .post('/yahrzeit/email');
    expect(response.status).toBe(400);
  });

  it('should handle /yahrzeit/verify with token', async () => {
    const response = await request(server)
        .get('/yahrzeit/verify/01jthv2t5k88yermamssn96pze');
    expect(response.status).toBe(404);
    expect(response.type).toContain('html');
  });

  it('should handle POST /email/', async () => {
    const response = await request(server)
        .post('/email/');
    // May return 200 or 400 depending on validation
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });
});

describe('Email subscribe CSRF protection', () => {
  // Browsers attach an Origin header to cross-site POSTs; a forged subscribe
  // from another origin must be rejected so it can't be used to email-bomb a
  // victim with confirmation messages.
  it('rejects POST /yahrzeit/email from a cross-site Origin', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .set('Origin', 'https://evil.example.com')
        .type('form')
        .send({em: 'victim@example.com', ulid: CALENDAR_ID, type: 'Yahrzeit'});
    expect(response.status).toBe(403);
  });

  it('rejects POST /email/ from a cross-site Origin', async () => {
    const response = await request(server)
        .post('/email/')
        .set('Origin', 'https://evil.example.com')
        .type('form')
        .send({v: '1', cfg: 'json', em: 'victim@example.com'});
    expect(response.status).toBe(403);
  });

  it('rejects POST /yahrzeit/search from a cross-site Origin', async () => {
    const response = await request(server)
        .post('/yahrzeit/search')
        .set('Origin', 'https://evil.example.com')
        .type('form')
        .send({em: 'victim@example.com'});
    expect(response.status).toBe(403);
  });

  it('rejects a look-alike Origin (suffix attack)', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .set('Origin', 'https://www.hebcal.com.evil.example.com')
        .type('form')
        .send({});
    expect(response.status).toBe(403);
  });

  it('rejects an opaque "null" Origin', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .set('Origin', 'null')
        .type('form')
        .send({});
    expect(response.status).toBe(403);
  });

  it('allows POST /yahrzeit/email from the hebcal.com Origin', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .set('Origin', 'https://www.hebcal.com')
        .type('form')
        .send({});
    // passes the CSRF gate; 400 here is the normal missing-field response
    expect(response.status).not.toBe(403);
  });

  it('allows POST with no Origin (RFC 8058 one-click unsubscribe, non-browser)', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send({});
    expect(response.status).not.toBe(403);
  });
});

describe('Shabbat Email Verification Routes', () => {
  it('should handle /email/verify.php with token', async () => {
    const response = await request(server)
        .get('/email/verify.php?3fb9stfc55da9afel3aecdca');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('should return 400 for /email/verify.php with invalid token', async () => {
    const response = await request(server)
        .get('/email/verify.php?bogus');
    expect(response.status).toBe(400);
  });

  it('should return 404 for /email/verify.php with not-found token', async () => {
    const response = await request(server)
        .get('/email/verify.php?4rn3dorohk2w7buwmm80uxx6');
    expect(response.status).toBe(404);
  });

  it('GET /email base64 decodes arg', async () => {
    const response = await request(server)
        .get('/email?e=bm9ib2R5QGV4YW1wbGUuY29t');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('nobody@example.com');
  });
});

describe('Email tracking pixel Routes', () => {
  it('should handle /email/open tracking pixel', async () => {
    const response = await request(server)
        .get('/email/open?msgid=01jthv2t5k88yermamssn96pze.1746503035074&loc=Boston');
    expect(response.status).toBe(200);
    expect(response.type).toContain('gif');
  });
});


describe('Yahrzeit Email Verification', () => {
  it.skip('displays verify page for a pending subscription', async () => {
    const response = await request(server)
        .get(`/yahrzeit/verify/${PENDING_SUB_ID}`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // Should show confirmation prompt with the subscriber's email
    expect(response.text).toContain('pending@example.com');
  });

  it('rejects verify request with token shorter than 26 chars', async () => {
    const response = await request(server)
        .get('/yahrzeit/verify/tooshort');
    expect(response.status).toBe(400);
  });

  it('returns 404 when verify token does not exist in DB', async () => {
    // Valid 26-char ULID that has no subscription in mock
    const response = await request(server)
        .get('/yahrzeit/verify/01jthv2t5k88yermamssunknwn');
    expect(response.status).toBe(404);
  });

  it.skip('confirms subscription when commit=1 is supplied', async () => {
    const response = await request(server)
        .get(`/yahrzeit/verify/${PENDING_SUB_ID}?commit=1`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    // The confirmation page should reflect the confirmed state
    expect(response.text).toContain('pending@example.com');
  });
});

describe('Yahrzeit Email Signup and Verify Flow', () => {
  it('signs up, verifies, then reports already-verified on re-visit', async () => {
    const email = 'flowtest@example.com';

    // 1. Sign up: creates a new pending subscription
    const signup = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=${email}&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(signup.status).toBe(200);
    expect(signup.type).toContain('json');
    expect(signup.body).toMatchObject({ok: true});

    // The subscription id is generated server-side; find it in the mock
    const subs = app.context.mysql.mockData.yahrzeitEmailSubs;
    const sub = Object.values(subs)
        .find((r) => r.email_addr === email && r.calendar_id === CALENDAR_ID);
    expect(sub).toBeDefined();
    expect(sub.sub_status).toBe('pending');
    const subId = sub.id;

    // 2. Verify page for the pending subscription shows the confirm form
    const pendingPage = await request(server)
        .get(`/yahrzeit/verify/${subId}`);
    expect(pendingPage.status).toBe(200);
    expect(pendingPage.type).toContain('html');
    expect(pendingPage.text).toContain(email);
    expect(pendingPage.text).toContain('Confirm');
    expect(pendingPage.text).not.toContain('already verified');

    // 3. Confirm the subscription
    const confirmed = await request(server)
        .post(`/yahrzeit/verify/${subId}`)
        .type('form')
        .send('commit=1');
    expect(confirmed.status).toBe(200);
    expect(confirmed.type).toContain('html');
    expect(confirmed.text).toContain('now active');
    expect(subs[subId].sub_status).toBe('active');

    // 4. Re-visiting the verify page reports the email is already verified
    const alreadyVerified = await request(server)
        .get(`/yahrzeit/verify/${subId}`);
    expect(alreadyVerified.status).toBe(200);
    expect(alreadyVerified.type).toContain('html');
    expect(alreadyVerified.text).toContain('Email already verified');
    expect(alreadyVerified.text).toContain('Edit calendar');
  });
});

describe('Yahrzeit Email Search', () => {
  it('renders not-found page when em param is missing', async () => {
    const response = await request(server)
        .get('/yahrzeit/search');
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('returns 400 and not-found page for invalid email address', async () => {
    const response = await request(server)
        .get('/yahrzeit/search?em=not-an-email');
    expect(response.status).toBe(400);
    expect(response.type).toContain('html');
  });

  it('returns 404 when email has no active subscriptions', async () => {
    const response = await request(server)
        .post('/yahrzeit/search')
        .type('form')
        .send('em=nobody@example.com');
    // nobody@example.com has shabbat email but no yahrzeit subscription
    expect(response.status).toBe(404);
    expect(response.type).toContain('html');
  });

  it.skip('sends search results for an email with active subscriptions', async () => {
    const response = await request(server)
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
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(400);
  });

  it('returns 400 when ulid param is missing', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send('em=new@example.com&type=Yahrzeit');
    expect(response.status).toBe(400);
  });

  it('returns 400 when type param is missing', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=new@example.com&ulid=${CALENDAR_ID}`);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid email address', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=not-valid&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(400);
  });

  it('returns 404 when calendar id does not exist in DB', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send('em=new@example.com&ulid=01jthv2t5k88yermamsunknwn1&type=Yahrzeit');
    expect(response.status).toBe(404);
  });

  it('creates a new pending subscription for a new email', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=brandnew@example.com&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });

  it.skip('returns alreadySubscribed flag for an already-active subscriber', async () => {
    const response = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send(`em=active@example.com&ulid=${CALENDAR_ID}&type=Yahrzeit`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true, alreadySubscribed: true});
  });

  it('re-subscribes a previously pending subscriber', async () => {
    const response = await request(server)
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
    const response = await request(server)
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('active@example.com');
  });

  it.skip('completes unsubscribe for num=all with commit=1', async () => {
    const response = await request(server)
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&commit=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
    expect(response.text).toContain('active@example.com');
  });

  it('returns JSON ok response for unsubscribe with cfg=json', async () => {
    const response = await request(server)
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=all&unsubscribe=1&commit=1&cfg=json`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });

  it.skip('shows pre-unsubscribe page for individual entry (num=1) without commit', async () => {
    const response = await request(server)
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=1&unsubscribe=1&cfg=html`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('html');
  });

  it('completes individual entry unsubscribe with commit=1 and cfg=json', async () => {
    const response = await request(server)
        .get(`/yahrzeit/email?id=${ACTIVE_SUB_ID}&num=1&unsubscribe=1&commit=1&cfg=json`);
    expect(response.status).toBe(200);
    expect(response.type).toContain('json');
    expect(response.body).toMatchObject({ok: true});
  });
});
