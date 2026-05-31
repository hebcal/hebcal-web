import conditional from 'koa-conditional-get';
import {send} from '@koa/send';
import serve from 'koa-static';
import {downloadHref2} from './makeDownloadProps.js';
import {httpRedirect} from './common.js';
import {cacheControl,
  CACHE_CONTROL_7DAYS,
  CACHE_CONTROL_IMMUTABLE} from './cacheControl.js';
import {hebcalDownload} from './hebcal-download.js';
import {yahrzeitDownload} from './yahrzeitDownload.js';
import {zmanimIcalendar} from './zmanim.js';
import {deserializeDownload} from './deserializeDownload.js';
import {readJSON} from './readJSON.js';
import {createBaseApp, useObservability, useTimeout, useCompression,
  useResponseLength, startServer, stopIfTimedOut} from './app-common.js';
import './locale.js';

const redirectMap = readJSON('./redirectDownload.json');

const app = createBaseApp();

useObservability(app);

app.use(async function onlyGetAndHead(ctx, next) {
  const method = ctx.method;
  if (method !== 'GET' && method !== 'HEAD') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, `${method} not allowed; use GET instead`);
  }
  await next();
});

useTimeout(app);

app.use(stopIfTimedOut());

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

// Redirect /v2/h/ to /v4/
app.use(async function redirV2(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath.startsWith('/v2/h/')) {
    const {filename, qs} = parseV2Path(rpath);
    const sp = new URLSearchParams(qs);
    const query = Object.fromEntries(sp.entries());
    // Only do the redirect if this looks like a valid v2 download URL
    if (query.v === '1') {
      const f2 = query.year === 'now' ? filename.replace(/^hebcal_\d\d\d\d[Hh]?/, 'hebcal') : filename;
      const url = downloadHref2(query, f2);
      ctx.status = 301;
      ctx.redirect(url);
      return;
    }
  }
  return next();
});

app.use(conditional());
useCompression(app, {brotliQuality: 3, zstdLevel: 10});

app.use(stopIfTimedOut());
useResponseLength(app);

const DOCUMENT_ROOT = '/var/www/html';

// Send static files before regular request dispatch
app.use(async function fixup1(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath === '/') {
    ctx.redirect('https://www.hebcal.com/');
    return;
  }
  if (rpath === '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
    return;
  }
  if (rpath === '/ical' || rpath === '/ical/') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    ctx.redirect('https://www.hebcal.com/ical/', 301);
    return;
  }
  if (rpath.startsWith('/ical/') && rpath.endsWith('.ics/')) {
    const path = rpath.substring(0, rpath.length - 1);
    httpRedirect(ctx, path, 301);
    return;
  }
  if (rpath.startsWith('/cal/')) {
    const path = rpath.substring(5);
    httpRedirect(ctx, `/ical/${path}`, 301);
    return;
  }
  if (rpath.startsWith('/index.php/ical/')) {
    const path = rpath.substring(16);
    httpRedirect(ctx, `/ical/${path}`, 301);
    return;
  }
  return next();
});

app.use(stopIfTimedOut());

app.use(async function redirLegacy(ctx, next) {
  if (ctx.request.querystring.length === 0) {
    const rpath = ctx.request.path;
    const rpath0 = rpath.substring(0, rpath.length - 1);
    const destination = redirectMap[rpath] || redirectMap[rpath0];
    if (destination !== undefined) {
      ctx.status = 301;
      ctx.redirect(destination);
      return;
    }
  }
  return next();
});

const bingUA = 'compatible; bingbot/2.';

// Fix up querystring so we can later use ctx.request.query
app.use(async function fixup2(ctx, next) {
  const path = ctx.request.path;
  if (path.startsWith('/export') ||
      path.startsWith('/yahrzeit/yahrzeit.cgi/') ||
      path.startsWith('/yahrzeit/index.cgi/') ||
      path.startsWith('/hebcal/index.cgi/')) {
    // note we use unescape() instead of decodeURIComponent() due to ancient latin-1 encoding
    if (ctx.request.querystring.startsWith('subscribe=1%3B') || ctx.request.querystring.startsWith('dl=1%3B')) {
      const qs = unescape(ctx.request.querystring).replaceAll(';', '&');
      httpRedirect(ctx, `${path}?redir=1&${qs}`, 301);
      return;
    } else {
      const encQuery = path.indexOf('.ics%3Fsubscribe%3D1');
      if (encQuery !== -1) {
        redirEncQuery(path, encQuery, ctx);
        return;
      }
      const encQueryDL = path.indexOf('.ics%3Fdl%3D1');
      if (encQueryDL !== -1) {
        redirEncQuery(path, encQueryDL, ctx);
        return;
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
    const {filename, qs} = parseV2Path(path);
    ctx.request.url = '/export/' + filename + '?' + qs;
  }
  await next();
});

app.use(stopIfTimedOut());

app.use(async function fixup3(ctx, next) {
  const rpath = ctx.request.path;
  const q = ctx.request.query;
  if (rpath.startsWith('/export/') && (q.v === undefined || !q.v.length) && q.y1 && q.m1 && q.d1) {
    ctx.request.query.v = 'yahrzeit';
  }
  return next();
});

const CACHE_CONTROL_14DAYS = cacheControl(14);

app.use(async function sendStatic(ctx, next) {
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

app.use(stopIfTimedOut());

app.use(serve(DOCUMENT_ROOT, {defer: false, maxage: 604800000}));

// Export app for testing
export {app};

// Only start server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(app, 8080);
}

function redirEncQuery(path, encQuery, ctx) {
  const qs = unescape(path.substring(encQuery + 7)).replaceAll(';', '&');
  httpRedirect(ctx, `/export/export.ics?redir=1&${qs}`, 301);
}

// Parse a /v2 download path of the form /v2/<base64-querystring>/<filename>,
// returning the filename and the base64-decoded query string.
function parseV2Path(path) {
  const slash = path.indexOf('/', 6);
  const data = (slash === -1) ? path.substring(6) : path.substring(6, slash);
  const filename = (slash === -1) ? 'hebcal.ics' : path.substring(slash + 1);
  const qs = Buffer.from(data, 'base64').toString('ascii');
  return {filename, qs};
}
