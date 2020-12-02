/* eslint-disable require-jsdoc */
import {makeDb} from './makedb';
import {getIpAddress, validateEmail, empty} from './common';
import {mySendMail, getMaxYahrzeitId, getYahrzeitDetailForId, getYahrzeitDetailsFromDb,
  summarizeAnniversaryTypes} from './common2';
import {ulid} from 'ulid';
import {basename} from 'path';

export async function yahrzeitEmailVerify(ctx) {
  ctx.set('Cache-Control', 'private');
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  const key = basename(ctx.request.path);
  if (key.length !== 26) {
    ctx.throw(400, `Invalid verification key '${key}'`);
  }
  const db = makeDb(ctx.iniConfig);
  const sql = `SELECT email_addr, calendar_id FROM yahrzeit_email WHERE id = ?`;
  const results = await db.query(sql, [key]);
  if (!results || !results[0]) {
    await db.close();
    ctx.throw(404, `Verification key '${key}' not found`);
  }
  const row = results[0];
  const confirmed = (q.commit === '1');
  if (confirmed) {
    const sqlUpdate = `UPDATE yahrzeit_email SET sub_status = 'active', ip_addr = ? WHERE id = ?`;
    const ip = getIpAddress(ctx);
    await db.query(sqlUpdate, [ip, key]);
  } else {
    const obj = ctx.state.details = await getYahrzeitDetailsFromDb(ctx, db, row.calendar_id);
    ctx.state.anniversaryType = summarizeAnniversaryTypes(obj, true);
    const maxId = ctx.state.maxId = getMaxYahrzeitId(obj);
    for (let num = 1; num <= maxId; num++) {
      const info = getYahrzeitDetailForId(obj, num);
      const afterSunset = (info.sunset === 'on');
      const d = afterSunset ? info.day.subtract(1, 'day') : info.day;
      obj['date'+num] = d.format('D MMM YYYY');
      if (afterSunset) {
        obj['date'+num] += ' (after sunset)';
      }
    }
  }
  await db.close();
  const title = confirmed ? 'Email Subscription Confirmed' : 'Confirm Email Subscription';
  await ctx.render('yahrzeit-verify', {
    title: `${title} | Hebcal Jewish Calendar`,
    confirmed,
    subscriptionId: key,
    emailAddress: row.email_addr,
  });
}

export async function yahrzeitEmailSub(ctx) {
  ctx.set('Cache-Control', 'private');
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  /*
  if (ctx.request.method === 'GET') {
    ctx.set('Allow', 'POST');
    ctx.throw(405, 'GET not allowed; try using POST instead');
  }
  */
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  if (!empty(q.id) && !empty(q.num) && q.unsubscribe === '1' && q.commit === '1') {
    const db = makeDb(ctx.iniConfig);
    const sql = 'INSERT INTO yahrzeit_optout (email_id, num, deactivated) VALUES (?, ?, 1)';
    await db.query(sql, [q.id, q.num]);
    await db.close();
    ctx.body = {ok: true};
    return;
  }
  ['em', 'ulid', 'type'].forEach((key) => {
    if (empty(q[key])) {
      ctx.throw(400, `Missing required key '${key}'`);
    }
  });
  if (!validateEmail(q.em)) {
    ctx.throw(400, `Invalid email address ${q.em}`);
  }
  const id = ulid().toLowerCase();
  const db = makeDb(ctx.iniConfig);
  const ip = getIpAddress(ctx);
  const sql = `INSERT INTO yahrzeit_email
  (id, email_addr, calendar_id, sub_status, created, ip_addr)
  VALUES (?, ?, ?, 'pending', NOW(), ?)`;
  await db.query(sql, [id, q.em, q.ulid, ip]);
  const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1 WHERE id = ?';
  await db.query(sqlUpdate, q.ulid);
  await db.close();
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
