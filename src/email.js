/* eslint-disable require-jsdoc */
import {makeDb} from './makedb';
import randomBigInt from 'random-bigint';
import {getIpAddress, getLocationFromQuery, processCookieAndQuery, tooltipScript,
  typeaheadScript, validateEmail} from './common';
import {mySendMail} from './common2';

export async function emailVerify(ctx) {
  ctx.set('Cache-Control', 'private');
  const query = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = ctx.state.subscriptionId = getSubscriptionId(ctx, query);
  if (!subscriptionId) {
    ctx.throw(400, 'No subscription confirmation key');
  }
  const db = makeDb(ctx.iniConfig);
  const sql = `
SELECT email_address, email_candles_zipcode, email_candles_city, email_candles_geonameid
FROM hebcal_shabbat_email
WHERE email_id = ?`;
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
  const sql = `UPDATE hebcal_shabbat_email
    SET email_status = 'active', email_ip = ?
    WHERE email_id = ?`;
  const ip = getIpAddress(ctx);
  const subscriptionId = ctx.state.subscriptionId;
  await db.query(sql, [ip, subscriptionId]);

  const unsubAddr = `shabbat-unsubscribe+${subscriptionId}@hebcal.com`;
  const emailAddress = ctx.state.emailAddress;
  const unsubUrl = getUnsubUrl(emailAddress);
  const message = {
    to: emailAddress,
    subject: 'Your subscription to hebcal is complete',
    headers: {
      'List-Unsubscribe': `<mailto:${unsubAddr}>`,
    },
    text: `Hello,

Your subscription request for hebcal is complete.

You'll receive a maximum of one message per week, typically on Thursday morning.

Regards,
hebcal.com

To modify your subscription or to unsubscribe completely, visit:
${unsubUrl}
`,
  };
  await mySendMail(ctx, message);
}

function getUnsubUrl(emailAddress) {
  const encoded = encodeURIComponent(Buffer.from(emailAddress).toString('base64'));
  const unsubUrl = `https://www.hebcal.com/email?e=${encoded}`;
  return unsubUrl;
}

function getSubscriptionId(ctx, q) {
  const subscriptionRe = /^[0-9a-z]{24}$/;
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
  let q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
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
  } else {
    q = processCookieAndQuery(ctx.cookies.get('C'), {}, q);
  }
  let location;
  try {
    location = getLocationFromQuery(ctx.db, q);
  } catch (err) {
    ctx.state.message = err.message;
    ctx.status = err.status;
  }
  q['city-typeahead'] = location ? location.getName() : '';
  ctx.state.title = 'Shabbat Candle Lighting Times by Email | Hebcal Jewish Calendar';
  if (q.v === '1') {
    if (!q.em) {
      ctx.state.message = 'Please enter your email address.';
      ctx.status = 400;
    } else if (!validateEmail(q.em)) {
      ctx.state.message = `Invalid email address ${q.em}`;
      ctx.status = 400;
    } else if (q.unsubscribe === '1') {
      ctx.state.emailAddress = q.em;
      const ok = await unsubscribe(ctx, q.em);
      if (ok) {
        return ctx.render('email-unsubscribe');
      }
    } else if (q.modify === '1' && !location) {
      ctx.state.message = 'Please enter your location.';
      ctx.status = 400;
    } else if (q.modify === '1' && !ctx.state.message) {
      if (q.M === 'on') {
        delete q.m;
      }
      const db = makeDb(ctx.iniConfig);
      if (typeof q.prev === 'string' && q.prev != q.em) {
        const subInfo = await getSubInfo(db, q.prev);
        if (subInfo && subInfo.status === 'active') {
          await unsubscribe(ctx, q.prev, subInfo);
        }
      }
      ctx.state.emailAddress = q.em;
      ctx.state.locationName = location.getName();
      // check if email address already verified
      const subInfo = await getSubInfo(db, q.em);
      if (subInfo && typeof subInfo.k === 'string') {
        ctx.state.subscriptionId = subInfo.k;
      }
      if (subInfo && subInfo.status === 'active') {
        await updateActiveSub(ctx, db, q);
        db.close();
        return ctx.render('email-success', {
          updated: true,
        });
      }
      await writeStagingInfo(ctx, db, q);
      db.close();
      return ctx.render('email-success', {
        updated: false,
      });
    }
  }
  await ctx.render('email', {
    q,
    xtra_html: tooltipScript + typeaheadScript,
    defaultUnsubscribe,
  });
}

