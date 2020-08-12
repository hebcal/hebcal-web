/* eslint-disable require-jsdoc */
import {getLocationFromQuery, processCookieAndQuery, tooltipScript, typeaheadScript} from './common';
import {makeDb} from './makedb';
import nodemailer from 'nodemailer';
import randomBigInt from 'random-bigint';

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
      ctx.state.emailAddress = q.em;
      const ok = await unsubscribe(ctx, q.em);
      if (ok) {
        return ctx.render('email-unsubscribe');
      }
    } else if (q.modify === '1' && !location) {
      ctx.state.message = 'Please enter your location.';
    } else if (q.modify === '1' && !ctx.state.message) {
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

function validateEmail(email) {
  // eslint-disable-next-line max-len
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
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

function getIpAddress(ctx) {
  return ctx.request.headers['x-client-ip'] || ctx.request.ip;
}

async function getSubInfo(db, emailAddress) {
  const sql = `
  SELECT email_id, email_address, email_status, email_created,
    email_candles_zipcode, email_candles_city,
    email_candles_geonameid,
    email_candles_havdalah, email_havdalah_tzeit
  FROM hebcal_shabbat_email
  WHERE email_address = ?`;
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
    M: r.email_havdalah_tzeit == 1 ? 'on' : 'off',
    t: r.email_created,
  }, getGeoFromRow(r));
}

async function writeSubInfo(ctx, db, q) {
  const sql = `UPDATE hebcal_shabbat_email
    SET email_status = 'active',
      email_candles_zipcode = ?,
      email_candles_geonameid = ?,
      email_candles_havdalah = ?,
      email_havdalah_tzeit = ?,
      email_ip = ?
    WHERE email_id = ?`;
  await db.query(sql, [
    q.zip || null,
    q.geonameid || null,
    q.m || null,
    q.M === 'on' ? 1 : 0,
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
   email_candles_havdalah, email_havdalah_tzeit,
   ${locationColumn}, email_ip)
  VALUES (?, ?, 'pending', NOW(), ?, ?, ?, ?)`;
  await db.query(sql, [
    subscriptionId,
    q.em,
    q.m || null,
    q.M === 'on' ? 1 : 0,
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

async function mySendMail(ctx, message) {
  message.from = 'Hebcal <shabbat-owner@hebcal.com>';
  message.replyTo = 'no-reply@hebcal.com';
  const ip = getIpAddress(ctx);
  message.headers = message.headers || {};
  message.headers['X-Originating-IP'] = `[${ip}]`;
  // console.log(message);
  const transporter = makeEmailTransport(ctx.iniConfig);
  await transporter.sendMail(message);
  // return Promise.resolve({response: '250 OK', messageId: 'foo'});
}
