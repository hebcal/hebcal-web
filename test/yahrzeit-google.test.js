import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';

const server = makeServer(app);
const SECRET = 'yahrzeit-google-secret';
// A calendar the mock DB knows about (see test/mock-mysql.js).
const CAL = '01jthv2t5k88yermamssn96pzf';
// A calendar that already has an email saved (contents.em set).
const SAVED_CAL = '01jthv2t5k88yermamssn96abc';
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
  app.context.iniConfig['hebcal.google.oauth.client_id'] = 'test-client-id';
  app.context.iniConfig['hebcal.google.oauth.client_secret'] = 'test-client-secret';
});

function cookie(sid) {
  return `${SESSION_COOKIE}=${signValue(sid, SECRET)}`;
}

describe('yahrzeit Google sign-in', () => {
  it('shows the Google button in the email modal to anonymous visitors', async () => {
    const res = await request(server).get(`/yahrzeit/edit/${CAL}`);
    expect(res.status).toBe(200);
    // The sign-in must return to the canonical /yahrzeit/edit/<ulid> URL. A GET
    // to /yahrzeit?ulid=<ulid> does NOT load the calendar (makeQuery keys edit
    // detection on query.id, not query.ulid), so guard the exact next value.
    const next = encodeURIComponent(`/yahrzeit/edit/${CAL}`);
    expect(res.text).toContain(`/login/google?next=${next}`);
    expect(res.text).not.toContain('%3Fulid%3D');
    // The modal-toggle Save button is present for anonymous users.
    expect(res.text).toContain('data-bs-target="#email-modal"');
  });

  it('the sign-in next target actually loads the calendar as an edit page', async () => {
    // Follows the same GET path the button sends the user back to.
    const res = await request(server).get(`/yahrzeit/edit/${CAL}`);
    expect(res.status).toBe(200);
    // showDownload is only true on a loaded edit page -> the email/save button
    // and download toolbar are rendered.
    expect(res.text).toContain('#email-modal');
  });

  it('a signed-in Save activates the subscription and redirects with ?saved=1', async () => {
    const sid = 'a'.repeat(32);
    const email = 'yz-user@example.com';
    mysql.seedSession({userId: 'yz1', email, sessionId: sid});
    const res = await request(server)
        .post('/yahrzeit/email')
        .set('Cookie', cookie(sid))
        .type('form')
        .send({v: '1', cfg: 'html', type: 'yahrzeit', ulid: CAL, em: email})
        .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/yahrzeit/edit/${CAL}?saved=1`);
    const sub = Object.values(mysql.mockData.yahrzeitEmailSubs)
        .find((s) => s.email_addr === email && s.calendar_id === CAL);
    expect(sub).toBeTruthy();
    expect(sub.sub_status).toBe('active');
  });

  it('signed-in + unsaved calendar renders the confirmation and a direct (non-modal) Save form', async () => {
    const sid = 'b'.repeat(32);
    mysql.seedSession({userId: 'yz2', email: 'yz2@example.com', sessionId: sid});
    const res = await request(server)
        .get(`/yahrzeit/edit/${CAL}?saved=1`)
        .set('Cookie', cookie(sid));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved to your account');
    // Not-yet-saved calendar -> one-click Save form.
    expect(res.text).toContain('action="/yahrzeit/email"');
  });

  it('signed-in + already-saved calendar uses the standard modal (multi-email), not the direct form', async () => {
    const sid = 'c'.repeat(32);
    mysql.seedSession({userId: 'yz3', email: 'yz3@example.com', sessionId: sid});
    const res = await request(server)
        .get(`/yahrzeit/edit/${SAVED_CAL}`)
        .set('Cookie', cookie(sid));
    expect(res.status).toBe(200);
    // Already saved (contents.em set): the toolbar opens the standard dialog so
    // additional email addresses can subscribe to the same calendar.
    expect(res.text).toContain('data-bs-target="#email-modal"');
    expect(res.text).toContain('Email reminders');
    // ...and does NOT render a direct one-click Save form.
    expect(res.text).not.toContain('action="/yahrzeit/email"');
    // The signed-in modal variants + status probe are present (toggled by JS).
    expect(res.text).toContain('id="ye-active"');
    expect(res.text).toContain('id="ye-signin"');
    expect(res.text).toContain('id="ye-subscribe-me"');
    expect(res.text).toContain('id="email-modal-verified"');
    expect(res.text).toContain('/yahrzeit/email-status');
  });

  it('email-status returns loggedIn:false for anonymous', async () => {
    const res = await request(server).get(`/yahrzeit/email-status?ulid=${CAL}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({loggedIn: false});
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('email-status reports subscribedToThisCalendar:true when the signed-in user has an active sub', async () => {
    const sid = 'd'.repeat(32);
    const email = 'owner-yz@example.com';
    mysql.seedSession({userId: 'yz4', email, sessionId: sid});
    mysql.mockData.yahrzeitEmailSubs['yz-owner'] = {
      id: 'yz-owner', email_addr: email, calendar_id: CAL, sub_status: 'active',
    };
    const res = await request(server)
        .get(`/yahrzeit/email-status?ulid=${CAL}`)
        .set('Cookie', cookie(sid));
    expect(res.body).toMatchObject({
      loggedIn: true, email, subscribedToThisCalendar: true,
    });
  });

  it('email-status reports subscribedToThisCalendar:false when the user has no sub here', async () => {
    const sid = 'e'.repeat(32);
    mysql.seedSession({userId: 'yz5', email: 'nosub-yz@example.com', sessionId: sid});
    const res = await request(server)
        .get(`/yahrzeit/email-status?ulid=${CAL}`)
        .set('Cookie', cookie(sid));
    expect(res.body).toMatchObject({loggedIn: true, subscribedToThisCalendar: false});
  });

  it('signed-in one-click subscribe from the modal (cfg=json) activates immediately', async () => {
    const sid = 'f'.repeat(32);
    const email = 'oneclick-yz@example.com';
    mysql.seedSession({userId: 'yz6', email, sessionId: sid});
    const res = await request(server)
        .post('/yahrzeit/email')
        .set('Cookie', cookie(sid))
        .type('form')
        .send({v: '1', cfg: 'json', type: 'yahrzeit', ulid: SAVED_CAL, em: email});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ok: true, verified: true});
    const sub = Object.values(mysql.mockData.yahrzeitEmailSubs)
        .find((s) => s.email_addr === email && s.calendar_id === SAVED_CAL);
    expect(sub.sub_status).toBe('active');
  });

  it('anonymous subscribe still uses the pending + verification flow', async () => {
    const res = await request(server)
        .post('/yahrzeit/email')
        .type('form')
        .send({v: '1', cfg: 'json', type: 'yahrzeit', ulid: CAL, em: 'anon-yz@example.com'});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ok: true});
    expect(res.body.verified).toBeUndefined();
    const sub = Object.values(mysql.mockData.yahrzeitEmailSubs)
        .find((s) => s.email_addr === 'anon-yz@example.com');
    expect(sub.sub_status).toBe('pending');
  });
});
