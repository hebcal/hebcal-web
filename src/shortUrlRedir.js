import path from 'path';
import querystring from 'querystring';

// eslint-disable-next-line require-jsdoc
export function shortUrlRedir(ctx) {
  const qs = querystring.parse(ctx.request.querystring || '');
  if (qs.us) {
    qs.utm_source = qs.us;
    delete qs.us;
  }
  if (qs.um) {
    qs.utm_medium = qs.um;
    delete qs.um;
  }
  if (qs.uc) {
    qs.utm_campaign = qs.uc;
    delete qs.uc;
  }
  const ref = ctx.get('referer');
  if (!qs.utm_source && ref && ref.length) {
    const refUrl = new URL(ref);
    if (!refUrl.hostname.endsWith('hebcal.com')) {
      qs.utm_source = refUrl.hostname;
    }
  }
  qs.utm_source = qs.utm_source || 'redir';
  qs.utm_medium = qs.utm_medium || 'redir';
  const rpath = ctx.request.path;
  const base = path.basename(rpath);
  const dest = rpath.startsWith('/h/') ? 'holidays' : 'sedrot';
  const destUrl = `https://www.hebcal.com/${dest}/${base}?` + querystring.stringify(qs);
  ctx.set('Cache-Control', 'private, max-age=0');
  ctx.redirect(destUrl);
}
