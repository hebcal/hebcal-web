import {CACHE_CONTROL_30DAYS} from './cacheControl.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {makeETag} from './etag.js';

export async function sitemapZips(ctx) {
  const db = ctx.db.zipsDb;
  const results = db.prepare('SELECT ZipCode FROM ZIPCodes_Primary WHERE NOT (Latitude = 0 AND Longitude = 0)').all();
  ctx.response.etag = makeETag(ctx, {}, {
    numZips: results.length,
    geodbv: GeoDb.version(),
  });
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const body = results
      .map((r) => `https://www.hebcal.com/shabbat?zip=${r.ZipCode}&b=18&M=on&lg=s&set=off\n`)
      .join('');
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  ctx.type = 'text/plain';
  ctx.body = body;
}
