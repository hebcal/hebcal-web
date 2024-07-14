import {GeoDb} from '@hebcal/geo-sqlite';
import fs from 'fs';
import ini from 'ini';
import Koa from 'koa';
import compress from 'koa-compress';
import conditional from 'koa-conditional-get';
import send from 'koa-send';
import serve from 'koa-static';
import timeout from 'koa-timeout-v2';
import xResponseTime from 'koa-better-response-time';
import zlib from 'zlib';
import {downloadHref2} from './makeDownloadProps.js';
import {join} from 'path';
import {makeLogger, errorLogger, accessLogger, makeLogInfo,
  logMemoryUsage} from './logger.js';
import {httpRedirect, stopIfTimedOut, cacheControl,
  CACHE_CONTROL_30DAYS,
  CACHE_CONTROL_IMMUTABLE} from './common.js';
import {hebcalDownload} from './hebcal-download.js';
import {yahrzeitDownload} from './yahrzeit.js';
import {MysqlDb} from './db.js';
import {zmanimIcalendar} from './zmanim.js';
import {deserializeDownload} from './deserializeDownload.js';
import {readJSON} from './readJSON.js';

const redirectMap = readJSON('./redirectDownload.json');
const app = new Koa();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const logger = makeLogger(logDir);
logger.info('Koa server: starting up');
logMemoryUsage(logger);
setInterval(() => {
  logMemoryUsage(logger);
}, 30000);

app.context.logger = logger;

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
const geoDb = app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);
setImmediate(() => {
  geoDb.cacheZips();
  geoDb.cacheGeonames();
});

const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
const iniPath = join(iniDir, 'hebcal-dot-com.ini');
app.context.iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

app.context.mysql = new MysqlDb(logger, app.context.iniConfig);

app.context.launchDate = new Date();

app.use(async function trace0(ctx, next) {
  ctx.state.trace = new Map();
  await next();
});

app.use(xResponseTime());
app.use(accessLogger(logger));
app.on('error', errorLogger(logger));

app.use(async function onlyGetAndHead(ctx, next) {
  const method = ctx.method;
  if (method !== 'GET' && method !== 'HEAD') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, `Method ${method} not allowed; try using GET`);
  }
  await next();
});

app.use(timeout(6000, {
  status: 503,
  message: 'Service Unavailable',
  callback: function(ctx) {
    const logInfo = makeLogInfo(ctx);
    logInfo.status = 503;
    const start = ctx.state.startTime;
    const trace = logInfo.trace = {};
    for (const [name, msec] of ctx.state.trace.entries()) {
      const delta = msec - start;
      trace[name] = delta;
    }
    ctx.logger.warn(logInfo);
  },
}));

app.use(stopIfTimedOut());

app.use(async function fixup0(ctx, next) {
  ctx.state.trace.set('fixup0', Date.now());
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.get('accept-encoding') === 'undefined') {
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
    const slash = rpath.indexOf('/', 6);
    const data = (slash === -1) ? rpath.substring(6) : rpath.substring(6, slash);
    const filename = (slash === -1) ? 'hebcal.ics' : rpath.substring(slash + 1);
    const buff = Buffer.from(data, 'base64');
    const qs = buff.toString('ascii');
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
app.use(compress({
  gzip: true,
  deflate: false,
  br: {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 3,
    },
  },
}));

app.use(stopIfTimedOut());

const DOCUMENT_ROOT = '/var/www/html';

// Send static files before regular request dispatch
app.use(async function fixup1(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath === '/') {
    ctx.redirect('https://www.hebcal.com/');
    return;
  } else if (rpath == '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
    return;
  } else if (rpath === '/ical' || rpath === '/ical/') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    ctx.redirect('https://www.hebcal.com/ical/', 301);
    return;
  } else if (rpath.startsWith('/ical/') && rpath.endsWith('.ics/')) {
    const path = rpath.substring(0, rpath.length - 1);
    httpRedirect(ctx, path, 301);
    return;
  } else if (rpath.startsWith('/cal/')) {
    const path = rpath.substring(5);
    httpRedirect(ctx, `/ical/${path}`, 302);
    return;
  } else if (rpath.startsWith('/index.php/ical/')) {
    const path = rpath.substring(16);
    httpRedirect(ctx, `/ical/${path}`, 302);
    return;
  } else {
    return next();
  }
});

app.use(stopIfTimedOut());

