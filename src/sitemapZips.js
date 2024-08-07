import Database from 'better-sqlite3';
import {CACHE_CONTROL_30DAYS} from './common.js';

export async function sitemapZips(ctx) {
  const db = new Database('zips.sqlite3', {fileMustExist: true});
  const stmt = db.prepare('SELECT ZipCode FROM ZIPCodes_Primary WHERE NOT (Latitude = 0 AND Longitude = 0)');
  const results = stmt.all();
  const body = results
      .map((r) => `https://www.hebcal.com/shabbat?zip=${r.ZipCode}&b=18&M=on&lg=s\n`)
      .join('');
  db.close();
  ctx.lastModified = new Date();
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  ctx.type = 'text/plain';
  ctx.body = body;
}
