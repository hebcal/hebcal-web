/**
 * IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers) on the
 * machine-readable API responses, so agents can self-throttle.
 *
 * The 429s themselves (with Retry-After) are issued by Varnish, configured in
 * hebcal-devops. This app keeps no per-client counters, so it advertises the
 * policy and reports the full quota as the remaining allowance -- an upper
 * bound that Varnish's 429 + Retry-After corrects. Keep the numbers in sync
 * with the Varnish limit via `hebcal.ratelimit.quota` / `hebcal.ratelimit.window`
 * in hebcal-dot-com.ini (quota 0 turns the headers off).
 */
export const DEFAULT_QUOTA = 100;
export const DEFAULT_WINDOW_SECS = 60;
const POLICY_NAME = 'default';

/**
 * @param {Object<string,string>} iniConfig
 * @return {{quota: number, window: number}|null}
 */
export function rateLimitPolicy(iniConfig) {
  const q = parseInt(iniConfig?.['hebcal.ratelimit.quota'] ?? DEFAULT_QUOTA, 10);
  const w = parseInt(iniConfig?.['hebcal.ratelimit.window'] ?? DEFAULT_WINDOW_SECS, 10);
  if (!(q > 0) || !(w > 0)) return null;
  return {quota: q, window: w};
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
    const policy = rateLimitPolicy(ctx.iniConfig);
    if (!policy || !isApiRequest(ctx)) return;
    const {quota, window} = policy;
    ctx.set('RateLimit-Policy', `"${POLICY_NAME}";q=${quota};w=${window}`);
    ctx.set('RateLimit', `"${POLICY_NAME}";r=${quota};t=${window}`);
    if (ctx.response.get('Access-Control-Allow-Origin')) {
      ctx.append('Access-Control-Expose-Headers', 'RateLimit, RateLimit-Policy, Retry-After');
    }
  };
}
