import Koa from 'koa';
import fs from 'fs';
import util from 'util';
import path from 'path';
import pino from 'pino';
import compress from 'koa-compress';
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import {GeoDb} from '@hebcal/geo-sqlite';
import {yahrzeitDownload} from './yahrzeit';
import {hebcalDownload} from './hebcal-download';

const app = new Koa();

const stat = util.promisify(fs.stat);
const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = app.context.logger = pino({
  level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
}, dest);

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

app.use(async (ctx, next) => {
  ctx.state.startTime = Date.now();
  try {
    // don't allow compress middleware to assume that a missing accept-encoding header implies 'accept-encoding: *'
    if (typeof ctx.request.header['accept-encoding'] == 'undefined') {
      ctx.request.header['accept-encoding'] = 'identity';
    }
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit('error', err, ctx);
  }
});

app.on('error', (err, ctx) => {
  if (ctx && ctx.status != 404) {
    logger.error(Object.assign(err, {
      status: ctx.status,
      ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
      url: ctx.request.originalUrl,
    }));
  }
});

app.use(conditional());
app.use(etag());
app.use(compress({
  threshold: 2048,
  gzip: true,
  deflate: true,
  br: true,
}));

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  const path = ctx.request.path;
  if (path.startsWith('/export') ||
      path.startsWith('/yahrzeit/yahrzeit.cgi/') ||
      path.startsWith('/hebcal/index.cgi/')) {
    if (ctx.request.querystring.startsWith('subscribe=1%3B') || ctx.request.querystring.startsWith('dl=1%3B')) {
      ctx.request.querystring = decodeURIComponent(ctx.request.querystring);
    } else {
      const encQuery = path.indexOf('.ics%3Fsubscribe%3D1');
      if (encQuery != -1) {
        ctx.request.querystring = decodeURIComponent(path.substring(encQuery + 7));
        ctx.request.path = path.substring(0, encQuery + 4);
      }
    }
    const semi = ctx.request.querystring.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = ctx.request.querystring.replace(/;/g, '&');
    }
  } else if (path.startsWith('/v2')) {
    const slash = path.indexOf('/', 6);
    if (slash != -1) {
      const data = path.substring(6, slash);
      const filename = path.substring(slash + 1);
      const buff = Buffer.from(data, 'base64');
      const qs = buff.toString('ascii');
      ctx.request.url = '/export/' + filename + '?' + qs;
    }
  }
  await next();
});

// request dispatcher
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath == '/') {
    ctx.redirect('https://www.hebcal.com/');
  } else if (rpath == '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
  } else if (rpath == '/ical' || rpath == '/ical/') {
    ctx.redirect('https://www.hebcal.com/ical/');
  } else if (rpath == '/favicon.ico' || rpath.startsWith('/ical')) {
    const fpath = path.join('/var/www/html', rpath);
    const fstat = await stat(fpath);
    if (fstat.isFile()) {
      ctx.set('Cache-Control', 'max-age=5184000');
      ctx.type = path.extname(fpath);
      ctx.length = fstat.size;
      ctx.lastModified = fstat.mtime;
      ctx.body = fs.createReadStream(fpath);
    }
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

// logger
app.use(async (ctx) => {
  const duration = Date.now() - ctx.state.startTime;
  logger.info({
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.header['user-agent'],
    cookie: ctx.request.header['cookie'],
    status: ctx.response.status,
    length: ctx.response.length,
    duration,
  });
});

const port = process.env.NODE_PORT || 8080;
app.listen(port);
console.log('Koa server listening on port ' + port);
