export const CACHE_CONTROL_1_YEAR = cacheControl(365);
export const CACHE_CONTROL_IMMUTABLE = CACHE_CONTROL_1_YEAR + ', immutable';
export const CACHE_CONTROL_30DAYS = cacheControl(30);
export const CACHE_CONTROL_7DAYS = cacheControl(7);

/**
 * @param {number} days
 * @return {string}
 */
export function cacheControl(days) {
  const seconds = Math.trunc(days * 24 * 60 * 60);
  return `public, max-age=${seconds}, s-maxage=${seconds}`;
}

/**
 * A 5xx must not advertise freshness. Handlers often set Cache-Control,
 * Expires or validators before doing the work that then throws, and neither
 * koa-error (www) nor the download app's catch-all clears response headers,
 * so without this a 500/503 can go out with e.g. a 14-day public max-age.
 * 501 is included even though RFC 9110 makes it heuristically cacheable: our
 * 501s mean "use hebcal-api-go", which Varnish routes around anyway.
 * Call after `await next()` in middleware that sees the final status.
 * @param {import('koa').Context} ctx
 */
export function noCacheOnServerError(ctx) {
  if (ctx.status >= 500) {
    ctx.remove('Expires');
    ctx.remove('ETag');
    ctx.remove('Last-Modified');
    ctx.set('Cache-Control', 'no-store');
  }
}
