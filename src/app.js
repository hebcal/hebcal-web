import Koa from 'koa';
import compress from 'koa-compress';
import timeout from 'koa-timeout-v2';
import render from 'koa-ejs';
import serve from 'koa-static';
import error from 'koa-error';
import path from 'path';
import pino from 'pino';
import {hebrewDateConverter} from './converter';
import {fridgeShabbat} from './fridge';
import {GeoDb} from '@hebcal/geo-sqlite';
import {shabbatApp} from './shabbat';
import {geoAutoComplete} from './complete';
import {homepage} from './homepage';
import maxmind from 'maxmind';
import {hebcalApp} from './hebcal';
import fs from 'fs';
const bodyParser = require('koa-bodyparser');


const app = new Koa();

const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = app.context.logger = pino(dest);

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

// const debugLog = pino(pino.destination(logDir + '/debug.log'));

app.use(async (ctx, next) => {
  /*
  debugLog.info(Object.assign({
    ip: ctx.request.headers['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
  }, ctx.request.headers));
  */
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.startTime = Date.now();
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.request.headers['accept-encoding'] == 'undefined') {
    ctx.request.headers['accept-encoding'] = 'identity';
  }
  if (!ctx.lookup) {
    const mmdbPath = 'GeoLite2-Country.mmdb';
    logger.info(`Opening ${mmdbPath}`);
    ctx.lookup = app.context.lookup = await maxmind.open(mmdbPath);
  }
  await next();
  logger.info(makeLogInfo(ctx, {
    duration: Date.now() - ctx.state.startTime,
  }));
});

// eslint-disable-next-line require-jsdoc
function makeLogInfo(ctx, attrs={}) {
  return Object.assign({
    status: ctx.response.status,
    length: ctx.response.length,
    ip: ctx.request.headers['x-client-ip'] || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.request.headers['user-agent'],
    ref: ctx.request.headers['referer'],
    cookie: ctx.request.headers['cookie'],
  }, attrs);
}

app.on('error', (err, ctx) => {
  logger.error(Object.assign(err, makeLogInfo(ctx)));
});

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

// Fix up querystring so we can later use ctx.request.query
app.use(async (ctx, next) => {
  const qs = ctx.request.querystring;
  if (qs && qs.length) {
    const semi = qs.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
  }
  // force error middleware to use proper json response type
  const accept = ctx.request.headers['accept'];
  const cfg = ctx.request.query.cfg;
  if ((cfg === 'json' || cfg === 'fc') && (!accept || accept === '*' || accept === '*/*')) {
    ctx.request.headers['accept'] = 'application/json';
  }
  await next();
});

app.use(error({
  engine: 'ejs',
  template: path.join(__dirname, 'views', 'error.ejs'),
}));

app.use(timeout(5000, {status: 503, message: 'Service Unavailable'}));

app.use(bodyParser());

// request dispatcher
app.use(async (ctx, next) => {
  const rpath = ctx.request.path;
  if (rpath == '/favicon.ico' || rpath.startsWith('/i/')) {
    ctx.set('Cache-Control', 'max-age=5184000');
    // let serve() handle this file
  } else if (rpath == '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
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
  } else if (rpath.startsWith('/hebcal')) {
    await hebcalApp(ctx);
  } else if (rpath.startsWith('/yahrzeit')) {
    const q = Object.assign({}, ctx.request.body, ctx.request.query);
    await ctx.render('yahrzeit-form', {
      title: 'Yahrzeit + Anniversary Calendar | Hebcal Jewish Calendar',
      q,
      count: +q.count || 6,
    });
  }
  await next();
});

app.use(serve('/var/www/html', {defer: true}));

process.on('unhandledRejection', (err) => {
  logger.fatal(err);
  console.log(err);
  process.exit(1);
});

if (process.env.NODE_ENV == 'production' ) {
  fs.writeFileSync(logDir + '/koa.pid', process.pid);
  process.on('SIGHUP', () => dest.reopen());
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  logger.info('Koa server listening on port ' + port);
  console.log('Koa server listening on port ' + port);
});
