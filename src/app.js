import Koa from 'koa';
import compress from 'koa-compress';
import conditional from 'koa-conditional-get';
import etag from 'koa-etag';
import render from 'koa-ejs';
import path from 'path';
import pino from 'pino';
import fs from 'fs';
import util from 'util';
import {hebrewDateConverter} from './converter';
import {fridgeShabbat} from './fridge';
import {GeoDb} from '@hebcal/geo-sqlite';
import {shabbatApp} from './shabbat';
import {geoAutoComplete} from './complete';
import {homepage} from './homepage';
import maxmind from 'maxmind';

const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = pino(dest);

const app = new Koa();

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

app.use(async (ctx, next) => {
  if (!ctx.lookup) {
    const mmdbPath = 'GeoLite2-Country.mmdb';
    logger.info(`Opening ${mmdbPath}`);
    ctx.lookup = app.context.lookup = await maxmind.open(mmdbPath);
  }
  return next();
});

app.use(async (ctx, next) => {
  ctx.state.rpath = ctx.request.path;
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
  logger.error(Object.assign(err, {
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    url: ctx.request.originalUrl,
  }));
});

app.use(conditional());
app.use(etag());
app.use(compress({
  threshold: 2048,
  gzip: true,
  deflate: true,
  br: true,
}));

render(app, {
  root: path.join(__dirname, 'views'),
  layout: false,
  viewExt: 'ejs',
  debug: false,
  async: true,
});

const stat = util.promisify(fs.stat);

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  const qs = ctx.request.querystring;
  if (qs && qs.length) {
    const semi = qs.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
  }
  return next();
});

// request dispatcher
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath == '/favicon.ico' || rpath == '/robots.txt' || rpath.startsWith('/i/')) {
    const fpath = path.join('/var/www/html', rpath);
    const fstat = await stat(fpath);
    if (fstat.isFile()) {
      ctx.set('Cache-Control', 'max-age=5184000');
      ctx.type = path.extname(fpath);
      ctx.length = fstat.size;
      ctx.lastModified = fstat.mtime;
      ctx.body = fs.createReadStream(fpath);
    }
  } else if (rpath == '/') {
    await homepage(ctx);
  } else if (rpath.startsWith('/complete')) {
    await geoAutoComplete(ctx);
  } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
    await fridgeShabbat(ctx);
  } else if (rpath.startsWith('/converter')) {
    await hebrewDateConverter(ctx);
  } else if (rpath.startsWith('/shabbat')) {
    await shabbatApp(ctx);
  }
  return next();
});

// logger
app.use(async (ctx) => {
  const duration = Date.now() - ctx.state.startTime;
  logger.info({
    status: ctx.response.status,
    length: ctx.response.length,
    ip: ctx.request.header['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.header['user-agent'],
    ref: ctx.request.header['referer'],
    cookie: ctx.request.header['cookie'],
    duration,
  });
});

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => console.log('Koa server listening on port ' + port));
