/**
 * IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers) on the
 * machine-readable API responses, so agents can self-throttle.
 *
 * The limits mirror the vsthrottle rules in Varnish's default.vcl
 * (hebcal-devops), which also issues the 429s (Retry-After: 30). Keep these
 * constants in sync with that file. This app keeps no per-client counters, so
 * `r` reports the full quota -- an upper bound that a 429 corrects.
 *
 * Note that `cfg=json|xml` converter and `cfg=json` shabbat responses, /zmanim
 * and /complete come from hebcal-api-go, not this app; Varnish's vcl_deliver
 * is the place that covers those (see CLAUDE.md).
 */

/** `is_denied(client.identity, 150, 10s, 30s)` -- everything but /home, /converter */
export const DEFAULT_POLICY = {quota: 150, window: 10};
/** `is_denied(client.identity, 60, 3s, 30s)` -- /converter */
export const CONVERTER_POLICY = {quota: 60, window: 3};

/**
 * @param {string} rpath
 * @return {{quota: number, window: number}}
 */
export function policyForPath(rpath) {
  return rpath.startsWith('/converter') ? CONVERTER_POLICY : DEFAULT_POLICY;
}

/**
 * Whether the request targets a machine-readable API response
 * @param {any} ctx
 * @return {boolean}
 */
function isApiRequest(ctx) {
  const rpath = ctx.path;
  if (rpath.startsWith('/leyning') || rpath.startsWith('/learning') ||
      rpath === '/api-docs/openapi.json') {
    return true;
  }
  const cfg = ctx.query.cfg;
  return typeof cfg === 'string' && cfg !== '';
}

/**
 * Koa middleware factory
 * @return {function(any, function(): Promise<any>): Promise<void>}
 */
export function rateLimitHeaders() {
  return async function rateLimitHeadersMiddleware(ctx, next) {
    await next();
    if (!isApiRequest(ctx)) return;
    const {quota, window} = policyForPath(ctx.path);
    ctx.set('RateLimit-Policy', `"default";q=${quota};w=${window}`);
    ctx.set('RateLimit', `"default";r=${quota};t=${window}`);
    if (ctx.response.get('Access-Control-Allow-Origin')) {
      ctx.append('Access-Control-Expose-Headers', 'RateLimit, RateLimit-Policy, Retry-After');
    }
  };
}
