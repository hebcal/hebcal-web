import {CACHE_CONTROL_30DAYS} from './cacheControl.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {checkFreshETag} from './etag.js';

// Exclude sparsely-populated ZIP codes so we don't encourage crawlers to
// index a location that might disappear from a future version of the database
const MIN_POPULATION = 500;

const sql = `SELECT ZipCode FROM ZIPCodes_Primary
WHERE NOT (Latitude = 0 AND Longitude = 0)
AND population >= ${MIN_POPULATION}
ORDER BY population DESC`;

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
