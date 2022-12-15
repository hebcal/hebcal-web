/* eslint-disable require-jsdoc */
import randomBigInt from 'random-bigint';
import {getIpAddress, getLocationFromQuery, processCookieAndQuery,
  validateEmail, queryDefaultCandleMins} from './common';
import {mySendMail, getImgOpenHtml} from './common2';
import {matomoTrack} from './matomoTrack';

const BLANK = '<div>&nbsp;</div>';
const UTM_PARAM = 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=shabbat-txn';

export async function emailVerify(ctx) {
  ctx.set('Cache-Control', 'private');
  const query = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = ctx.state.subscriptionId = getSubscriptionId(ctx, query);
  if (!subscriptionId) {
    ctx.throw(400, 'No subscription confirmation key');
  }
  const db = ctx.mysql;
  const sql = `
SELECT email_address, email_candles_zipcode, email_candles_city, email_candles_geonameid
FROM hebcal_shabbat_email
WHERE email_id = ?`;
  const results = await db.query(sql, subscriptionId);
  if (!results || !results[0]) {
    ctx.throw(404, `Subscription confirmation key ${subscriptionId} not found`);
  }
  const row = results[0];
  ctx.state.emailAddress = row.email_address;
  const location = getLocationFromQuery(ctx.db, getGeoFromRow(row));
  ctx.state.locationName = location.getName();
  const confirmed = (query.commit === '1');
  if (confirmed) {
    await updateDbAndEmail(ctx, db);
  }
  const title = confirmed ? 'Shabbat Email Subscription Confirmed' : 'Confirm Shabbat Email Subscription';
  await ctx.render('verify', {
    title: `${title} - Hebcal`,
    confirmed,
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

/**
 * @param {string} emailAddress
 * @return {string}
 */
function makeFooter(emailAddress) {
  const unsubUrl = getUnsubUrl(emailAddress);
  return `<div style="font-size:11px;color:#999;font-family:arial,helvetica,sans-serif">
<div>This email was sent to ${emailAddress} by <a href="https://www.hebcal.com/?${UTM_PARAM}">Hebcal.com</a>.
Hebcal is a free Jewish calendar and holiday web site.</div>
${BLANK}
<div><a href="${unsubUrl}&amp;unsubscribe=1&amp;cfg=html&amp;${UTM_PARAM}">Unsubscribe</a> |
<a href="${unsubUrl}&amp;modify=1&amp;cfg=html&amp;${UTM_PARAM}">Update Settings</a> |
<a href="https://www.hebcal.com/home/about/privacy-policy?${UTM_PARAM}">Privacy Policy</a></div>
</div>`;
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
  const locationName = ctx.state.locationName;
  const msgid = `${subscriptionId}.${Date.now()}`;
  const imgOpen = getImgOpenHtml(msgid, encodeURIComponent(locationName), 'shabbat-complete');
  const footerHtml = makeFooter(emailAddress);
  const message = {
    to: emailAddress,
    subject: 'Your subscription to Hebcal is complete',
    headers: {
      'List-Unsubscribe': `<mailto:${unsubAddr}>`,
    },
    messageId: `<${msgid}@hebcal.com>`,
    html: `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>Your subscription request for Shabbat candle-lighting times from Hebcal is complete.</div>
${BLANK}
<div>You'll receive a maximum of one message per week, typically on Thursday morning.</div>
${BLANK}
<div style="font-size:16px">Kol Tuv,
<br>Hebcal.com</div>
${BLANK}
${footerHtml}
${imgOpen}</div>
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
    const db = ctx.mysql;
    const subInfo = await getSubInfo(db, q.em);
    if (subInfo && subInfo.status === 'active') {
      Object.assign(q, subInfo);
    }
    defaultUnsubscribe = q.unsubscribe === '1';
  } else {
    q = processCookieAndQuery(ctx.cookies.get('C'), {}, q);
  }
  const isJSON = q.cfg === 'json';
  if (isJSON) {
    ctx.response.type = ctx.request.header['accept'] = 'application/json';
  }
  let location;
  try {
    location = getLocationFromQuery(ctx.db, q);
  } catch (err) {
    if (isJSON) {
      ctx.throw(err.status, err.message);
    }
    ctx.state.message = err.message;
    ctx.status = err.status || 400;
  }
  q['city-typeahead'] = location && location.geo !== 'pos' ? location.getName() : '';
  ctx.state.title = 'Shabbat Candle-lighting Times by Email - Hebcal';
  if (q.v === '1') {
    if (!q.em) {
      ctx.state.message = 'Please enter your email address.';
      ctx.status = 400;
      if (isJSON) {
        ctx.throw(ctx.status, ctx.state.message);
      }
    } else if (!validateEmail(q.em)) {
      ctx.state.message = `Invalid email address ${q.em}`;
      ctx.status = 400;
      if (isJSON) {
        ctx.throw(ctx.status, ctx.state.message);
      }
    } else if (q.unsubscribe === '1') {
      const emailAddress = ctx.state.emailAddress = q.em;
      const ok = await unsubscribe(ctx, q.em);
      matomoTrack(ctx, 'Unsubscribe', 'shabbat-weekly', emailAddress);
      if (ok) {
        if (isJSON) {
          ctx.body = {ok: true, unsubscribe: true, emailAddress};
          return;
        }
        return ctx.render('email-unsubscribe');
      } else {
        ctx.status = 404;
        if (isJSON) {
          ctx.throw(ctx.status, ctx.state.message);
        }
      }
    } else if (q.modify === '1' && !location) {
      ctx.state.message = 'Please enter your location.';
      ctx.status = 400;
      if (isJSON) {
        ctx.throw(ctx.status, ctx.state.message);
      }
    } else if (q.modify === '1' && !ctx.state.message) {
      if (q.M === 'on') {
        delete q.m;
      }
      const db = ctx.mysql;
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
        if (isJSON) {
          ctx.body = {ok: true};
          return;
        }
        return ctx.render('email-success', {
          updated: true,
        });
      }
      await writeStagingInfo(ctx, db, q);
      if (isJSON) {
        ctx.body = {ok: true};
        return;
      }
      return ctx.render('email-success', {
        updated: false,
      });
    }
  }
  if (defaultUnsubscribe) {
    return ctx.render('email-pre-unsub', {q});
  }
  return ctx.render('email', {
    q,
    defaultUnsubscribe,
  });
}

async function updateActiveSub(ctx, db, q) {
  await writeSubInfo(ctx, db, q);
  const emailAddress = ctx.state.emailAddress;
  const subscriptionId = ctx.state.subscriptionId;
  const unsubAddr = `shabbat-unsubscribe+${subscriptionId}@hebcal.com`;
  const msgid = `${subscriptionId}.${Date.now()}`;
  const locationName = ctx.state.locationName;
  matomoTrack(ctx, 'Signup', 'shabbat-weekly', locationName, {
    verified: true,
    email: emailAddress,
  });
  const imgOpen = getImgOpenHtml(msgid, encodeURIComponent(locationName), 'shabbat-update');
  const footerHtml = makeFooter(emailAddress);
  const message = {
    to: emailAddress,
    subject: 'Your subscription to Hebcal is updated',
    messageId: `<${msgid}@hebcal.com>`,
    headers: {
      'List-Unsubscribe': `<mailto:${unsubAddr}>`,
    },
    html: `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>This message confirms that your weekly Shabbat candle-lighting times
for <strong>${locationName}</strong> have been updated.</div>
${BLANK}
<div style="font-size:16px">Kol Tuv,
<br>Hebcal.com</div>
${BLANK}
${footerHtml}
${imgOpen}</div>
`,
  };
  await mySendMail(ctx, message);
}

async function unsubscribe(ctx, emailAddress, subInfo) {
  const db = ctx.mysql;
  subInfo = subInfo || await getSubInfo(db, emailAddress);
  if (subInfo && typeof subInfo.k === 'string') {
    ctx.state.subscriptionId = subInfo.k;
  }
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
    parseInt(q.geonameid, 10) || null,
    getHavdalahMins(q),
    getHavdalahTzeit(q),
    getCandleMins(q),
    getIpAddress(ctx),
    ctx.state.subscriptionId,
  ]);
}

function getHavdalahTzeit(q) {
  return q.M === 'on' ? 1 : 0;
}

function getCandleMins(q) {
  const minDefault = queryDefaultCandleMins(q);
  return parseInt(q.b, 10) || minDefault;
}

// allow zero as a valid Havdalah minutes past sundown
function getHavdalahMins(q) {
  const havdalahMins = parseInt(q.m, 10);
  return isNaN(havdalahMins) ? null : havdalahMins;
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
    getHavdalahMins(q),
    getHavdalahTzeit(q),
    getCandleMins(q),
    locationValue,
    ip,
  ]);
  const locationName = ctx.state.locationName;
  matomoTrack(ctx, 'Signup', 'shabbat-weekly', locationName, {
    verified: false,
    email: q.em,
  });
  const url = `https://www.hebcal.com/email/verify.php?${subscriptionId}`;
  const msgid = `${subscriptionId}.${Date.now()}`;
  const imgOpen = getImgOpenHtml(msgid, encodeURIComponent(locationName), 'shabbat-verify');
  const message = {
    to: q.em,
    subject: 'Please confirm your request to subscribe to Hebcal',
    messageId: `<${msgid}@hebcal.com>`,
    html: `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>We have received your request to receive weekly Shabbat
candle-lighting times from Hebcal.com for
${locationName}.</div>
${BLANK}
<div>Please confirm your request by clicking on this link:</div>
${BLANK}
<div><a href="${url}">${url}</a></div>
${BLANK}
<div>If you did not request (or do not want) weekly Shabbat
candle-lighting times, please accept our apologies and ignore this message.</div>
${BLANK}
<div style="font-size:16px">Kol Tuv,
<br>Hebcal.com</div>
${BLANK}
<div style="font-size:11px;color:#999;font-family:arial,helvetica,sans-serif">
<div>This email was sent to ${q.em} by <a href="https://www.hebcal.com/?${UTM_PARAM}">Hebcal.com</a>.
Hebcal is a free Jewish calendar and holiday web site.</div>
${BLANK}
<div>[${ip}]</div>
</div>
${imgOpen}</div>
`,
  };
  await mySendMail(ctx, message);
}
