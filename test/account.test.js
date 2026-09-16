import {describe, it, expect, beforeAll} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {MockMysqlDb} from './mock-mysql.js';
import {makeServer} from './testServer.js';
import {signValue, SESSION_COOKIE} from '../src/session.js';

const server = makeServer(app);
const SECRET = 'account-secret';
let mysql;

beforeAll(() => {
  mysql = new MockMysqlDb();
  app.context.mysql = mysql;
  app.context.iniConfig['hebcal.session.secret'] = SECRET;
});

function cookie(sid) {
  return `${SESSION_COOKIE}=${signValue(sid, SECRET)}`;
}

describe('/account subscriptions', () => {
  it('lists Shabbat and Yahrzeit subscriptions for the signed-in user', async () => {
    const sid = 'a'.repeat(32);
    const email = 'subscriber@example.com';
    mysql.seedSession({userId: 'acc1', email, sessionId: sid});
    mysql.mockData.subscriptions['sub-shab-1'] = {
      email_id: 'sub-shab-1', email_address: email, email_status: 'active',
      email_candles_geonameid: 293397, email_created: new Date(),
    };
    mysql.mockData.emailsByAddress[email] = 'sub-shab-1';
    mysql.mockData.yahrzeitEmailSubs['yz-1'] = {
      id: 'yz-1', email_addr: email,
      calendar_id: '01jthv2t5k88yermamssn96pzf', sub_status: 'active',
    };
    const res = await request(server).get('/account').set('Cookie', cookie(sid));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain('Shabbat candle-lighting');
    expect(res.text).toContain('Manage subscription');
    // The manage link deep-links into /email with the base64 `e` param so the
    // form pre-fills this subscriber's saved settings.
    const eParam = encodeURIComponent(Buffer.from(email).toString('base64'));
    expect(res.text).toContain(`/email?e=${eParam}`);
    // Pre-unsubscribe confirmation link for the active Shabbat subscription.
    expect(res.text).toContain(`/email?e=${eParam}&amp;unsubscribe=1&amp;cfg=html`);
    expect(res.text).toContain('Yahrzeit + Anniversary Calendars');
    expect(res.text).toContain('/yahrzeit/edit/01jthv2t5k88yermamssn96pzf');
    // Each calendar row has an unsubscribe link keyed by the yahrzeit_email id.
    expect(res.text).toContain('/yahrzeit/email?id=yz-1&amp;num=all&amp;unsubscribe=1');
  });

  it('shows empty states when the user has no subscriptions', async () => {
    const sid = 'b'.repeat(32);
    mysql.seedSession({userId: 'acc2', email: 'nobody-here@example.com', sessionId: sid});
    const res = await request(server).get('/account').set('Cookie', cookie(sid));
    expect(res.status).toBe(200);
    expect(res.text).toContain('No subscription found');
    expect(res.text).toContain('no active reminders');
  });
});
