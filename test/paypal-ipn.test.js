import {describe, it, expect, beforeAll, beforeEach, afterEach, vi} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';
import {parseIpnBody, parsePaymentDate, ipnToRow} from '../src/paypal-ipn.js';

const server = makeServer(app);

// A donate-button IPN in the shape PayPal sends, from a windows-1252 account:
// %E9 is "é" in windows-1252 (in UTF-8 it would be %C3%A9).
const DONATION = [
  'mc_gross=18.00', 'protection_eligibility=Eligible', 'payer_id=LPLWNMTBWMFAY',
  'payment_date=20%3A12%3A59+Jan+13%2C+2026+PST', 'payment_status=Completed',
  'charset=windows-1252', 'first_name=Ren%E9e', 'mc_fee=0.88',
  'notify_version=3.9', 'custom=', 'payer_status=verified',
  'business=donate%40hebcal.com', 'quantity=0', 'payer_email=Renee%40Example.com',
  'txn_id=61E67681CH3238416', 'payment_type=instant', 'last_name=Cohen',
  'receiver_email=donate%40hebcal.com', 'payment_fee=0.88',
  'receiver_id=S8XGHLYDW9T3S', 'txn_type=web_accept',
  'item_name=Donation+to+Hebcal.com', 'mc_currency=USD', 'item_number=',
  'residence_country=US', 'memo=Todah+rabah%21', 'handling_amount=0.00',
  'transaction_subject=', 'payment_gross=18.00', 'shipping=0.00',
  'ipn_track_id=b4c7e1a2f3d01',
].join('&');

/** Records every query; enough MysqlDb surface for the handler. */
class RecordingDb {
  constructor() {
    this.calls = [];
    this.fail = false;
  }
  async query(opts) {
    if (this.fail) {
      const err = new Error('db down');
      err.status = 503;
      throw err;
    }
    this.calls.push(opts);
    return {affectedRows: 1};
  }
  async query2(ctx, opts) {
    return this.query(opts);
  }
}

let db;
let fetchSpy;

/** @param {string} answer */
function paypalSays(answer, status = 200) {
  fetchSpy.mockImplementation(async () => new Response(answer, {status}));
}

function postIpn(body = DONATION) {
  return request(server)
      .post('/paypal/ipn')
      .set('Content-Type', 'application/x-www-form-urlencoded; charset=windows-1252')
      .send(body);
}

beforeAll(() => {
  db = new RecordingDb();
  app.context.mysql = db;
});

