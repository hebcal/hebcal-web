import {GeoDb} from '@hebcal/geo-sqlite';
import {cacheControl} from './cacheControl.js';
import {checkFreshETag} from './etag.js';
import {flag} from './emoji-flag.js';

const NOTFOUND = {error: 'Not Found'};
const CACHE_CONTROL_3DAYS = cacheControl(3);

export async function geoAutoComplete(ctx) {
  const q = ctx.request.query;
  const qraw = typeof q.q === 'string' ? q.q.trim() : '';
  if (qraw.length === 0) {
    ctx.status = 404;
    ctx.body = NOTFOUND;
    return;
  }
  if (checkFreshETag(ctx, q, {geodbv: GeoDb.version()})) {
    ctx.body = {status: 'Not Modified'};
    return;
  }
  const latlong = (q.g === 'on' || q.g == '1');
  const items = ctx.db.autoComplete(qraw, latlong);
  if (items.length) {
    if (!latlong) {
      for (const item of items) {
        delete item.population;
      }
    }
    for (const item of items) {
      const cc = item.cc;
      if (cc?.length === 2) {
        item.flag = flag(cc);
      }
    }
    ctx.set('Cache-Control', CACHE_CONTROL_3DAYS);
    ctx.body = items;
  } else {
    ctx.response.remove('ETag');
    ctx.status = 404;
    ctx.body = NOTFOUND;
  }
}
