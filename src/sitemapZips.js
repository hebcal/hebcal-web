import Database from 'better-sqlite3';
import {CACHE_CONTROL_30DAYS} from './common.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {makeETag} from './etag.js';

export async function sitemapZips(ctx) {
  const db = new Database('zips.sqlite3', {fileMustExist: true});
  const stmt = db.prepare('SELECT ZipCode FROM ZIPCodes_Primary WHERE NOT (Latitude = 0 AND Longitude = 0)');
  const results = stmt.all();
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
      .map((r) => `https://www.hebcal.com/shabbat?zip=${r.ZipCode}&b=18&M=on&lg=s\n`)
      .join('');
  db.close();
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  ctx.type = 'text/plain';
  ctx.body = body;
}
