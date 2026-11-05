/**
 * PayPal Instant Payment Notification (IPN) listener: POST /paypal/ipn.
 *
 * PayPal POSTs one `application/x-www-form-urlencoded` message per payment
 * event (a donation, a refund, a recurring-donation installment, ...). It is
 * not JSON. The protocol, per
 * https://developer.paypal.com/api/nvp-soap/ipn/IPNImplementation/ :
 *
 *   1. PayPal POSTs the message here.
 *   2. We POST the *exact* same body back to PayPal, prefixed with
 *      `cmd=_notify-validate&`. PayPal answers the single word `VERIFIED` or
 *      `INVALID`. This is the only authentication there is: anyone on the
 *      internet can POST a plausible-looking message to this URL.
 *   3. We answer PayPal's original POST with an empty HTTP 200. Anything else
 *      (or no answer) makes PayPal resend the same message, with backoff, for
 *      up to four days. Retries carry the same `ipn_track_id`.
 *
 * We verify and store *before* answering, and answer 503 if either step
 * fails, so a PayPal or MySQL hiccup turns into a PayPal retry instead of a
 * lost donation. A message PayPal says is INVALID, a sandbox message when
 * sandbox is not enabled, or one addressed to some other merchant is answered
 * 200 (so it is not retried) and is not stored.
 *
 * Verified messages are stored whole, as JSON, in `paypal_ipn.payload`, with
 * the fields a thank-you job needs pulled out into columns. See hebcal.sql.
 *
 * Config (`hebcal-dot-com.ini`, all optional):
 *   - `hebcal.paypal.ipn.receiver_email`: comma-separated addresses our PayPal
 *     account receives payments at. When set, messages whose `receiver_email`
 *     is not one of them are dropped.
 *   - `hebcal.paypal.ipn.sandbox`: 1/true/yes/on to accept messages with
 *     `test_ipn=1` (verified against the sandbox). Off by default so the
 *     production table never fills with sandbox test donations.
 */

const VERIFY_URL_LIVE = 'https://ipnpb.paypal.com/cgi-bin/webscr';
const VERIFY_URL_SANDBOX = 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr';

/** Must leave room under useTimeout()'s 8s for the MySQL insert. */
const VERIFY_TIMEOUT_MS = 6000;

/**
 * An IPN is a few KB at most. This only bounds what we are willing to send
 * back to PayPal and store; koa-bodyparser's formLimit already caps the read.
 */
const MAX_BODY_LENGTH = 32 * 1024;

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Hours to add to PayPal's Pacific-time `payment_date` to reach UTC. */
const PACIFIC_OFFSET_HOURS = {PST: 8, PDT: 7};

/**
 * @param {any} value
 * @return {boolean}
 */
function iniFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

/**
 * Decodes one `application/x-www-form-urlencoded` component into a string,
 * using `charset` for the percent-encoded bytes.
 *
 * PayPal encodes the message in the charset named by its own `charset` field,
 * which is `windows-1252` for many older accounts, not UTF-8. A plain
 * `URLSearchParams` would decode `%E9` (é in windows-1252) as U+FFFD.
 * @param {string} str
 * @param {TextDecoder} decoder
 * @return {string}
 */
function decodeComponent(str, decoder) {
  const s = str.replace(/\+/g, ' ');
  if (!s.includes('%')) {
    return s;
  }
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x25 && /^[0-9A-Fa-f]{2}$/.test(s.substring(i + 1, i + 3))) {
      bytes.push(parseInt(s.substring(i + 1, i + 3), 16));
      i += 2;
    } else if (ch < 0x80) {
      bytes.push(ch);
    } else {
      // A urlencoded body should be pure ASCII; pass anything else through
      // as UTF-8 rather than mangling it.
      bytes.push(...Buffer.from(s[i], 'utf8'));
    }
  }
  return decoder.decode(Uint8Array.from(bytes));
}

/**
 * @param {string|undefined} charset
 * @return {TextDecoder}
 */
function makeDecoder(charset) {
  try {
    return new TextDecoder(charset || 'utf-8');
  } catch {
    return new TextDecoder('utf-8'); // unknown label
  }
}

