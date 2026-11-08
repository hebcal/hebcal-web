import conditional from 'koa-conditional-get';
import {send} from '@koa/send';
import serve from 'koa-static';
import {cacheControl,
  CACHE_CONTROL_7DAYS,
  CACHE_CONTROL_IMMUTABLE,
  noCacheOnServerError} from './cacheControl.js';
import {hebcalDownload} from './hebcal-download.js';
import {yahrzeitDownload} from './yahrzeitDownload.js';
import {zmanimIcalendar} from './zmanimDownload.js';
import {deserializeDownload} from './deserializeDownload.js';
import {createBaseApp, useBackendHostname, useObservability, useTimeout,
  useCompression, useResponseLength,
  startServer} from './app-common.js';
import './locale.js';

const app = createBaseApp();

useBackendHostname(app);

// Only the dynamic feeds get their own route label; static files, retired
// paths (now 404s) and scanners all fold into "other".
//
// Measured on production: download responses spread from 10ms to ~100ms and
// almost none exceed 200ms. 1s and 10s are kept so a stall still lands in a
// finite bucket and P99 stays computable.
useObservability(app, {
  routeSegments: new Set(['v2', 'v3', 'v4', 'ical', 'export']),
  latencyBuckets: [0.001, 0.0025, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.25, 1, 10],
});

app.use(async function limitMethodsAndSetCache(ctx, next) {
  const method = ctx.method;
  if (method !== 'GET' && method !== 'HEAD') {
    // Pass Allow as an error header rather than ctx.set(): this throws above
    // the catch-all in fixup0(), so Koa's own error handler writes the
    // response, and that strips every header already on ctx before
    // re-applying err.headers.
    ctx.throw(405, `${method} not allowed; use GET instead`,
        {headers: {'Allow': 'GET, HEAD'}});
  }
  await next();
  // Cache-Control set before a throw survives onto error responses in the
  // download app, because fixup0() only replaces the status and body.
  if (ctx.status === 404) {
    ctx.remove('Cache-Control');
  }
  noCacheOnServerError(ctx);
  // The error handler below echoes err.message straight into the body,
  // so keep browsers from sniffing an error string as HTML.
  ctx.set('X-Content-Type-Options', 'nosniff');
});

useTimeout(app);

app.use(async function fixup0(ctx, next) {
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (ctx.get('accept-encoding') === undefined) {
    ctx.request.header['accept-encoding'] = 'identity';
  }
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message + '\n';
    ctx.app.emit('error', err, ctx);
  }
});

app.use(conditional());
useCompression(app, {brotliQuality: 3, zstdLevel: 6});

useResponseLength(app);

const DOCUMENT_ROOT = '/var/www/html';

const bingUA = 'compatible; bingbot/2.';

// Fix up querystring so we can later use ctx.request.query
app.use(async function fixup2(ctx, next) {
  const path = ctx.request.path;
  if (path === '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
    return;
  }
  if (path.startsWith('/export') ||
      path.startsWith('/yahrzeit/yahrzeit.cgi/') ||
      path.startsWith('/hebcal/index.cgi/')) {
    // Old links double-URL-encoded the query string, either after a
    // real "?" (?subscribe=1%3B...) or in place of it (.ics%3Fsubscribe%3D1...).
    // Decode and rewrite the URL in place so the router serves it directly.
    // note we use unescape() instead of decodeURIComponent() due to ancient latin-1 encoding
    const qs0 = ctx.request.querystring;
    if (qs0.startsWith('subscribe=1%3B') || qs0.startsWith('dl=1%3B')) {
      ctx.request.url = `${path}?${unescape(qs0)}`;
    } else {
      const encQuery = path.search(/\.ics%3F(subscribe|dl)%3D1/);
      if (encQuery !== -1) {
        const qs = unescape(path.substring(encQuery + 7));
        ctx.request.url = `/export/export.ics?${qs}`;
      }
    }
    const semi = ctx.request.querystring.includes(';');
    if (semi) {
      ctx.request.querystring = ctx.request.querystring.replaceAll(';', '&');
    }
  } else if (path.startsWith('/v4/')) {
    const slash = path.indexOf('/', 4);
    const data = (slash === -1) ? path.substring(4) : path.substring(4, slash);
    const filename = (slash === -1) ? 'hebcal.ics' : path.substring(slash + 1);
    try {
      const q = deserializeDownload(data);
      ctx.request.query = {...q, ...ctx.request.query};
      ctx.request.path = '/export/' + filename;
    } catch (err) {
      const userAgent = ctx.get('user-agent');
      const isBingBot = userAgent.includes(bingUA);
      const status = isBingBot ? 404 : err.status || 400;
      ctx.throw(status, `Invalid download URL: ${data}`);
    }
  } else if (path.startsWith('/v2')) {
    // Download path of the form /v2/[hy]/<base64-querystring>/<filename>
    const slash = path.indexOf('/', 6);
    const qs64 = (slash === -1) ? path.substring(6) : path.substring(6, slash);
    const filename = (slash === -1) ? 'hebcal.ics' : path.substring(slash + 1);
    const qs = Buffer.from(qs64, 'base64').toString('ascii');
    ctx.request.url = '/export/' + filename + '?' + qs;
  }
  await next();
});

app.use(function fixup3(ctx, next) {
  const rpath = ctx.request.path;
  const q = ctx.request.query;
  if (rpath.startsWith('/export/') && (q.v === undefined || !q.v.length) && q.y1 && q.m1 && q.d1) {
    ctx.request.query.v = 'yahrzeit';
  }
  return next();
});

const CACHE_CONTROL_14DAYS = cacheControl(14);

app.use(function sendStatic(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath.startsWith('/ical')) {
    ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  }
  if (rpath === '/favicon.ico') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  }
  if (rpath === '/ping') {
    ctx.type = 'text/plain';
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  }
  return next();
});

// This app has no cooperative timeout checkpoints, unlike app-www.js. Nothing
// in the chain ahead of the dispatcher yields to the event loop: sendStatic()
// does async fs reads, but only on the paths where it answers the request and
// ends the chain, so a checkpoint after it is still reached microseconds into
// the request. With no await that can let the 8s timer fire, ctx.state.timeout
// is always false here and a checkpoint would be pure decoration.

// request dispatcher
app.use(async function router(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath.startsWith('/v3')) {
    return yahrzeitDownload(ctx);
  } else if (rpath.startsWith('/export') ||
             rpath.startsWith('/yahrzeit/yahrzeit.cgi/') ||
             rpath.startsWith('/hebcal/index.cgi/')) {
    ctx.state.logQuery = true;
    const vv = ctx.request.query.v;
    if (typeof vv === 'string' && vv.startsWith('y')) {
      return yahrzeitDownload(ctx);
    } else if (vv === '1' || vv === 'now') {
      ctx.set('Cache-Control', CACHE_CONTROL_14DAYS);
      return hebcalDownload(ctx);
    } else {
      const status = vv === undefined ? 404 : 400;
      ctx.throw(status, `Invalid download URL: v=${vv}`);
    }
  } else if (rpath.startsWith('/zmanim') || rpath.startsWith('/sunrs')) {
    return zmanimIcalendar(ctx);
  }
  await next();
});

app.use(serve(DOCUMENT_ROOT, {defer: false, maxage: 604800000}));

// Export app for testing
export {app};

// Only start server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(app, 8080);
}
