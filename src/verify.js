/* eslint-disable require-jsdoc */
import ini from 'ini';
import path from 'path';
import fs from 'fs';
import {getLocationFromQuery} from './common';
import {makeDb} from './makedb';

const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
const iniPath = path.join(iniDir, 'hebcal-dot-com.ini');
const iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

export async function emailVerify(ctx) {
  const success = false;
  const title = success ? 'Email Subscription Confirmed' : 'Confirm Email Subscription';
  const subscriptionId = getSubscriptionId(ctx);
  if (!subscriptionId) {
    ctx.throw(400, 'No subscription confirmation key');
  }
  const db = makeDb(iniConfig);
  const sql = `
SELECT email_id, email_address, email_status, email_created,
  email_candles_zipcode, email_candles_city,
  email_candles_geonameid,
  email_candles_havdalah, email_optin_announce
FROM hebcal_shabbat_email
WHERE hebcal_shabbat_email.email_id = ?`;
  ctx.logger.debug(sql);
  const results = await db.query(sql, subscriptionId);
  db.close();
  if (!results || !results[0]) {
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
  await ctx.render('verify', {
    title: `${title} | Hebcal Jewish Calendar`,
    subscriptionId,
    success,
    emailAddress: row.email_address,
    locationName,
  });
}

function getSubscriptionId(ctx) {
  const subscriptionRe = /^[0-9a-f]{24}$/;
  const k = ctx.request.body ? ctx.request.body.k : ctx.request.query.k;
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
