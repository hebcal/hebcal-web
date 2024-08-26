import dayjs from 'dayjs';
import {empty} from './empty.js';
import {getIpAddress} from './getIpAddress.js';
import {validateEmail, mySendMail, getImgOpenHtml} from './emailCommon.js';
import {getMaxYahrzeitId, summarizeAnniversaryTypes,
  YAHRZEIT, ANNIVERSARY, OTHER,
  getYahrzeitIds,
  makeCalendarTitle,
  compactJsonToSave,
  getYahrzeitDetailsFromDb, getYahrzeitDetailForId} from './yahrzeitCommon.js';
import {ulid} from 'ulid';
import {basename} from 'path';
import {matomoTrack} from './matomoTrack.js';
import {makeLogInfo} from './logger.js';

const BLANK = '<div>&nbsp;</div>';
const UTM_PARAM = 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=yahrzeit-txn';

async function dbQuery(ctx, sql, params) {
  return ctx.mysql.query2(ctx, {sql: sql, values: params});
}

export async function yahrzeitEmailVerify(ctx) {
  ctx.set('Cache-Control', 'private, max-age=0');
  const q = {...ctx.request.body, ...ctx.request.query};
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
    await dbQuery(ctx, sqlUpdate, [ip, subscriptionId]);
    matomoTrack(ctx, 'Email', 'signup-confirmed', 'yahrzeit-reminder');
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
      const afterSunset = (info.sunset === 'on' || info.sunset == 1);
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
  const sql = `SELECT email_addr, calendar_id FROM yahrzeit_email WHERE id = ?`;
  const results = await dbQuery(ctx, sql, [subscriptionId]);
  const row = results?.[0];
  if (!row) {
    ctx.throw(404, `Anniversary subscription key '${subscriptionId}' not found`);
  }
  return {
    emailAddress: row.email_addr,
    calendarId: row.calendar_id,
  };
}

