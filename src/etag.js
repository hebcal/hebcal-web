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
 * @param {any} ctx
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
    if (enc.indexOf('br') !== -1) {
      etagObj.br = 1;
    } else if (enc.indexOf('gzip') !== -1) {
      etagObj.gzip = 1;
    }
  }
  const str = JSON.stringify(etagObj);
  const base64String = murmur128SyncBase64(str);
  return `W/"${base64String}"`;
}
