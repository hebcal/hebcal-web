import {matomoTrack} from './matomoTrack';
import {getIpAddress, empty} from './common';
import {sendGif} from './sendGif';
import {transliterate} from 'transliteration';

// eslint-disable-next-line require-jsdoc
export async function emailOpen(ctx) {
  const q = ctx.request.query;
  if (empty(q.msgid)) {
    return sendGif(ctx);
  }
  if (!ctx.state.userId) {
    const msgid = q.msgid;
    const dot = msgid.indexOf('.');
    if (dot !== -1) {
      ctx.state.userId = msgid.substring(0, dot);
    }
  }
  const loc = transliterate(q.loc);
  matomoTrack(ctx, 'Email', 'open', q['utm_campaign'], {
    url: ctx.request.href,
  });
  await saveEmailOpenToDb(ctx, loc);
  return sendGif(ctx);
}

// eslint-disable-next-line require-jsdoc
async function saveEmailOpenToDb(ctx, loc) {
  const q = ctx.request.query;
  const msgid = q.msgid;
  const delta = computeDelta(msgid);
  const db = ctx.mysql;
  const sql = 'INSERT INTO email_open (msgid, ip_addr, loc, delta) VALUES (?, ?, ?, ?)';
  const ipAddress = getIpAddress(ctx);
  await db.query(sql, [msgid, ipAddress, loc, delta]);
}

/**
 * @param {string} msgid
 * @return {number}
 */
function computeDelta(msgid) {
  const parts = msgid.split('.');
  const sentTime = parseInt(parts[parts.length - 1], 10);
  if (sentTime) {
    const delta = Math.trunc((Date.now() - sentTime) / 1000);
    if (delta < 0 || delta > 2147483647) {
      return null;
    }
    return delta;
  }
  return null;
}
