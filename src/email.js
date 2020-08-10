/* eslint-disable require-jsdoc */
import {getLocationFromQuery, processCookieAndQuery, tooltipScript, typeaheadScript} from './common';
import {makeDb} from './makedb';
import nodemailer from 'nodemailer';

/**
 * @param {Object<string,any>} iniConfig
 * @return {nodemailer.Transporter}
 */
function makeEmailTransport(iniConfig) {
  const transporter = nodemailer.createTransport({
    host: iniConfig['hebcal.email.shabbat.host'],
    port: 465,
    secure: true,
    auth: {
      user: iniConfig['hebcal.email.shabbat.user'],
      pass: iniConfig['hebcal.email.shabbat.password'],
    },
  });
  return transporter;
}

export async function emailVerify(ctx) {
  ctx.set('Cache-Control', 'private');
  const query = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = ctx.state.subscriptionId = getSubscriptionId(ctx, query);
  if (!subscriptionId) {
    ctx.throw(400, 'No subscription confirmation key');
  }
  const db = makeDb(ctx.iniConfig);
  const sql = `
SELECT email_id, email_address, email_status, email_created,
  email_candles_zipcode, email_candles_city,
  email_candles_geonameid,
  email_candles_havdalah, email_optin_announce
FROM hebcal_shabbat_email
WHERE hebcal_shabbat_email.email_id = ?`;
  const results = await db.query(sql, subscriptionId);
  if (!results || !results[0]) {
    await db.close();
    ctx.throw(404, `Subscription confirmation key ${subscriptionId} not found`);
  }
  const row = results[0];
  ctx.state.emailAddress = row.email_address;
  const location = getLocationFromQuery(ctx.db, getGeoFromRow(row));
  const confirmed = (query.commit === '1');
  if (confirmed) {
    await updateDbAndEmail(ctx, db);
  }
  await db.close();
  const title = confirmed ? 'Email Subscription Confirmed' : 'Confirm Email Subscription';
  await ctx.render('verify', {
    title: `${title} | Hebcal Jewish Calendar`,
    confirmed,
    locationName: location ? location.getName() : 'unknown',
  });
}

function getGeoFromRow(row) {
  if (row.email_candles_zipcode) {
    return {zip: row.email_candles_zipcode};
  } else if (row.email_candles_geonameid) {
    return {geonameid: String(row.email_candles_geonameid)};
  } else if (row.email_candles_city) {
    return {city: row.email_candles_city.replace(/\+/g, ' ')};
  }
  return {};
}

async function updateDbAndEmail(ctx, db) {
  const sqlUpdate = `UPDATE hebcal_shabbat_email
    SET email_status = 'active', email_ip = ?
    WHERE email_id = ?`;
  const ip = ctx.request.headers['x-client-ip'] || ctx.request.ip;
  const subscriptionId = ctx.state.subscriptionId;
  await db.query(sqlUpdate, [ip, subscriptionId]);

  const unsubAddr = `shabbat-unsubscribe+${subscriptionId}@hebcal.com`;
  const emailAddress = ctx.state.emailAddress;
  const encoded = encodeURIComponent(Buffer.from(emailAddress).toString('base64'));
  const unsubUrl = `https://www.hebcal.com/email/?e=${encoded}`;
  const message = {
    from: 'Hebcal <shabbat-owner@hebcal.com>',
    replyTo: 'no-reply@hebcal.com',
    to: emailAddress,
    subject: 'Your subscription to hebcal is complete',
    text: `Hello,

Your subscription request for hebcal is complete.

You'll receive a maximum of one message per week, typically on Thursday morning.

Regards,
hebcal.com

To modify your subscription or to unsubscribe completely, visit:
${unsubUrl}
`,
    headers: {
      'X-Originating-IP': `[${ip}]`,
      'List-Unsubscribe': `<mailto:${unsubAddr}>`,
    },
  };
  const transporter = makeEmailTransport(ctx.iniConfig);
  // console.log(message);
  // return Promise.resolve({response: '250 OK', messageId: 'foo'});
  return transporter.sendMail(message);
}

