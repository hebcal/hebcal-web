/* eslint-disable require-jsdoc */
import {getLocationFromQuery} from './common';
import {makeDb} from './makedb';

export async function emailVerify(ctx) {
  const query = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = getSubscriptionId(ctx, query);
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
  const q = {};
  if (row.email_candles_zipcode) {
    q.zip = row.email_candles_zipcode;
  } else if (row.email_candles_geonameid) {
    q.geonameid = String(row.email_candles_geonameid);
  } else if (row.email_candles_city) {
    q.city = row.email_candles_city.replace(/\+/g, ' ');
  }
  const location = getLocationFromQuery(ctx.db, q);
  const locationName = location ? location.getName() : 'unknown';
  const success = (query.commit === '1');
  const title = success ? 'Email Subscription Confirmed' : 'Confirm Email Subscription';
  if (success) {
    const ip = ctx.request.headers['x-client-ip'] || ctx.request.ip;
    const sqlUpdate = `UPDATE hebcal_shabbat_email
    SET email_status='active', email_ip='${ip}'
    WHERE email_id = ?`;
    await db.query(sqlUpdate, subscriptionId);
  }
  db.close();
  await ctx.render('verify', {
    title: `${title} | Hebcal Jewish Calendar`,
    subscriptionId,
    success,
    emailAddress: row.email_address,
    locationName,
  });
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
