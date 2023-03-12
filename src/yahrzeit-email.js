/* eslint-disable require-jsdoc */
import {getIpAddress, validateEmail, empty} from './common';
import {mySendMail, getImgOpenHtml} from './emailCommon';
import {getMaxYahrzeitId, summarizeAnniversaryTypes,
  getYahrzeitDetailsFromDb, getYahrzeitDetailForId} from './yahrzeitCommon';
import {ulid} from 'ulid';
import {basename} from 'path';
import {matomoTrack} from './matomoTrack';
import {makeLogInfo} from './logger';

const BLANK = '<div>&nbsp;</div>';
const UTM_PARAM = 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=yahrzeit-txn';

export async function yahrzeitEmailVerify(ctx) {
  ctx.set('Cache-Control', 'private, max-age=0');
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = basename(ctx.request.path);
  if (subscriptionId.length !== 26) {
    ctx.throw(400, `Invalid anniversary subscription key '${subscriptionId}'`);
  }
  const contents = await lookupSubContents(ctx, subscriptionId);
  const emailAddress = contents.emailAddress;
  const calendarId = contents.calendarId;
  const confirmed = (q.commit === '1');
  if (confirmed) {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'active', ip_addr = ? WHERE id = ?`;
    const ip = getIpAddress(ctx);
    const db = ctx.mysql;
    await db.query(sqlUpdate, [ip, subscriptionId]);
    matomoTrack(ctx, 'Email', 'signup', 'yahrzeit-reminder', {
      url: ctx.request.href,
    });
    await sendConfirmEmail(ctx, contents, subscriptionId);
  } else {
    const obj = ctx.state.details = await getYahrzeitDetailsFromDb(ctx, calendarId);
    ctx.state.anniversaryType = summarizeAnniversaryTypes(obj, true);
    const maxId = ctx.state.maxId = getMaxYahrzeitId(obj);
    for (let num = 1; num <= maxId; num++) {
      const info = getYahrzeitDetailForId(obj, num);
      if (info === null) {
        continue;
      }
      const afterSunset = (info.sunset === 'on');
      const d = afterSunset ? info.day.subtract(1, 'day') : info.day;
      obj['date'+num] = d.format('D MMM YYYY');
      if (afterSunset) {
        obj['date'+num] += ' (after sunset)';
      }
    }
  }
  const title = confirmed ? 'Email Subscription Confirmed' : 'Confirm Email Subscription';
  await ctx.render('yahrzeit-verify', {
    title: `${title} - Hebcal`,
    confirmed,
    subscriptionId,
    emailAddress,
    calendarId,
  });
}

async function lookupSubscription(ctx, subscriptionId) {
  const db = ctx.mysql;
  const sql = `SELECT email_addr, calendar_id FROM yahrzeit_email WHERE id = ?`;
  const results = await db.query(sql, [subscriptionId]);
  if (!results || !results[0]) {
    ctx.throw(404, `Anniversary subscription key '${subscriptionId}' not found`);
  }
  const row = results[0];
  return {
    emailAddress: row.email_addr,
    calendarId: row.calendar_id,
  };
}

async function existingSubByEmailAndCalendar(ctx, emailAddress, calendarId) {
  const db = ctx.mysql;
  const sql = `SELECT id, sub_status FROM yahrzeit_email WHERE email_addr = ? AND calendar_id = ?`;
  const results = await db.query(sql, [emailAddress, calendarId]);
  if (!results || !results[0]) {
    return {id: false, status: null};
  }
  return {id: results[0].id, status: results[0].sub_status};
}

function makeUlid(ctx) {
  const id = ulid().toLowerCase();
  const logInfo = makeLogInfo(ctx);
  delete logInfo.status;
  delete logInfo.duration;
  logInfo.subscriptionId = id;
  logInfo.msg = `yahrzeit-email: created subscriptionId=${id}`;
  ctx.logger.info(logInfo);
  return id;
}

export async function yahrzeitEmailSub(ctx) {
  ctx.set('Cache-Control', 'private, max-age=0');
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  if (q.cfg !== 'html') {
    ctx.response.type = ctx.request.header['accept'] = 'application/json';
  }
  if (!empty(q.id) && !empty(q.num) && q.unsubscribe === '1') {
    if (q.commit !== '1') {
      const {info, emailAddress} = await lookupSubNum(ctx, q);
      return ctx.render('yahrzeit-pre-unsub', {
        title: `${info.typeStr} Email Unsubscribe - Hebcal`,
        emailAddress,
        info,
        q,
      });
    }
    return unsub(ctx, q);
  }
  ['em', 'ulid', 'type'].forEach((key) => {
    if (empty(q[key])) {
      ctx.throw(400, `Missing required key '${key}'`);
    }
  });
  if (!validateEmail(q.em)) {
    ctx.throw(400, `Invalid email address ${q.em}`);
  }
  const calendarId = q.ulid;
  // will throw if not found. sets downloaded=1 if found.
  await getYahrzeitDetailsFromDb(ctx, calendarId);
  const db = ctx.mysql;
  let {id, status} = await existingSubByEmailAndCalendar(ctx, q.em, calendarId);
  const ip = getIpAddress(ctx);
  if (id === false) {
    id = makeUlid(ctx);
    const sql = `INSERT INTO yahrzeit_email
    (id, email_addr, calendar_id, sub_status, created, ip_addr)
    VALUES (?, ?, ?, 'pending', NOW(), ?)`;
    await db.query(sql, [id, q.em, calendarId, ip]);
  } else if (status === 'active') {
    const sqlUpdate = `UPDATE yahrzeit_optout SET deactivated = 0 WHERE email_id = ?`;
    await db.query(sqlUpdate, [id]);
    ctx.body = {ok: true, alreadySubscribed: true};
    return;
  } else {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'pending', ip_addr = ? WHERE id = ?`;
    await db.query(sqlUpdate, [ip, id]);
  }
  matomoTrack(ctx, 'Email', 'signup', 'yahrzeit-reminder', {
    url: ctx.request.href,
  });
  const anniversaryType = q.type === 'Yahrzeit' ? q.type : `Hebrew ${q.type}`;
  const url = `https://www.hebcal.com/yahrzeit/verify/${id}`;
  const msgid = `${calendarId}.${id}.${Date.now()}`;
  const imgOpen = getImgOpenHtml(msgid, anniversaryType, 'yahrzeit-verify');
  const message = {
    to: q.em,
    subject: `Activate your ${anniversaryType} reminders`,
    messageId: `<${msgid}@hebcal.com>`,
    html: `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>We have received your request to receive ${anniversaryType} reminders
from Hebcal.com.</div>
${BLANK}
<div>Please confirm your request and activate your subscription
by clicking on this link:</div>
${BLANK}
<div><a href="${url}">${url}</a></div>
${BLANK}
<div>If you did not request (or do not want) ${anniversaryType} reminders,
please accept our apologies and ignore this message.</div>
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
  ctx.body = {ok: true};
}

async function lookupSubContents(ctx, id) {
  const db = ctx.mysql;
  const sql2 = `SELECT e.email_addr, e.calendar_id, y.contents, y.updated, y.downloaded
FROM yahrzeit_email e, yahrzeit y
WHERE e.id = ?
AND e.calendar_id = y.id`;
  const results = await db.query(sql2, [id]);
  if (!results || !results[0]) {
    ctx.throw(404, `Subscription key '${id}' not found`);
  }
  const row = results[0];
  const contents = row.contents;
  contents.emailAddress = row.email_addr;
  contents.calendarId = row.calendar_id;
  contents.maxId = getMaxYahrzeitId(contents);
  const type = contents.type = contents.anniversaryType = summarizeAnniversaryTypes(contents, false);
  contents.typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
  contents.lastModified = row.updated;
  contents.downloaded = row.downloaded;
  return contents;
}

async function lookupSubNum(ctx, q) {
  const contents = await lookupSubContents(ctx, q.id);
  if (q.num === 'all') {
    return {info: contents, emailAddress: contents.emailAddress};
  }
  const info = getYahrzeitDetailForId(contents, q.num);
  if (info === null) {
    ctx.throw(404, `Id number '${q.num}' in subscription '${q.id}' not found`);
  }
  const type = info.type;
  info.typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
  info.calendarId = contents.calendarId;
  info.maxId = contents.maxId;
  info.anniversaryType = contents.anniversaryType;
  return {info, emailAddress: contents.emailAddress};
}

async function unsub(ctx, q) {
  const db = ctx.mysql;
  if (q.num === 'all') {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'unsub', ip_addr = ? WHERE id = ?`;
    const ip = getIpAddress(ctx);
    await db.query(sqlUpdate, [ip, q.id]);
  } else {
    const sql = 'INSERT INTO yahrzeit_optout (email_id, name_hash, num, deactivated) VALUES (?, ?, ?, 1)';
    const num = q.num === 'all' ? 0 : parseInt(q.num, 10);
    const nameHash = num == 0 ? null : (q.hash || null);
    await db.query(sql, [q.id, nameHash, num]);
  }
  matomoTrack(ctx, 'Email', 'unsubscribe', 'yahrzeit-reminder', {
    url: ctx.request.href,
  });
  if (q.cfg === 'json') {
    ctx.body = {ok: true};
    return;
  } else {
    if (q.num === 'all') {
      const {emailAddress} = await lookupSubscription(ctx, q.id);
      return ctx.render('yahrzeit-optout', {
        title: `Anniversary Email Unsubscribe - Hebcal`,
        emailAddress,
      });
    } else {
      const {info, emailAddress} = await lookupSubNum(ctx, q);
      return ctx.render('yahrzeit-optout', {
        title: `${info.typeStr} Email Unsubscribe - Hebcal`,
        emailAddress,
        info,
      });
    }
  }
}

