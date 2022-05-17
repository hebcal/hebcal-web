import send from 'koa-send';
import {matomoTrack} from './matomoTrack';
import {plausibleTrack} from './plausibleTrack';
import {getIpAddress} from './common';

const DOCUMENT_ROOT = '/var/www/html';

// eslint-disable-next-line require-jsdoc
export async function emailOpen(ctx) {
  const q = ctx.request.query;
  const msgid = q.msgid;
  const delta = computeDelta(msgid);
  const db = ctx.mysql;
  const sql = 'INSERT INTO email_open (msgid, ip_addr, loc, delta) VALUES (?, ?, ?, ?)';
  const ipAddress = getIpAddress(ctx);
  await db.query(sql, [msgid, ipAddress, q.loc, delta]);
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
  ctx.type = 'image/gif';
  matomoTrack(ctx, {
    action_name: 'Email Open',
    e_c: 'email-open',
    e_a: ctx.request.query['utm_campaign'],
    e_n: ctx.request.query['loc'],
  });
  plausibleTrack(ctx, 'Email Open', {
    type: ctx.request.query['utm_campaign'],
    loc: ctx.request.query['loc'],
  });
  return send(ctx, '/__utm.gif', {root: DOCUMENT_ROOT});
}

/**
 * @param {string} msgid
 * @return {number}
 */
function computeDelta(msgid) {
  const parts = msgid.split('.');
  const sentTime = parseInt(parts[parts.length - 1], 10);
  if (sentTime) {
    return Math.trunc((Date.now() - sentTime) / 1000);
  }
  return null;
}
