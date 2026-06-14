import {checkFreshETag} from './etag.js';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';

export async function securityTxt(ctx) {
  const dt = new Date();
  ctx.type = 'text/plain';
  const attrs = {
    yy: dt.getFullYear(),
    mm: dt.getMonth(),
    dd: dt.getDate(),
  };
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  if (checkFreshETag(ctx, {}, attrs)) {
    return;
  }
  dt.setFullYear(dt.getFullYear() + 1);
  dt.setHours(0, 0, 0, 0);
  const expires = dt.toISOString();
  ctx.body = 'Contact: mailto:security@hebcal.com\n' +
    `Expires: ${expires}\n`;
}