/**
 * Parses a raw IPN body into an object of strings, honouring its `charset`
 * field. Key order is preserved. A repeated key keeps its first value.
 * @param {string} raw
 * @return {Object<string,string>}
 */
export function parseIpnBody(raw) {
  const pairs = raw.split('&').filter((p) => p.length).map((p) => {
    const eq = p.indexOf('=');
    return eq === -1 ? [p, ''] : [p.substring(0, eq), p.substring(eq + 1)];
  });
  const ascii = makeDecoder('utf-8');
  const charsetPair = pairs.find(([k]) => k === 'charset');
  const decoder = makeDecoder(charsetPair && decodeComponent(charsetPair[1], ascii));
  const fields = {};
  for (const [k, v] of pairs) {
    const key = decodeComponent(k, decoder);
    if (!Object.hasOwn(fields, key)) {
      fields[key] = decodeComponent(v, decoder);
    }
  }
  return fields;
}

/**
 * Converts PayPal's `payment_date` (always US Pacific time, e.g.
 * `20:12:59 Jan 13, 2009 PST`) to a UTC MySQL DATETIME string.
 * @param {string|undefined} str
 * @return {string|null} `YYYY-MM-DD HH:MM:SS` in UTC, or null if unparseable
 */
export function parsePaymentDate(str) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2}) ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (PST|PDT)$/
      .exec(String(str ?? '').trim().replace(/\s+/g, ' '));
  if (!m) {
    return null;
  }
  const month = MONTHS[m[4]];
  if (!month) {
    return null;
  }
  const [year, day, hour, min, sec] = [+m[6], +m[5], +m[1], +m[2], +m[3]];
  const localDay = new Date(Date.UTC(year, month - 1, day));
  if (localDay.getUTCMonth() !== month - 1 || hour > 23 || min > 59 || sec > 59) {
    return null; // e.g. Feb 31 or 25:00:00
  }
  const d = new Date(Date.UTC(year, month - 1, day,
      hour + PACIFIC_OFFSET_HOURS[m[7]], min, sec));
  return d.toISOString().substring(0, 19).replace('T', ' ');
}

/**
 * @param {string|undefined} str
 * @return {string|null} a DECIMAL-safe amount like `-18.00`, or null
 */
function parseAmount(str) {
  const s = String(str ?? '').trim();
  return /^-?\d{1,10}(\.\d{1,2})?$/.test(s) ? s : null;
}

/**
 * Trims and truncates to a column width, so a long value can never fail the
 * INSERT under strict mode (which would 503 and make PayPal retry forever).
 * @param {string|undefined} str
 * @param {number} max
 * @return {string|null}
 */
function col(str, max) {
  const s = String(str ?? '').trim();
  return s.length ? s.substring(0, max) : null;
}

/**
 * Picks out the columns we index or that a thank-you message needs.
 * Everything else stays available in the JSON payload.
 * @param {Object<string,string>} f parsed IPN fields
 * @return {Object<string,any>}
 */
export function ipnToRow(f) {
  return {
    ipn_track_id: col(f.ipn_track_id, 64),
    txn_id: col(f.txn_id, 64),
    parent_txn_id: col(f.parent_txn_id, 64),
    txn_type: col(f.txn_type, 64),
    payment_status: col(f.payment_status, 32),
    payment_date: parsePaymentDate(f.payment_date),
    mc_gross: parseAmount(f.mc_gross),
    mc_fee: parseAmount(f.mc_fee),
    mc_currency: col(f.mc_currency, 3),
    first_name: col(f.first_name, 128),
    last_name: col(f.last_name, 128),
    payer_email: col(f.payer_email, 254)?.toLowerCase() ?? null,
    payer_id: col(f.payer_id, 32),
    item_name: col(f.item_name, 255),
    memo: col(f.memo, 1024),
    test_ipn: f.test_ipn === '1' ? 1 : 0,
  };
}

/**
 * Asks PayPal whether `raw` is a message it really sent.
 * @param {string} raw the request body, byte-for-byte as received
 * @param {boolean} sandbox
 * @return {Promise<string>} `VERIFIED`, `INVALID`, or whatever else PayPal said
 * @throws {Error} on a network error, timeout, or non-200 answer
 */
