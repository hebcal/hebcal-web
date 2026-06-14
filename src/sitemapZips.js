import {CACHE_CONTROL_30DAYS} from './cacheControl.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {checkFreshETag} from './etag.js';

const sql = 'SELECT ZipCode FROM ZIPCodes_Primary WHERE NOT (Latitude = 0 AND Longitude = 0) ORDER BY population DESC';

export async function sitemapZips(ctx) {
  const db = ctx.db.zipsDb;
  const results = db.prepare(sql).all();
  const attrs = {
    numZips: results.length,
    geodbv: GeoDb.version(),
  };
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  if (checkFreshETag(ctx, {}, attrs)) {
    return;
  }
  const body = results
      .map((r) => `https://www.hebcal.com/shabbat?zip=${r.ZipCode}&b=18&M=on&lg=s&set=off\n`)
      .join('');
  ctx.type = 'text/plain';
  ctx.body = body;
}