function makeFooter(emailAddress, typeStr, editUrl, unsubUrl) {
  unsubUrl = unsubUrl.replace(/&/g, '&amp;');
  return `<div style="font-size:11px;color:#999;font-family:arial,helvetica,sans-serif">
<div>This email was sent to ${emailAddress} by <a href="https://www.hebcal.com/?${UTM_PARAM}">Hebcal.com</a>.
Hebcal is a free Jewish calendar and holiday web site.</div>
${BLANK}
<div><a href="${editUrl}">Edit ${typeStr} Calendar</a> |
<a href="${unsubUrl}&amp;cfg=html&amp;${UTM_PARAM}">Unsubscribe</a> |
<a href="https://www.hebcal.com/home/about/privacy-policy?${UTM_PARAM}">Privacy Policy</a></div>
</div>`;
}

async function sendConfirmEmail(ctx, contents, subscriptionId) {
  const anniversaryType = contents.anniversaryType;
  const calendarId = contents.calendarId;
  const msgid = `${calendarId}.${subscriptionId}.${Date.now()}`;
  const imgOpen = getImgOpenHtml(msgid, anniversaryType, 'yahrzeit-complete');
  const urlBase = 'https://www.hebcal.com/yahrzeit';
  const editUrl = `${urlBase}/edit/${calendarId}`;
  const unsubUrl = `${urlBase}/email?id=${subscriptionId}&num=all&unsubscribe=1`;
  const emailAddress = contents.emailAddress;
  const footerHtml = makeFooter(emailAddress, anniversaryType, `${editUrl}?${UTM_PARAM}#form`, unsubUrl);
  const message = {
    to: emailAddress,
    subject: `Your ${anniversaryType} reminders are now active`,
    headers: {
      'List-ID': `<${subscriptionId}.list-id.hebcal.com>`,
      'List-Unsubscribe': `<${unsubUrl}&commit=1&cfg=json>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    messageId: `<${msgid}@hebcal.com>`,
    html: `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>Your subscription request for ${anniversaryType} annual reminders from Hebcal.com is complete.
Reminders are sent 7 days before each anniversary.</div>
${BLANK}
<div>Please save this message. If you'd like to edit your personal calendar
or add additional names, you may visit the following URL at any time:</div>
${BLANK}
<div><a href="${editUrl}">${editUrl}</a></div>
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
