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
import {join} from 'path';
import pino from 'pino';
import {makeLogInfo, httpRedirect, errorLogger} from './common';
import {hebcalDownload} from './hebcal-download';
import {yahrzeitDownload} from './yahrzeit';
import {googleAnalytics} from './analytics';
import {MysqlDb} from './db';

const app = new Koa();

const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = app.context.logger = pino({
  level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
}, dest);

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
const iniPath = join(iniDir, 'hebcal-dot-com.ini');
app.context.iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

app.context.mysql = new MysqlDb(logger, app.context.iniConfig);

app.context.launchDate = new Date();

app.use(xResponseTime());
app.use(googleAnalytics('UA-967247-5'));

app.use(async (ctx, next) => {
  ctx.state.startTime = Date.now();
  try {
    // don't allow compress middleware to assume that a missing accept-encoding header implies 'accept-encoding: *'
    if (typeof ctx.get('accept-encoding') == 'undefined') {
      ctx.request.header['accept-encoding'] = 'identity';
    }
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit('error', err, ctx);
  }
  logger.info(makeLogInfo(ctx, {
    duration: Date.now() - ctx.state.startTime,
  }));
});

app.on('error', errorLogger());

app.use(conditional());
app.use(compress({
  gzip: true,
  deflate: true,
  br: true,
}));

const DOCUMENT_ROOT = '/var/www/html';

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';

// Send static files before timeout and regular request dispatch
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath === '/') {
    ctx.redirect('https://www.hebcal.com/');
  } else if (rpath == '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
  } else if (rpath === '/ical' || rpath === '/ical/') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    ctx.redirect('https://www.hebcal.com/ical/', 301);
  } else if (rpath === '/favicon.ico') {
    ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    await send(ctx, rpath, {root: DOCUMENT_ROOT});
  } else if (rpath.startsWith('/ical')) {
    ctx.state.trackPageview = true;
    ctx.set('Cache-Control', 'max-age=5184000');
    await send(ctx, rpath, {root: DOCUMENT_ROOT});
  } else if (rpath === '/ping') {
    ctx.type = 'text/plain';
    await send(ctx, rpath, {root: DOCUMENT_ROOT});
  } else {
    ctx.state.trackPageview = true;
    await next();
  }
});

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  const path = ctx.request.path;
  if (path.startsWith('/export') ||
      path.startsWith('/yahrzeit/yahrzeit.cgi/') ||
      path.startsWith('/hebcal/index.cgi/')) {
    // note we use unescape() instead of decodeURIComponent() due to ancient latin-1 encoding
    if (ctx.request.querystring.startsWith('subscribe=1%3B') || ctx.request.querystring.startsWith('dl=1%3B')) {
      const qs = unescape(ctx.request.querystring).replace(/;/g, '&');
      ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
      httpRedirect(ctx, `${path}?redir=1&${qs}`, 301);
      return;
    } else {
      const encQuery = path.indexOf('.ics%3Fsubscribe%3D1');
      if (encQuery != -1) {
        const qs = unescape(path.substring(encQuery + 7)).replace(/;/g, '&');
        const path2 = path.substring(0, encQuery + 4);
        ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
        httpRedirect(ctx, `${path2}?redir=1&${qs}`, 301);
        return;
      }
    }
    const semi = ctx.request.querystring.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = ctx.request.querystring.replace(/;/g, '&');
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

const TIMEOUT = 20 * 1000;
app.use(timeout(TIMEOUT, {status: 503, message: 'Service Unavailable'}));

// request dispatcher
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath.startsWith('/v3')) {
    await yahrzeitDownload(ctx);
  } else if (rpath.startsWith('/export') ||
             rpath.startsWith('/yahrzeit/yahrzeit.cgi/') ||
             rpath.startsWith('/hebcal/index.cgi/')) {
    ctx.set('Cache-Control', 'max-age=2592000');
    if (ctx.request.query.v == 'yahrzeit') {
      await yahrzeitDownload(ctx);
    } else if (ctx.request.query.v == '1') {
      await hebcalDownload(ctx);
    }
  }
  await next();
});

app.use(serve(DOCUMENT_ROOT, {defer: true}));

process.on('unhandledRejection', (err) => {
  logger.fatal(err);
  console.log(err);
  process.exit(1);
});

if (process.env.NODE_ENV == 'production' ) {
  fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
  process.on('SIGHUP', () => dest.reopen());
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  logger.info('Koa server listening on port ' + port);
  console.log('Koa server listening on port ' + port);
});
