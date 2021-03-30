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

const DOCUMENT_ROOT = '/var/www/html';

const app = new Koa();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const {logger, dest} = makeLogger(logDir);
app.context.logger = logger;

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
app.use(xResponseTime());
app.use(googleAnalytics('UA-967247-1'));

app.use(async (ctx, next) => {
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.lang = 'en'; // used by some ejs templates
  ctx.state.spriteHref = '/i/sprite5.svg';
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.get('accept-encoding') === 'undefined') {
    ctx.request.header['accept-encoding'] = 'identity';
  }
  await next();
});

app.on('error', errorLogger(logger));

app.use(compress({
  gzip: true,
  deflate: false,
  br: {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
    },
  },
}));

render(app, {
  root: path.join(__dirname, 'views'),
  layout: false,
  viewExt: 'ejs',
  debug: false,
  async: true,
});

// Fix up querystring so we can later use ctx.request.query
app.use(async function fixup(ctx, next) {
  const qs = ctx.request.querystring;
  if (qs && qs.length) {
    const semi = qs.indexOf(';');
    if (semi != -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
  }
  // force error middleware to use proper json response type
  const accept = ctx.get('accept');
  const cfg = ctx.request.query.cfg;
  if ((cfg === 'json' || cfg === 'fc') && (!accept || accept === '*' || accept === '*/*')) {
    ctx.request.header['accept'] = 'application/json';
  }
  if (!ctx.geoipCountry) {
    const geoipCountryMmdbPath = 'GeoLite2-Country.mmdb';
    logger.info(`Opening ${geoipCountryMmdbPath}`);
    ctx.geoipCountry = app.context.geoipCountry = await maxmind.open(geoipCountryMmdbPath);
    const geoipCityMmdbPath = 'GeoLite2-City.mmdb';
    logger.info(`Opening ${geoipCityMmdbPath}`);
    ctx.geoipCity = app.context.geoipCity = await maxmind.open(geoipCityMmdbPath);
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
app.use(wwwRouter());

app.use(serve(DOCUMENT_ROOT, {defer: true}));

if (process.env.NODE_ENV === 'production' ) {
  fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
  process.on('SIGHUP', () => dest.reopen());
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  const msg = 'Koa server listening on port ' + port;
  logger.info(msg);
  console.log(msg);
});