export async function verifyIpn(raw, sandbox) {
  const url = sandbox ? VERIFY_URL_SANDBOX : VERIFY_URL_LIVE;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // PayPal rejects verification requests that carry no User-Agent.
      'User-Agent': 'hebcal-web-ipn-listener',
    },
    body: 'cmd=_notify-validate&' + raw,
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
  if (resp.status !== 200) {
    throw new Error(`PayPal IPN verify answered HTTP ${resp.status}`);
  }
  return (await resp.text()).trim();
}

const INSERT_SQL = `INSERT INTO paypal_ipn
  (received, ipn_track_id, txn_id, parent_txn_id, txn_type, payment_status,
   payment_date, mc_gross, mc_fee, mc_currency, first_name, last_name,
   payer_email, payer_id, item_name, memo, test_ipn, payload)
  VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE id = id`;

/**
 * Answers PayPal with the empty 200 that stops it from resending.
 * @param {import('koa').Context} ctx
 */
function ack(ctx) {
  ctx.status = 200;
  ctx.type = 'text/plain';
  ctx.body = '';
}

/**
 * POST /paypal/ipn
 * @param {import('koa').Context} ctx
 */
export async function paypalIpn(ctx) {
  ctx.set('Cache-Control', 'private, no-store');
  if (ctx.method !== 'POST') {
    ctx.set('Allow', 'POST');
    ctx.throw(405, 'PayPal IPN listener accepts POST only');
  }
  const raw = ctx.request.rawBody;
  if (typeof raw !== 'string' || !raw.includes('=') || raw.length > MAX_BODY_LENGTH) {
    ctx.throw(400, 'Expected an application/x-www-form-urlencoded IPN message');
  }
  const fields = parseIpnBody(raw);
  const summary = {
    ipn_track_id: fields.ipn_track_id,
    txn_id: fields.txn_id,
    txn_type: fields.txn_type,
    payment_status: fields.payment_status,
    mc_gross: fields.mc_gross,
    mc_currency: fields.mc_currency,
  };
  const logger = ctx.logger;
  const iniConfig = ctx.iniConfig || {};
  const sandbox = fields.test_ipn === '1';
  if (sandbox && !iniFlag(iniConfig['hebcal.paypal.ipn.sandbox'])) {
    logger.warn({ipn: summary}, 'PayPal IPN: ignoring sandbox message (test_ipn=1)');
    return ack(ctx);
  }

  let verdict;
  try {
    verdict = await verifyIpn(raw, sandbox);
  } catch (err) {
    logger.error({err, ipn: summary}, 'PayPal IPN: verification request failed');
    ctx.throw(503, 'Could not verify IPN message with PayPal; please retry');
  }
  if (verdict !== 'VERIFIED') {
    logger.warn({ipn: summary, verdict: verdict.substring(0, 64)},
        'PayPal IPN: PayPal did not verify message; dropping');
    return ack(ctx);
  }

  const receivers = String(iniConfig['hebcal.paypal.ipn.receiver_email'] ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length);
  const receiver = String(fields.receiver_email || fields.business || '').toLowerCase();
  if (receivers.length && !receivers.includes(receiver)) {
    logger.warn({ipn: summary, receiver}, 'PayPal IPN: unexpected receiver_email; dropping');
    return ack(ctx);
  }

  const row = ipnToRow(fields);
  const values = [
    row.ipn_track_id, row.txn_id, row.parent_txn_id, row.txn_type,
    row.payment_status, row.payment_date, row.mc_gross, row.mc_fee,
    row.mc_currency, row.first_name, row.last_name, row.payer_email,
    row.payer_id, row.item_name, row.memo, row.test_ipn,
    JSON.stringify(fields),
  ];
  // MysqlDb.query() turns a database error into a 503, which PayPal retries.
  await ctx.mysql.query2(ctx, {sql: INSERT_SQL, values});
  logger.info({ipn: summary}, 'PayPal IPN: stored verified message');
  return ack(ctx);
}