async function updateActiveSub(ctx, db, q) {
  await writeSubInfo(ctx, db, q);
  const emailAddress = ctx.state.emailAddress;
  const unsubUrl = getUnsubUrl(emailAddress);
  const subscriptionId = ctx.state.subscriptionId;
  const unsubAddr = `shabbat-unsubscribe+${subscriptionId}@hebcal.com`;
  const message = {
    to: emailAddress,
    subject: 'Your subscription to hebcal is updated',
    headers: {
      'List-Unsubscribe': `<mailto:${unsubAddr}>`,
    },
    text: `Hello,

We have updated your weekly Shabbat candle lighting time subscription for ${ctx.state.locationName}.

Regards,
hebcal.com

To modify your subscription or to unsubscribe completely, visit:
${unsubUrl}
`,
  };
  await mySendMail(ctx, message);
}

async function unsubscribe(ctx, emailAddress, subInfo) {
  const db = makeDb(ctx.iniConfig);
  subInfo = subInfo || await getSubInfo(db, emailAddress);
  let success;
  if (!subInfo) {
    ctx.state.message = `Sorry, ${emailAddress} is not currently subscribed`;
    success = false;
  } else if (subInfo.status === 'unsubscribed') {
    ctx.state.success = false;
    success = true;
  } else {
    const sql = `UPDATE hebcal_shabbat_email
    SET email_status = 'unsubscribed', email_ip = ?
    WHERE email_address = ?`;
    const ip = getIpAddress(ctx);
    await db.query(sql, [ip, emailAddress]);
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
    email_candles_havdalah, email_havdalah_tzeit, email_sundown_candles
  FROM hebcal_shabbat_email
  WHERE email_address = ?`;
  const results = await db.query(sql, emailAddress);
  if (!results || !results[0]) {
    return null;
  }
  const r = results[0];
  const m = r.email_candles_havdalah === null ? null : String(r.email_candles_havdalah);
  return Object.assign({
    k: r.email_id,
    em: r.email_address,
    status: r.email_status,
    m: m,
    M: r.email_havdalah_tzeit == 1 ? 'on' : 'off',
    t: r.email_created,
    b: r.email_sundown_candles,
  }, getGeoFromRow(r));
}

async function writeSubInfo(ctx, db, q) {
  const sql = `UPDATE hebcal_shabbat_email
    SET email_status = 'active',
      email_candles_zipcode = ?,
      email_candles_geonameid = ?,
      email_candles_havdalah = ?,
      email_havdalah_tzeit = ?,
      email_sundown_candles = ?,
      email_ip = ?
    WHERE email_id = ?`;
  await db.query(sql, [
    q.zip || null,
    q.geonameid || null,
    q.m || null,
    q.M === 'on' ? 1 : 0,
    q.b || 18,
    getIpAddress(ctx),
    ctx.state.subscriptionId,
  ]);
}

function makeSubscriptionId(ctx) {
  if (ctx.state.subscriptionId) {
    return ctx.state.subscriptionId;
  }
  return randomBigInt(80).toString(36).padStart(16, '0') + Date.now().toString(36);
}

async function writeStagingInfo(ctx, db, q) {
  const ip = getIpAddress(ctx);
  const subscriptionId = ctx.state.subscriptionId = makeSubscriptionId(ctx);
  const locationColumn = q.zip ? 'email_candles_zipcode' : 'email_candles_geonameid';
  const locationValue = q.zip ? q.zip : q.geonameid;
  const sql = `REPLACE INTO hebcal_shabbat_email
  (email_id, email_address, email_status, email_created,
   email_candles_havdalah, email_havdalah_tzeit, email_sundown_candles,
   ${locationColumn}, email_ip)
  VALUES (?, ?, 'pending', NOW(), ?, ?, ?, ?, ?)`;
  await db.query(sql, [
    subscriptionId,
    q.em,
    q.m || null,
    q.M === 'on' ? 1 : 0,
    q.b || 18,
    locationValue,
    ip,
  ]);
  const url = `https://www.hebcal.com/email/verify.php?${subscriptionId}`;
  const locationName = ctx.state.locationName;
  const message = {
    to: q.em,
    subject: 'Please confirm your request to subscribe to hebcal',
    html: `<div dir="ltr">
<div>Hello,</div>
<div><br></div>
<div>We have received your request to receive weekly Shabbat
candle lighting time information from hebcal.com for
${locationName}.</div>
<div><br></div>
<div>Please confirm your request by clicking on this link:</div>
<div><br></div>
<div><a href="${url}">${url}</a></div>
<div><br></div>
<div>If you did not request (or do not want) weekly Shabbat
candle lighting time information, please accept our
apologies and ignore this message.</div>
<div><br></div>
<div>Regards,
<br>hebcal.com</div>
<div><br></div>
<div>[${ip}]</div>
</div>
`,
  };
  await mySendMail(ctx, message);
}
