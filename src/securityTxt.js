import {checkFreshETag} from './etag.js';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';

export async function securityTxt(ctx) {
  const dt = new Date();
  ctx.type = 'text/plain';
  if (checkFreshETag(ctx, {}, {
    yy: dt.getFullYear(),
    mm: dt.getMonth(),
    dd: dt.getDate(),
  })) {
    return;
  }
  dt.setFullYear(dt.getFullYear() + 1);
  dt.setHours(0, 0, 0, 0);
  const expires = dt.toISOString();
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.body = 'Contact: mailto:security@hebcal.com\n' +
    `Expires: ${expires}\n`;
}
