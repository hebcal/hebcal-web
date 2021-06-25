/* eslint-disable require-jsdoc */
import {getLocationFromQuery, tooltipScript, typeaheadScript, empty, langNames} from './common';

export async function shabbatJsLink(ctx) {
  const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
  const location0 = getLocationFromQuery(ctx.db, q);
  const location = location0 || ctx.db.lookupLegacyCity('New York');
  let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
  if (q.M === 'on') {
    delete q.m;
  }
  q.lg = q.lg || (q.a === 'on' ? 'a' : 's');
  for (const key of ['b', 'M', 'm', 'lg']) {
    if (!empty(q[key])) {
      geoUrlArgs += `&${key}=${q[key]}`;
    }
  }
  const geoUrlArgsDbl = geoUrlArgs.replace(/&/g, '&amp;');
  await ctx.render('link', {
    q, geoUrlArgs, geoUrlArgsDbl,
    locationName: location.getName(),
    title: 'Add weekly Shabbat candle-lighting times to your synagogue website | Hebcal Jewish Calendar',
    xtra_html: tooltipScript + typeaheadScript,
    langNames,
  });
}
