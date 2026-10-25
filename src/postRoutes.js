/**
 * The routes on www.hebcal.com that accept POST. Everything else is GET/HEAD
 * only, and `rejectMethodsOnGetOnlyPaths()` answers 405 for it before the body
 * parser runs, so a scanner's garbage body (e.g. a corrupt
 * `Content-Encoding: br`) never reaches the decompressor.
 *
 * This table is the single source of truth: a route belongs here only if its
 * handler reads `ctx.request.body` or otherwise serves a POST. Mirror any change
 * to router.js's dispatch for these paths here.
 */

/** Exact paths that accept POST. */
const POST_EXACT = new Set([
  '/converter', // HTML form still posted by some clients
  '/link',
  '/logout',
  '/login/apple/callback', // Apple form_post, see loginAppleCallback()
]);

/**
 * Path prefixes that accept POST, except for the listed GET-only exceptions.
 * @type {Array<{prefix: string, except?: string[]}>}
 */
const POST_PREFIXES = [
  {prefix: '/yahrzeit', except: ['/yahrzeit/email-status']},
  // router.js sends every /email* path but these two to emailForm()
  {prefix: '/email', except: ['/email/open', '/email/subscription-status']},
  {prefix: '/ma/'}, // Matomo tracker
  {prefix: '/matomo/'},
];

/**
 * @param {string} rpath
 * @returns {boolean}
 */
export function acceptsPost(rpath) {
  if (POST_EXACT.has(rpath)) {
    return true;
  }
  if (rpath.startsWith('/converter') && !rpath.startsWith('/converter/csv')) {
    return true; // router.js dispatches every /converter* path except /csv
  }
  for (const {prefix, except} of POST_PREFIXES) {
    if (rpath.startsWith(prefix) && !except?.includes(rpath)) {
      return true;
    }
  }
  return false;
}

/**
 * Koa middleware factory: 405 when the request uses one of `methods` on a path
 * that does not accept POST, i.e. a GET/HEAD-only path.
 *
 * Mount with `'POST'` ahead of the body parser so a scanner's garbage body is
 * never read or decompressed, and with `'OPTIONS'` after the CORS middleware,
 * which answers `cfg=` preflights itself with a 204.
 * @param {...string} methods
 * @returns {import('koa').Middleware}
 */
export function rejectMethodsOnGetOnlyPaths(...methods) {
  const rejected = new Set(methods);
  return async function rejectMethods(ctx, next) {
    if (rejected.has(ctx.method) && !acceptsPost(ctx.request.path)) {
      ctx.set('Allow', 'GET, HEAD');
      ctx.throw(405, `${ctx.method} not allowed; use GET instead`);
    }
    await next();
  };
}
