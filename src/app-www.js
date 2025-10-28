import {randomBytes} from 'node:crypto';
import fs from 'fs';
import Koa from 'koa';
import {bodyParser} from '@koa/bodyparser';
import compress from 'koa-compress';
import error from 'koa-error';
import render from '@koa/ejs';
import serve from 'koa-static';
import timeout from 'koa-timeout-v2';
import xResponseTime from 'koa-better-response-time';
import ini from 'ini';
import maxmind from 'maxmind';
import path from 'path';
import {fileURLToPath} from 'url';
import os from 'os';
import zlib from 'zlib';
import {makeLogger, errorLogger, accessLogger, makeLogInfo,
  logMemoryUsage} from './logger.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {wwwRouter} from './router.js';
import {MysqlDb} from './db.js';
import {stopIfTimedOut, pkg} from './common.js';
import {empty} from './empty.js';
import './locale.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENT_ROOT = '/var/www/html';

const app = new Koa();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const logger = makeLogger(logDir);
logger.info('Koa server: starting up');
logMemoryUsage(logger);
setInterval(() => {
  logMemoryUsage(logger);
}, 30000);

app.context.logger = logger;

const geoipCountryMmdbPath = 'GeoLite2-Country.mmdb';
setImmediate(async () => {
  logger.info(`Opening ${geoipCountryMmdbPath}`);
  try {
    app.context.geoipCountry = await maxmind.open(geoipCountryMmdbPath);
  } catch (err) {
    logger.error(err, `while opening ${geoipCountryMmdbPath}`);
  }
});

const geoipCityMmdbPath = 'GeoLite2-City.mmdb';
setImmediate(async () => {
  logger.info(`Opening ${geoipCityMmdbPath}`);
  try {
    app.context.geoipCity = await maxmind.open(geoipCityMmdbPath);
  } catch (err) {
    logger.error(err, `while opening ${geoipCityMmdbPath}`);
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

app.use(xResponseTime());
app.use(accessLogger(logger));
app.on('error', errorLogger(logger));

app.use(timeout(6000, {
  status: 503,
  message: 'Service Unavailable',
  callback: function(ctx) {
    const logInfo = makeLogInfo(ctx);
    logInfo.status = 503;
    ctx.logger.warn(logInfo);
  },
}));

app.use(stopIfTimedOut());

const HOSTNAME = os.hostname();
const spriteHref = '/i/' + pkg.config.sprite;
const cspriteHref = '/i/' + pkg.config.csprite;
const clientAppHref = '/i/' + pkg.config.clientapp;

app.use(async function fixup0(ctx, next) {
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.lang = 'en'; // used by some ejs templates
  ctx.state.spriteHref = spriteHref;
  ctx.state.cspriteHref = cspriteHref;
  ctx.state.clientAppHref = clientAppHref;
  ctx.state.hostname = HOSTNAME; // used by some ejs templates
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.get('accept-encoding') === 'undefined') {
    ctx.request.header['accept-encoding'] = 'identity';
  }
  // Fix up querystring so we can later use ctx.request.query
  const qs = ctx.request.querystring;
  if (qs?.length) {
    const semi = qs.indexOf(';');
    if (semi !== -1) {
      ctx.request.querystring = qs.replace(/;/g, '&');
    }
    // We've seen weird qs that have ?back=foo appended
    const qs2 = ctx.request.querystring;
    const back = qs2.indexOf('?back=');
    if (back !== -1) {
      ctx.request.querystring = qs2.substring(0, back);
    }
  }
  // Collapse duplicate identical key/values in querystring
  const query = {...ctx.request.query};
  let needsRewrite = false;
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value) && value.length >= 2 && value[0] === value[1]) {
      query[key] = value[0];
      needsRewrite = true;
    }
  }
  if (needsRewrite) {
    ctx.request.query = query;
  }
  await next();
});

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
  const cfg = ctx.request.query.cfg;
  if (cfg === 'json' || cfg === 'fc') {
    ctx.request.header['accept'] = 'application/json';
  }
  await next();
});

const CSP_HEADER_NAME = 'Content-Security-Policy';

app.use(async function errorCsp(ctx, next) {
  await next();
  if (ctx.status !== 200 && ctx.type === 'text/html' && !ctx.response.has(CSP_HEADER_NAME)) {
    ctx.set(CSP_HEADER_NAME, 'default-src \'self\'; style-src \'unsafe-inline\'');
  }
});

app.use(error({
  engine: 'ejs',
  template: path.join(__dirname, 'views', 'error.ejs'),
}));

app.use(async function checkHttpMethod(ctx, next) {
  const method = ctx.method;
  switch (method) {
    case 'GET':
    case 'POST':
    case 'HEAD':
      break; // all good!
    default:
      ctx.throw(405, `Method ${method} not allowed`);
  }
  await next();
});

app.use(stopIfTimedOut());

app.use(bodyParser({
  formLimit: '256kb',
  qs: {
    parse: function(str, opts) {
      const sp = new URLSearchParams(str);
      const obj = {};
      for (const [key, value] of sp.entries()) {
        obj[key] = value;
      }
      return obj;
    },
  },
  extendTypes: {
    json: ['text/plain'], // will parse text/plain type body as a JSON string
  },
}));

app.use(stopIfTimedOut());

app.use(async function setCorsHeader(ctx, next) {
  const rpath = ctx.request.path;
  if (!empty(ctx.request.query.cfg) ||
      (typeof ctx.request.body === 'object' && !empty(ctx.request.body.cfg)) ||
      (rpath.startsWith('/etc/') &&
       (rpath.endsWith('.js') || rpath.endsWith('.xml')))) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  await next();
});

app.use(async function strictContentSecurityPolicy(ctx, next) {
  const buf = randomBytes(9);
  const nonce = ctx.state.nonce = buf.toString('base64url');
  await next();
  const status = ctx.status;
  if ((status === 200 || status === 404 || status === 400) && ctx.type === 'text/html') {
    const csp = `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline';` +
      ` style-src 'self' https: data: 'unsafe-inline';` +
      ` frame-ancestors https: data:;` +
      ` frame-src https: data:;` +
      ` img-src 'self' https: data:;` +
      ` font-src 'self' data: https://fonts.gstatic.com/;` +
      ` object-src 'none';` +
      ` base-uri 'none'`;
    ctx.set(CSP_HEADER_NAME, csp);
    ctx.set('X-XSS-Protection', '0');
  }
});

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
