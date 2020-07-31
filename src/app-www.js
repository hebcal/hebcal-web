import fs from 'fs';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import error from 'koa-error';
import render from 'koa-ejs';
import serve from 'koa-static';
import timeout from 'koa-timeout-v2';
import maxmind from 'maxmind';
import path from 'path';
import pino from 'pino';
import {GeoDb} from '@hebcal/geo-sqlite';
import {fridgeShabbat} from './fridge';
import {geoAutoComplete} from './complete';
import {geoLookup} from './geolookup';
import {hebcalApp} from './hebcal';
import {hebrewDateConverter} from './converter';
import {homepage} from './homepage';
import {shabbatApp} from './shabbat';
import {urlArgs, tooltipScript, typeaheadScript, getLocationFromQuery, makeLogInfo} from './common';
import {yahrzeitApp} from './yahrzeit';

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

app.on('error', (err, ctx) => {
  if (ctx && ctx.status != 404) {
    const obj = Object.assign(err, makeLogInfo(ctx));
    if (ctx.status < 500) {
      logger.warn(obj);
    } else {
      logger.error(obj);
    }
  }
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
  } else if (rpath.startsWith('/geo')) {
    geoLookup(ctx);
  } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
    await fridgeShabbat(ctx);
  } else if (rpath.startsWith('/converter')) {
    await hebrewDateConverter(ctx);
  } else if (rpath.startsWith('/shabbat')) {
    await shabbatApp(ctx);
  } else if (rpath.startsWith('/hebcal')) {
    await hebcalApp(ctx);
  } else if (rpath.startsWith('/yahrzeit')) {
    await yahrzeitApp(ctx);
  } else if (rpath.startsWith('/link')) {
    const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
    const location = getLocationFromQuery(ctx.db, q, false);
    const geoUrlArgs = urlArgs(q);
    const geoUrlArgsDbl = geoUrlArgs.replace(/&/g, '&amp;');
    await ctx.render('link', {
      q, geoUrlArgs, geoUrlArgsDbl,
      locationName: location.getName(),
      title: 'Add weekly Shabbat candle-lighting times to your synagogue website | Hebcal Jewish Calendar',
      xtra_html: tooltipScript + typeaheadScript,
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
