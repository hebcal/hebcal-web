import {GeoDb} from '@hebcal/geo-sqlite';
import {cacheControl} from './common.js';
import {makeETag} from './etag.js';
import flag from 'emoji-flag';

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
  ctx.response.etag = makeETag(ctx, q, {geodbv: GeoDb.version()});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
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
        item.flag = flag(cc.toUpperCase());
      }
    }
    ctx.set('Cache-Control', CACHE_CONTROL_3DAYS);
    ctx.body = items;
  } else {
    ctx.status = 404;
    ctx.body = NOTFOUND;
  }
}
