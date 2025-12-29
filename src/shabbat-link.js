import {getLocationFromQuery, makeGeoUrlArgs2} from './common.js';
import {langNames} from './opts.js';

export async function shabbatJsLink(ctx) {
  const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
  const location0 = getLocationFromQuery(ctx.db, q);
  const location = location0 || ctx.db.lookupLegacyCity('New York');
  const geoUrlArgs = makeGeoUrlArgs2(q, location);
  await ctx.render('link', {
    q, geoUrlArgs,
    locationName: location.getName(),
    title: 'Embed Shabbat candle-lighting times in your website - Hebcal',
    langNames,
  });
}
