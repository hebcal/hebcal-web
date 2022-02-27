import path from 'path';

// eslint-disable-next-line require-jsdoc
export function shortUrlRedir(ctx) {
  const qs = Object.assign({}, ctx.request.query);
  if (qs.uc) {
    qs.utm_campaign = qs.uc;
    if (qs.uc.startsWith('pdf-')) {
      if (!qs.us && !qs.utm_source) {
        qs.utm_source = 'pdf';
      }
      if (!qs.um && !qs.utm_medium) {
        qs.utm_medium = 'document';
      }
    } else if (qs.uc.startsWith('ical-')) {
      if (!qs.us && !qs.utm_source) {
        qs.utm_source = 'js';
      }
      if (!qs.um && !qs.utm_medium) {
        qs.utm_medium = 'icalendar';
      }
    }
    delete qs.uc;
  }
  if (qs.us) {
    qs.utm_source = qs.us;
    delete qs.us;
  }
  if (qs.um) {
    qs.utm_medium = qs.um;
    delete qs.um;
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
  const destUrl = `https://www.hebcal.com/${dest}/${base}?` + new URLSearchParams(qs).toString();
  ctx.set('Cache-Control', 'private');
  ctx.redirect(destUrl);
}
