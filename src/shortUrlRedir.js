const shortToLong = {
  h: 'holidays',
  s: 'sedrot',
  o: 'omer',
};

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
  const base = rpath.substring(3);
  const shortStr = rpath[1];
  const dest = shortToLong[shortStr];
  if (!dest) {
    ctx.throw(500, `Unknown short URL '${shortStr}'`);
  }
  const destUrl = `https://www.hebcal.com/${dest}/${base}?` + qs.toString();
  ctx.set('Cache-Control', 'private');
  ctx.redirect(destUrl);
}