function getSubscriptionId(ctx, q) {
  const subscriptionRe = /^[0-9a-f]{24}$/;
  const k = q.k;
  if (typeof k === 'string') {
    if (!k.match(subscriptionRe)) {
      ctx.throw(400, 'Invalid subscription confirmation key');
    }
    return k;
  } else {
    const qs = ctx.request.querystring;
    if (qs.length > 0 && qs.match(subscriptionRe)) {
      return qs;
    }
  }
  return undefined;
}

export async function emailForm(ctx) {
  ctx.set('Cache-Control', 'private');
  const q = processCookieAndQuery(
      ctx.cookies.get('C'),
      {},
      Object.assign({}, ctx.request.body || {}, ctx.request.query),
  );
  let defaultUnsubscribe = false;
  if (typeof q.e === 'string') {
    const buff = Buffer.from(q.e, 'base64');
    q.em = buff.toString('ascii');
    const db = makeDb(ctx.iniConfig);
    const subInfo = await getSubInfo(db, q.em);
    if (subInfo && subInfo.status === 'active') {
      Object.assign(q, subInfo);
    }
    await db.close();
    defaultUnsubscribe = q.unsubscribe === '1';
  }
  let location;
  try {
    location = getLocationFromQuery(ctx.db, q);
  } catch (err) {
    ctx.state.message = err.message;
  }
  q['city-typeahead'] = location ? location.getName() : '';
  ctx.state.title = 'Shabbat Candle Lighting Times by Email | Hebcal Jewish Calendar';
  if (q.v === '1') {
    if (!q.em) {
      ctx.state.message = 'Please enter your email address.';
    } else if (!validateEmail(q.em)) {
      ctx.state.message = `Invalid email address ${q.em}`;
    } else if (q.unsubscribe === '1') {
      const ok = await unsubscribe(ctx, q);
      if (ok) {
        await ctx.render('email-unsubscribe');
        return Promise.resolve(true);
      }
    } else if (q.modify === '1' && !location) {
      ctx.state.message = 'Please enter your location.';
    } else if (q.modify === '1' && !ctx.state.message) {
      await ctx.render('email-success', {
        emailAddress: q.em,
        locationName: location.getName(),
      });
      return Promise.resolve(true);
    }
  }
  await ctx.render('email', {
    q,
    xtra_html: tooltipScript + typeaheadScript,
    defaultUnsubscribe,
  });
}

function validateEmail(email) {
  // eslint-disable-next-line max-len
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

async function unsubscribe(ctx, q) {
  const db = makeDb(ctx.iniConfig);
  const subInfo = await getSubInfo(db, q.em);
  ctx.state.emailAddress = q.em;
  let success;
  if (!subInfo) {
    ctx.state.message = `Sorry, ${q.em} is not currently subscribed`;
    success = false;
  } else if (subInfo.status === 'unsubscribed') {
    ctx.state.success = false;
    success = true;
  } else {
    const sqlUpdate = `UPDATE hebcal_shabbat_email
    SET email_status = 'unsubscribed', email_ip = ?
    WHERE email_address = ?`;
    const ip = ctx.request.headers['x-client-ip'] || ctx.request.ip;
    await db.query(sqlUpdate, [ip, q.em]);
    ctx.state.success = true;
    success = true;
  }
  await db.close();
  return success;
}

async function getSubInfo(db, emailAddress) {
  const sql = `
  SELECT email_id, email_address, email_status, email_created,
    email_candles_zipcode, email_candles_city,
    email_candles_geonameid,
    email_candles_havdalah, email_optin_announce
  FROM hebcal_shabbat_email
  WHERE hebcal_shabbat_email.email_address = ?`;
  const results = await db.query(sql, emailAddress);
  if (!results || !results[0]) {
    return null;
  }
  const r = results[0];
  return Object.assign({
    k: r.email_id,
    em: r.email_address,
    status: r.email_status,
    m: String(r.email_candles_havdalah),
    t: r.email_created,
  }, getGeoFromRow(r));
}