beforeEach(() => {
  db.calls = [];
  db.fail = false;
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  delete app.context.iniConfig['hebcal.paypal.ipn.receiver_email'];
  delete app.context.iniConfig['hebcal.paypal.ipn.sandbox'];
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('parsePaymentDate', () => {
  it('converts Pacific standard and daylight time to UTC', () => {
    expect(parsePaymentDate('20:12:59 Jan 13, 2026 PST')).toBe('2026-01-14 04:12:59');
    expect(parsePaymentDate('09:05:00 Jul 4, 2026 PDT')).toBe('2026-07-04 16:05:00');
  });
  it('rejects garbage and impossible dates', () => {
    expect(parsePaymentDate(undefined)).toBeNull();
    expect(parsePaymentDate('2026-01-13T20:12:59Z')).toBeNull();
    expect(parsePaymentDate('10:00:00 Feb 31, 2026 PST')).toBeNull();
    expect(parsePaymentDate('25:00:00 Feb 1, 2026 PST')).toBeNull();
  });
});

describe('parseIpnBody', () => {
  it('decodes values in the message charset', () => {
    const f = parseIpnBody(DONATION);
    expect(f.first_name).toBe('Renée');
    expect(f.payer_email).toBe('Renee@Example.com');
    expect(f.item_name).toBe('Donation to Hebcal.com');
    expect(f.custom).toBe('');
  });
  it('decodes UTF-8 messages', () => {
    expect(parseIpnBody('charset=UTF-8&first_name=Ren%C3%A9e').first_name).toBe('Renée');
  });
  it('falls back to UTF-8 for an unknown charset', () => {
    expect(parseIpnBody('charset=bogus&first_name=Ren%C3%A9e').first_name).toBe('Renée');
  });
});

describe('ipnToRow', () => {
  it('extracts the columns', () => {
    const row = ipnToRow(parseIpnBody(DONATION));
    expect(row).toMatchObject({
      ipn_track_id: 'b4c7e1a2f3d01',
      txn_id: '61E67681CH3238416',
      txn_type: 'web_accept',
      payment_status: 'Completed',
      payment_date: '2026-01-14 04:12:59',
      mc_gross: '18.00',
      mc_fee: '0.88',
      mc_currency: 'USD',
      first_name: 'Renée',
      last_name: 'Cohen',
      payer_email: 'renee@example.com',
      memo: 'Todah rabah!',
      parent_txn_id: null,
      test_ipn: 0,
    });
  });
  it('keeps refunds negative and drops malformed amounts', () => {
    expect(ipnToRow({mc_gross: '-18.00'}).mc_gross).toBe('-18.00');
    expect(ipnToRow({mc_gross: '18.00; DROP TABLE'}).mc_gross).toBeNull();
  });
});

describe('POST /paypal/ipn', () => {
  it('verifies with PayPal, stores, and answers an empty 200', async () => {
    paypalSays('VERIFIED');
    const res = await postIpn();
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(res.headers['cache-control']).toBe('private, no-store');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://ipnpb.paypal.com/cgi-bin/webscr');
    // Echoed back byte-for-byte, so the windows-1252 %E9 survives.
    expect(init.body).toBe('cmd=_notify-validate&' + DONATION);
    expect(init.headers['User-Agent']).toBeTruthy();

    expect(db.calls).toHaveLength(1);
    const {sql, values} = db.calls[0];
    expect(sql).toContain('INSERT INTO paypal_ipn');
    expect(values).toContain('61E67681CH3238416');
    expect(values).toContain('Renée');
    const payload = JSON.parse(values.at(-1));
    expect(payload.receiver_id).toBe('S8XGHLYDW9T3S');
    expect(Object.keys(payload)[0]).toBe('mc_gross');
  });

  it('does not store a message PayPal calls INVALID', async () => {
    paypalSays('INVALID');
    const res = await postIpn();
    expect(res.status).toBe(200);
    expect(db.calls).toHaveLength(0);
  });

  it('answers 503 so PayPal retries when verification is unreachable', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    const res = await postIpn();
    expect(res.status).toBe(503);
    expect(db.calls).toHaveLength(0);
  });

  it('answers 503 when PayPal verification returns an HTTP error', async () => {
    paypalSays('oops', 500);
    expect((await postIpn()).status).toBe(503);
  });

  it('answers 503 so PayPal retries when the insert fails', async () => {
    paypalSays('VERIFIED');
    db.fail = true;
    expect((await postIpn()).status).toBe(503);
  });

  it('ignores sandbox messages unless enabled', async () => {
    paypalSays('VERIFIED');
    const body = DONATION + '&test_ipn=1';
    let res = await postIpn(body);
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(0);

    app.context.iniConfig['hebcal.paypal.ipn.sandbox'] = 'on';
    res = await postIpn(body);
    expect(res.status).toBe(200);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ipnpb.sandbox.paypal.com/cgi-bin/webscr');
    expect(db.calls).toHaveLength(1);
  });

  it('drops messages for another receiver when receiver_email is configured', async () => {
    paypalSays('VERIFIED');
    app.context.iniConfig['hebcal.paypal.ipn.receiver_email'] = 'someone@else.com';
    expect((await postIpn()).status).toBe(200);
    expect(db.calls).toHaveLength(0);

    app.context.iniConfig['hebcal.paypal.ipn.receiver_email'] = 'paypal@hebcal.com, Donate@Hebcal.com';
    expect((await postIpn()).status).toBe(200);
    expect(db.calls).toHaveLength(1);
  });

  it('rejects an empty body and GET', async () => {
    expect((await postIpn('')).status).toBe(400);
    const res = await request(server).get('/paypal/ipn');
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
