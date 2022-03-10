import path from 'path';

// eslint-disable-next-line require-jsdoc
export function shortUrlRedir(ctx) {
  const qs = new URLSearchParams(ctx.request.query);
  let utmSource = qs.get('utm_source') || qs.get('us');
  let utmMedium = qs.get('utm_medium') || qs.get('um');
  if (qs.has('uc')) {
    const campaign = qs.get('uc');
    if (campaign.startsWith('pdf-')) {
      utmSource = utmSource || 'pdf';
      utmMedium = utmMedium || 'document';
    } else if (campaign.startsWith('ical-')) {
      utmSource = utmSource || 'js';
      utmMedium = utmMedium || 'icalendar';
    }
    qs.set('utm_campaign', campaign);
    qs.delete('uc');
  }
  const ref = ctx.get('referer');
  if (!utmSource && ref && ref.length) {
    const refUrl = new URL(ref);
    if (!refUrl.hostname.endsWith('hebcal.com')) {
      utmSource = refUrl.hostname;
    }
  }
  utmSource = utmSource || 'redir';
  utmMedium = utmMedium || 'redir';
  qs.set('utm_source', utmSource);
  qs.set('utm_medium', utmMedium);
  qs.delete('us');
  qs.delete('um');
  const rpath = ctx.request.path;
  const base = path.basename(rpath);
  const dest = rpath.startsWith('/h/') ? 'holidays' : 'sedrot';
  if (dest === 'sedrot') {
    qs.set('_r', Date.now().toString(36));
  }
  const destUrl = `https://www.hebcal.com/${dest}/${base}?` + qs.toString();
  ctx.set('Cache-Control', 'private');
  ctx.redirect(destUrl);
}
