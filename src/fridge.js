import {setDefautLangTz} from './defaultLangTz.js';
import {langNames} from './lang.js';
import '@hebcal/locales';

/**
 * The /fridge index form. The candle-lighting results it submits to
 * /shabbat/fridge.cgi are served by hebcal-api-go.
 * @param {import('koa').Context} ctx
 */
export async function fridgeIndex(ctx) {
  const q = await setDefautLangTz(ctx);
  const location = ctx.state.location || ctx.db.lookupLegacyCity('New York');
  if (location.geo === 'geoname') {
    q.geonameid = location.getGeoId();
    q.geo = 'geoname';
  } else if (location.geo === 'zip') {
    q.zip = location.getGeoId();
    q.geo = 'zip';
  }
  q['city-typeahead'] = location && location.geo !== 'pos' ? location.getName() : '';
  return ctx.render('fridge-index', {
    q,
    langNames,
  });
}