app.use(async function redirLegacy(ctx, next) {
  if (ctx.request.querystring.length === 0) {
    const rpath = ctx.request.path;
    const rpath0 = rpath.substring(0, rpath.length - 1);
    const destination = redirectMap[rpath] || redirectMap[rpath0];
    if (typeof destination !== 'undefined') {
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
  ctx.state.trace.set('fixup2', Date.now());
  const path = ctx.request.path;
  if (path.startsWith('/export') ||
      path.startsWith('/yahrzeit/yahrzeit.cgi/') ||
      path.startsWith('/yahrzeit/index.cgi/') ||
      path.startsWith('/hebcal/index.cgi/')) {
    // note we use unescape() instead of decodeURIComponent() due to ancient latin-1 encoding
    if (ctx.request.querystring.startsWith('subscribe=1%3B') || ctx.request.querystring.startsWith('dl=1%3B')) {
      const qs = unescape(ctx.request.querystring).replace(/;/g, '&');
      httpRedirect(ctx, `${path}?redir=1&${qs}`, 301);
      return;
    } else {
      const encQuery = path.indexOf('.ics%3Fsubscribe%3D1');
      if (encQuery != -1) {
        redirEncQuery(path, encQuery, ctx);
        return;
      }
      const encQueryDL = path.indexOf('.ics%3Fdl%3D1');
      if (encQueryDL != -1) {
        redirEncQuery(path, encQueryDL, ctx);
        return;
      }
    }
    const semi = ctx.request.querystring.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = ctx.request.querystring.replace(/;/g, '&');
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
      const isBingBot = userAgent.indexOf(bingUA) !== -1;
      const status = isBingBot ? 404 : err.status || 400;
      ctx.throw(status, `Invalid download URL: ${data}`);
    }
  } else if (path.startsWith('/v2')) {
    const slash = path.indexOf('/', 6);
    const data = (slash === -1) ? path.substring(6) : path.substring(6, slash);
    const filename = (slash === -1) ? 'hebcal.ics' : path.substring(slash + 1);
    const buff = Buffer.from(data, 'base64');
    const qs = buff.toString('ascii');
    ctx.request.url = '/export/' + filename + '?' + qs;
  }
  await next();
});

app.use(stopIfTimedOut());

app.use(async function fixup3(ctx, next) {
  const rpath = ctx.request.path;
  const q = ctx.request.query;
  if (rpath.startsWith('/export/') && (typeof q.v === 'undefined' || !q.v.length) && q.y1 && q.m1 && q.d1) {
    ctx.request.query.v = 'yahrzeit';
  }
  return next();
});

const CACHE_CONTROL_14DAYS = cacheControl(14);

app.use(async function sendStatic(ctx, next) {
  ctx.state.trace.set('sendStatic', Date.now());
  const rpath = ctx.request.path;
  if (rpath.startsWith('/ical')) {
    ctx.set('Cache-Control', CACHE_CONTROL_14DAYS);
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  } else if (rpath === '/favicon.ico') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  } else if (rpath === '/ping') {
    ctx.type = 'text/plain';
    return send(ctx, rpath, {root: DOCUMENT_ROOT});
  }
  return next();
});

// request dispatcher
app.use(async function router(ctx, next) {
  ctx.state.trace.set('router', Date.now());
  const rpath = ctx.request.path;
  if (rpath.startsWith('/v3')) {
    return yahrzeitDownload(ctx);
  } else if (rpath.startsWith('/export') ||
             rpath.startsWith('/yahrzeit/yahrzeit.cgi/') ||
             rpath.startsWith('/hebcal/index.cgi/')) {
    ctx.state.logQuery = true;
    const vv = ctx.request.query.v;
    if (typeof vv === 'string' && vv[0] === 'y') {
      return yahrzeitDownload(ctx);
    } else if (vv === '1' || vv === 'now') {
      ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
      return hebcalDownload(ctx);
    } else {
      const status = typeof vv === 'undefined' ? 404 : 400;
      ctx.throw(status, `Invalid download URL: v=${vv}`);
    }
  } else if (rpath.startsWith('/zmanim') || rpath.startsWith('/sunrs')) {
    return zmanimIcalendar(ctx);
  }
  await next();
});

app.use(stopIfTimedOut());

app.use(serve(DOCUMENT_ROOT, {defer: false, maxage: 604800000}));

if (process.env.NODE_ENV == 'production') {
  fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
  process.on('SIGHUP', () => logger.info('Ignoring SIGHUP'));
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  const msg = 'Koa server listening on port ' + port;
  logger.info(msg);
  console.log(msg);
});

function redirEncQuery(path, encQuery, ctx) {
  const qs = unescape(path.substring(encQuery + 7)).replace(/;/g, '&');
  httpRedirect(ctx, `/export/export.ics?redir=1&${qs}`, 301);
}
