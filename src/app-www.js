import fs from 'fs';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import error from 'koa-error';
import render from 'koa-ejs';
import serve from 'koa-static';
import timeout from 'koa-timeout-v2';
import xResponseTime from 'koa-better-response-time';
import ini from 'ini';
import maxmind from 'maxmind';
import path from 'path';
import zlib from 'zlib';
import {makeLogger, errorLogger, accessLogger} from './logger';
import {GeoDb} from '@hebcal/geo-sqlite';
import {wwwRouter} from './router';
import {googleAnalytics} from './analytics';
import {MysqlDb} from './db';
import {stopIfTimedOut} from './common';
import pkg from '../package.json';

const DOCUMENT_ROOT = '/var/www/html';

const app = new Koa();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const logger = makeLogger(logDir);
logger.info('Koa server: starting up');
app.context.logger = logger;

const geoipCountryMmdbPath = 'GeoLite2-Country.mmdb';
setImmediate(async () => {
  logger.info(`Opening ${geoipCountryMmdbPath}`);
  try {
    app.context.geoipCountry = await maxmind.open(geoipCountryMmdbPath);
  } catch (err) {
    logger.error(err);
  }
});

const geoipCityMmdbPath = 'GeoLite2-City.mmdb';
setImmediate(async () => {
  logger.info(`Opening ${geoipCityMmdbPath}`);
  try {
    app.context.geoipCity = await maxmind.open(geoipCityMmdbPath);
  } catch (err) {
    logger.error(err);
  }
});

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
const geoDb = app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);
setImmediate(() => {
  geoDb.cacheZips();
  geoDb.cacheGeonames();
});

const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
const iniPath = path.join(iniDir, 'hebcal-dot-com.ini');
app.context.iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

app.context.mysql = new MysqlDb(logger, app.context.iniConfig);

app.context.launchDate = new Date();

app.use(accessLogger(logger));
app.on('error', errorLogger(logger));

app.use(timeout(5000, {status: 503, message: 'Service Unavailable'}));

app.use(stopIfTimedOut());

app.use(xResponseTime());

app.use(async function fixup0(ctx, next) {
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.lang = 'en'; // used by some ejs templates
  ctx.state.spriteHref = '/i/' + pkg.config.sprite;
  ctx.state.cspriteHref = '/i/' + pkg.config.csprite;
  ctx.state.clientAppHref = '/i/' + pkg.config.clientapp;
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.get('accept-encoding') === 'undefined') {
    ctx.request.header['accept-encoding'] = 'identity';
  }
  // Fix up querystring so we can later use ctx.request.query
  const qs = ctx.request.querystring;
  if (qs && qs.length) {
    const semi = qs.indexOf(';');
    if (semi !== -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
  }
  const cfg = ctx.request.query.cfg;
  if (typeof cfg === 'string' && cfg !== 'html') {
    ctx.state.trackingId = 'UA-967247-6';
    ctx.state.trackPageview = true;
  }
  await next();
});

app.use(googleAnalytics('UA-967247-1'));

app.use(compress({
  gzip: true,
  deflate: false,
  br: {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
    },
  },
}));

app.use(stopIfTimedOut());

render(app, {
  root: path.join(__dirname, 'views'),
  layout: false,
  viewExt: 'ejs',
  debug: false,
  async: true,
});

app.use(async function fixup1(ctx, next) {
  // force error middleware to use proper json response type
  const accept = ctx.get('accept');
  const cfg = ctx.request.query.cfg;
  if ((cfg === 'json' || cfg === 'fc') && (!accept || accept === '*' || accept === '*/*')) {
    ctx.request.header['accept'] = 'application/json';
  }
  await next();
});

app.use(error({
  engine: 'ejs',
  template: path.join(__dirname, 'views', 'error.ejs'),
}));

app.use(stopIfTimedOut());

app.use(bodyParser());

app.use(stopIfTimedOut());

// request dispatcher
app.use(wwwRouter());

app.use(stopIfTimedOut());

app.use(serve(DOCUMENT_ROOT, {defer: false, maxage: 604800000}));

if (process.env.NODE_ENV === 'production') {
  fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
  process.on('SIGHUP', () => logger.info('Ignoring SIGHUP'));
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  const msg = 'Koa server listening on port ' + port;
  logger.info(msg);
  console.log(msg);
});
