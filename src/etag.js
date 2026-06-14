import {murmur128Sync} from 'murmurhash3';
import {HebrewCalendar} from '@hebcal/core';
import {pkg} from './pkg.js';

function murmur128SyncBase64(str) {
  const arr4 = murmur128Sync(str);
  const int32Array = new Uint32Array(arr4);
  const buffer = Buffer.from(int32Array.buffer);
  const base64String = buffer.toString('base64url');
  return base64String;
}

/**
 * @private
 * @param {import('koa').Context} ctx
 * @param {Object.<string,string>} options
 * @param {Object.<string,string>} attrs
 * @return {string}
 */

export function makeETag(ctx, options, attrs) {
  const vers = {core: HebrewCalendar.version(), web: pkg.version};
  const etagObj = {...vers, ...options, ...attrs, path: ctx.request.path};
  const utm = Object.keys(etagObj).filter((k) => k.startsWith('utm_'));
  for (const key of utm) {
    delete etagObj[key];
  }
  const enc = ctx.get('accept-encoding');
  if (enc) {
    if (enc.includes('zstd')) {
      etagObj.zstd = 1;
    } else if (enc.includes('br')) {
      etagObj.br = 1;
    } else if (enc.includes('gzip')) {
      etagObj.gzip = 1;
    }
  }
  const str = JSON.stringify(etagObj);
  const base64String = murmur128SyncBase64(str);
  return `W/"${base64String}"`;
}

/**
 * Computes a weak ETag for the response (unless one has already been set by
 * the caller) and checks whether the client's cached copy is still fresh.
 * Sets `ctx.response.etag` and `ctx.status` (200, or 304 when fresh). Returns
 * `true` when the response is fresh, in which case the caller should return
 * immediately without rendering a body.
 * @param {import('koa').Context} ctx
 * @param {Object.<string,string>} options
 * @param {Object.<string,string>} attrs
 * @return {boolean}
 */
export function checkFreshETag(ctx, options, attrs) {
  if (!ctx.response.etag) {
    ctx.response.etag = makeETag(ctx, options, attrs);
  }
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return true;
  }
  return false;
}