async function existingSubByEmailAndCalendar(ctx, emailAddress, calendarId) {
  const sql = `SELECT id, sub_status FROM yahrzeit_email WHERE email_addr = ? AND calendar_id = ?`;
  const results = await dbQuery(ctx, sql, [emailAddress, calendarId]);
  let found = results?.[0];
  if (!found) {
    return {id: false, status: null};
  }
  const active = results.find((row) => row.sub_status === 'active');
  if (active) {
    found = active;
  }
  return {id: found.id, status: found.sub_status};
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

export async function yahrzeitEmailSearch(ctx) {
  const q = {...ctx.request.body, ...ctx.request.query};
  if (empty(q.em)) {
    return ctx.render('yahrzeit-search-notfound', {q});
  }
  ctx.set('Cache-Control', 'private, max-age=0');
  if (!validateEmail(q.em)) {
    ctx.status = 400;
    return ctx.render('yahrzeit-search-notfound', {
      q,
      message: `Invalid email address ${q.em}`,
    });
  }
  q.em = q.em.toLowerCase();
  const sql = `SELECT e.id, e.calendar_id, y.contents, y.created, y.updated
FROM yahrzeit_email e, yahrzeit y
WHERE e.email_addr = ? AND e.sub_status = 'active'
AND e.calendar_id = y.id
ORDER BY y.updated ASC`;
  const results = await dbQuery(ctx, sql, [q.em]);
  if (!results?.[0]) {
    ctx.status = 404;
    return ctx.render('yahrzeit-search-notfound', {q});
  }
  const nonEmpty = results.filter((row) => getMaxYahrzeitId(row.contents) !== 0);
  if (!nonEmpty.length) {
    ctx.status = 404;
    return ctx.render('yahrzeit-search-notfound', {q});
  }
  const ip = getIpAddress(ctx);
  let html = `
<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Here are your current Yahrzeit + Anniversary Calendar email subscriptions
from Hebcal.com.</div>
${BLANK}
`;
  const seen = new Set();
  const utmParam = UTM_PARAM.replace('yahrzeit-txn', 'yahrzeit-search');
  for (const row of nonEmpty) {
    const calendarId = row.calendar_id;
    if (seen.has(calendarId)) {
      continue;
    }
    const title = makeCalendarTitle(row.contents, 72);
    const url = `https://www.hebcal.com/yahrzeit/edit/${calendarId}?${utmParam}`;
    const created = dayjs(row.created).format('MMMM YYYY');
    const updated = dayjs(row.updated).format('MMMM YYYY');
    const dateStr = created === updated ? `created ${created}` : `modified ${updated}`;
    html += `<div><a href="${url}">${title}</a>\n`;
    // eslint-disable-next-line max-len
    const unsubUrl = `https://www.hebcal.com/yahrzeit/email?id=${row.id}&amp;num=all&amp;unsubscribe=1&amp;cfg=html&amp;${utmParam}`;
    html += `<br><span style="font-size:14px;color:#999;font-family:arial,helvetica,sans-serif">
${dateStr} · <a href="${unsubUrl}">unsubscribe</a></span></div>\n${BLANK}\n`;
    seen.add(calendarId);
  }
  html += `
<div>Or, to create a new personal calendar, visit
<a href="https://www.hebcal.com/yahrzeit/new">https://www.hebcal.com/yahrzeit/new</a></div>
${BLANK}
<div style="font-size:16px">Kol Tuv,
<br>Hebcal.com</div>
${BLANK}
<div style="font-size:11px;color:#999;font-family:arial,helvetica,sans-serif">
<div>This email was sent to ${q.em} by <a href="https://www.hebcal.com/?${utmParam}">Hebcal.com</a>.
Hebcal is a free Jewish calendar and holiday web site.</div>
${BLANK}
<div>[${ip}]</div>
</div>
</div>
`;
  const message = {
    to: q.em,
    subject: `View your Yahrzeit + Anniversary Calendar subscriptions`,
    html: html,
  };
  mySendMail(ctx, message).catch((err) => {
    ctx.logger.error(err);
  });
  return ctx.render('yahrzeit-search-found', {q, count: seen.size});
}

export async function yahrzeitEmailSub(ctx) {
  ctx.set('Cache-Control', 'private, max-age=0');
  const q = {...ctx.request.body, ...ctx.request.query};
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
  q.em = q.em.toLowerCase();
  const calendarId = q.ulid;
  const ip = getIpAddress(ctx);
  // will throw if not found. sets downloaded=1 if found.
  const details = await getYahrzeitDetailsFromDb(ctx, calendarId);
  if (!details.em) {
    details.em = q.em;
    compactJsonToSave(details);
    const contents = JSON.stringify(details);
    const sql = 'UPDATE yahrzeit SET updated = NOW(), contents = ?, ip = ? WHERE id = ?';
    dbQuery(ctx, sql, [contents, ip, calendarId]).catch((err) => {
      ctx.logger.error(err);
    });
  }
  let {id, status} = await existingSubByEmailAndCalendar(ctx, q.em, calendarId);
  if (id === false) {
    id = makeUlid(ctx);
    const sql = `INSERT INTO yahrzeit_email
    (id, email_addr, calendar_id, sub_status, created, ip_addr)
    VALUES (?, ?, ?, 'pending', NOW(), ?)`;
    await dbQuery(ctx, sql, [id, q.em, calendarId, ip]);
  } else if (status === 'active') {
    const sqlUpdate = `UPDATE yahrzeit_optout SET deactivated = 0 WHERE email_id = ?`;
    dbQuery(ctx, sqlUpdate, [id]).catch((err) => {
      ctx.logger.error(err);
    });
    ctx.body = {ok: true, alreadySubscribed: true};
    return;
  } else {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'pending', ip_addr = ? WHERE id = ?`;
    await dbQuery(ctx, sqlUpdate, [ip, id]);
  }
  matomoTrack(ctx, 'Email', 'signup-backend', 'yahrzeit-reminder');
  const anniversaryType = q.type === YAHRZEIT ? 'yahrzeit' : 'Hebrew anniversary';
  const url = `https://www.hebcal.com/yahrzeit/verify/${id}`;
  const msgid = `${id}.${Date.now()}`;
  const imgOpen = getImgOpenHtml(msgid, q.type, 'yahrzeit-verify');
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
  mySendMail(ctx, message).catch((err) => {
    ctx.logger.error(err);
  });
  ctx.body = {ok: true, status: status};
}

async function lookupSubContents(ctx, id) {
  const sql2 = `SELECT e.email_addr, e.calendar_id, y.contents, y.updated, y.downloaded
FROM yahrzeit_email e, yahrzeit y
WHERE e.id = ?
AND e.calendar_id = y.id`;
  const results = await dbQuery(ctx, sql2, [id]);
  const row = results?.[0];
  if (!row) {
    ctx.throw(404, `Subscription key '${id}' not found`);
  }
  const contents = row.contents;
  contents.emailAddress = row.email_addr;
  contents.calendarId = row.calendar_id;
  contents.maxId = getMaxYahrzeitId(contents);
  contents.numIds = getYahrzeitIds(contents).length;
  const type = contents.type = contents.anniversaryType = summarizeAnniversaryTypes(contents, false);
  contents.typeStr = type === YAHRZEIT ? type : `Hebrew ${type}`;
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
  const type0 = info.type;
  const type = type0 === OTHER ? ANNIVERSARY : type0;
  info.typeStr = type === YAHRZEIT ? type : `Hebrew ${type}`;
  info.calendarId = contents.calendarId;
  info.maxId = contents.maxId;
  info.numIds = contents.numIds;
  info.anniversaryType = contents.anniversaryType;
  return {info, emailAddress: contents.emailAddress};
}

async function unsub(ctx, q) {
  if (q.num === 'all') {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'unsub', ip_addr = ? WHERE id = ?`;
    const ip = getIpAddress(ctx);
    await dbQuery(ctx, sqlUpdate, [ip, q.id]);
  } else {
    const sql = 'INSERT INTO yahrzeit_optout (email_id, name_hash, num, deactivated) VALUES (?, ?, ?, 1)';
    const num = q.num === 'all' ? 0 : parseInt(q.num, 10);
    const nameHash = num == 0 ? null : (q.hash || null);
    await dbQuery(ctx, sql, [q.id, nameHash, num]);
  }
  matomoTrack(ctx, 'Email', 'unsubscribe', 'yahrzeit-reminder');
  if (q.cfg === 'json') {
    ctx.body = {ok: true};
    return;
  } else {
    if (q.num === 'all') {
      const {calendarId, emailAddress} = await lookupSubscription(ctx, q.id);
      const info = {calendarId};
      return ctx.render('yahrzeit-optout', {
        title: `Anniversary Email Unsubscribe - Hebcal`,
        emailAddress,
        info,
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
  const anniversaryType = contents.anniversaryType === YAHRZEIT ? 'yahrzeit' : 'Hebrew anniversary';
  const calendarId = contents.calendarId;
  const msgid = `${subscriptionId}.${Date.now()}`;
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
Reminders are sent 7 days before each anniversary.
Except for Shabbat, a second reminder will be sent the day before the anniversary.</div>
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
  mySendMail(ctx, message).catch((err) => {
    ctx.logger.error(err);
  });
}
