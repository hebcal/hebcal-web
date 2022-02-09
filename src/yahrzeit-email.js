/* eslint-disable require-jsdoc */
import {getIpAddress, validateEmail, empty} from './common';
import {mySendMail, getMaxYahrzeitId, getYahrzeitDetailForId, getYahrzeitDetailsFromDb,
  summarizeAnniversaryTypes} from './common2';
import {ulid} from 'ulid';
import {basename} from 'path';

export async function yahrzeitEmailVerify(ctx) {
  ctx.set('Cache-Control', 'private');
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const subscriptionId = basename(ctx.request.path);
  if (subscriptionId.length !== 26) {
    ctx.throw(400, `Invalid anniversary subscription key '${subscriptionId}'`);
  }
  const {emailAddress, calendarId} = await lookupSubscription(ctx, subscriptionId);
  const confirmed = (q.commit === '1');
  if (confirmed) {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'active', ip_addr = ? WHERE id = ?`;
    const ip = getIpAddress(ctx);
    const db = ctx.mysql;
    await db.query(sqlUpdate, [ip, subscriptionId]);
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
    title: `${title} | Hebcal Jewish Calendar`,
    confirmed,
    subscriptionId,
    emailAddress,
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
  const sql = `SELECT id FROM yahrzeit_email WHERE email_addr = ? AND calendar_id = ?`;
  const results = await db.query(sql, [emailAddress, calendarId]);
  if (!results || !results[0]) {
    return false;
  }
  return results[0].id;
}


export async function yahrzeitEmailSub(ctx) {
  ctx.set('Cache-Control', 'private');
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  if (q.cfg !== 'html') {
    ctx.response.type = ctx.request.header['accept'] = 'application/json';
  }
  if (!empty(q.id) && !empty(q.num) && q.unsubscribe === '1') {
    if (q.commit !== '1') {
      const {info, emailAddress} = await lookupSubNum(ctx, q);
      return ctx.render('yahrzeit-pre-unsub', {
        title: `${info.typeStr} Email Unsubscribe | Hebcal Jewish Calendar`,
        emailAddress,
        info,
        q,
      });
    }
    const db = ctx.mysql;
    if (q.num === 'all') {
      const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'unsub', ip_addr = ? WHERE id = ?`;
      const ip = getIpAddress(ctx);
      await db.query(sqlUpdate, [ip, q.id]);
    }
    const sql = 'REPLACE INTO yahrzeit_optout (email_id, name_hash, num, deactivated) VALUES (?, ?, ?, 1)';
    const num = q.num === 'all' ? 0 : parseInt(q.num, 10);
    const nameHash = num == 0 ? null : (q.hash || null);
    await db.query(sql, [q.id, nameHash, num]);
    if (q.cfg === 'json') {
      ctx.body = {ok: true};
      return;
    } else {
      if (q.num === 'all') {
        const {emailAddress} = await lookupSubscription(ctx, q.id);
        return ctx.render('yahrzeit-optout', {
          title: `Anniversary Email Unsubscribe | Hebcal Jewish Calendar`,
          emailAddress,
        });
      } else {
        const {info, emailAddress} = await lookupSubNum(ctx, q);
        return ctx.render('yahrzeit-optout', {
          title: `${info.typeStr} Email Unsubscribe | Hebcal Jewish Calendar`,
          emailAddress,
          info,
        });
      }
    }
  }
  ['em', 'ulid', 'type'].forEach((key) => {
    if (empty(q[key])) {
      ctx.throw(400, `Missing required key '${key}'`);
    }
  });
  if (!validateEmail(q.em)) {
    ctx.throw(400, `Invalid email address ${q.em}`);
  }
  let id = await existingSubByEmailAndCalendar(ctx, q.em, q.ulid);
  const ip = getIpAddress(ctx);
  if (id === false) {
    id = ulid().toLowerCase();
    const db = ctx.mysql;
    const sql = `INSERT INTO yahrzeit_email
    (id, email_addr, calendar_id, sub_status, created, ip_addr)
    VALUES (?, ?, ?, 'pending', NOW(), ?)`;
    await db.query(sql, [id, q.em, q.ulid, ip]);
    const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1 WHERE id = ?';
    await db.query(sqlUpdate, q.ulid);
  }
  const anniversaryType = q.type === 'Yahrzeit' ? q.type : `Hebrew ${q.type}`;
  const url = `https://www.hebcal.com/yahrzeit/verify/${id}`;
  const message = {
    to: q.em,
    subject: `Activate your ${anniversaryType} reminders`,
    html: `<div dir="ltr">
<div>Hello,</div>
<div><br></div>
<div>We have received your request to receive ${anniversaryType} reminders
from hebcal.com.</div>
<div><br></div>
<div>Please confirm your request and activate your subscription
by clicking on this link:</div>
<div><br></div>
<div><a href="${url}">${url}</a></div>
<div><br></div>
<div>If you did not request (or do not want) ${anniversaryType} reminders,
please accept our apologies and ignore this message.</div>
<div><br></div>
<div>Regards,
<br>hebcal.com</div>
<div><br></div>
<div>[${ip}]</div>
</div>
`,
  };
  await mySendMail(ctx, message);
  ctx.body = {ok: true};
}

async function lookupSubNum(ctx, q) {
  const db = ctx.mysql;
  const sql2 = `SELECT e.email_addr, e.calendar_id, y.contents
FROM yahrzeit_email e, yahrzeit y
WHERE e.id = ?
AND e.calendar_id = y.id`;
  const results = await db.query(sql2, [q.id]);
  if (!results || !results[0]) {
    ctx.throw(404, `Subscription key '${q.id}' not found`);
  }
  const row = results[0];
  const info = getYahrzeitDetailForId(row.contents, q.num);
  if (info === null) {
    ctx.throw(404, `Id number '${q.num}' in subscription '${q.id}' not found`);
  }
  const type = info.type;
  info.typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
  info.calendarId = row.calendar_id;
  info.maxId = getMaxYahrzeitId(row.contents);
  info.anniversaryType = summarizeAnniversaryTypes(row.contents, false);
  return {info, emailAddress: row.email_addr};
}
