/* eslint-disable require-jsdoc */
import {getLocationFromQuery, tooltipScript, typeaheadScript} from './common';
import {makeDb} from './makedb';
import {makeEmailTransport} from './email';

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
    db.close();
    ctx.throw(404, `Subscription confirmation key ${subscriptionId} not found`);
  }
  const row = results[0];
  ctx.state.emailAddress = row.email_address;
  const location = getLocationFromQuery(ctx.db, getGeoFromRow(row));
  const confirmed = (query.commit === '1');
  if (confirmed) {
    await updateDbAndEmail(ctx, db);
  }
  db.close();
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
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  await ctx.render('email', {
    title: `Shabbat Candle Lighting Times by Email | Hebcal Jewish Calendar`,
    q,
    xtra_html: tooltipScript + typeaheadScript,
  });
}
