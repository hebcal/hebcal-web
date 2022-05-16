import send from 'koa-send';
import {matomoTrack} from './matomoTrack';
import {getIpAddress} from './common';

const DOCUMENT_ROOT = '/var/www/html';

// eslint-disable-next-line require-jsdoc
export async function emailOpen(ctx) {
  const db = ctx.mysql;
  const sql = 'INSERT INTO email_open (msgid, ip_addr, loc) VALUES (?, ?, ?)';
  const ipAddress = getIpAddress(ctx);
  const q = ctx.request.query;
  await db.query(sql, [q.msgid, ipAddress, q.loc]);
  ctx.state.trackPageview = false;
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
  ctx.type = 'image/gif';
  matomoTrack(ctx, {
    action_name: 'Email Open',
    e_c: 'email-open',
    e_a: ctx.request.query['utm_campaign'],
    e_n: ctx.request.query['loc'],
  });
  return send(ctx, '/__utm.gif', {root: DOCUMENT_ROOT});
}
