import Database from 'better-sqlite3';
import {cacheControl} from './common';

// eslint-disable-next-line require-jsdoc
export async function sitemapZips(ctx) {
  const db = new Database('zips.sqlite3', {fileMustExist: true});
  const stmt = db.prepare('SELECT ZipCode FROM ZIPCodes_Primary');
  const results = stmt.all();
  const body = results
      .map((r) => `https://www.hebcal.com/shabbat?zip=${r.ZipCode}&b=18&M=on&lg=s\n`)
      .join('');
  db.close();
  ctx.lastModified = ctx.launchDate;
  ctx.set('Cache-Control', cacheControl(30));
  ctx.type = 'text/plain';
  ctx.body = body;
}
