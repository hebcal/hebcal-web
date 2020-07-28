import {getLocationFromQuery} from './common';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export function geoLookup(ctx) {
  try {
    const location = getLocationFromQuery(ctx.db, ctx.request.query, false);
    ctx.body = location;
  } catch (err) {
    ctx.throw(404, 'Location not found');
  }
}
