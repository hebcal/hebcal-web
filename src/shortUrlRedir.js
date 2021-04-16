import path from 'path';
import querystring from 'querystring';

// eslint-disable-next-line require-jsdoc
export function shortUrlRedir(ctx) {
  const qs = querystring.parse(ctx.request.querystring || '');
  const ref = ctx.get('referrer');
  if (!qs.utm_source && ref && ref.length) {
    const refUrl = new URL(ref);
    if (!refUrl.hostname.endsWith('hebcal.com')) {
      qs.utm_source = refUrl.hostname;
    }
  }
  if (!qs.utm_source) {
    qs.utm_source = 'redir';
  }
  qs.utm_medium = qs.utm_medium || 'redir';
  const rpath = ctx.request.path;
  const base = path.basename(rpath);
  const dest = rpath.startsWith('/h/') ? 'holidays' : 'sedrot';
  const destUrl = `https://www.hebcal.com/${dest}/${base}?` + querystring.stringify(qs);
  ctx.set('Cache-Control', 'private, max-age=0');
  ctx.redirect(destUrl);
}
