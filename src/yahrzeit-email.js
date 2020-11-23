/* eslint-disable require-jsdoc */
import {makeDb} from './makedb';
import nodemailer from 'nodemailer';
import {getIpAddress, validateEmail} from './common';
import {ulid} from 'ulid';
import {basename} from 'path';

export async function yahrzeitEmailVerify(ctx) {
  const base = basename(ctx.request.path);
}

export async function yahrzeitEmailSub(ctx) {
  ctx.set('Cache-Control', 'private');
  ctx.response.type = ctx.request.header['accept'] = 'application/json';
  if (ctx.request.method === 'GET') {
    ctx.set('Allow', 'POST');
    ctx.throw(405, 'GET not allowed; try using POST instead');
  }
  const q = Object.assign({}, ctx.request.body || {}, ctx.request.query);
  ['em', 'ulid', 'type'].forEach((key) => {
    if (typeof q[key] === 'undefined' || q[key] === '') {
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
  const anniversaryType = q.type === 'Yahrzeit' ? q.type : `Hebrew ${q.type}`;
  const url = `https://www.hebcal.com/yahrzeit/verify/${id}`;
  const message = {
    to: q.em,
    subject: `Please confirm your ${anniversaryType} reminders`,
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
