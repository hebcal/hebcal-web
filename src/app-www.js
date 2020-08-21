import fs from 'fs';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import error from 'koa-error';
import render from 'koa-ejs';
import serve from 'koa-static';
import timeout from 'koa-timeout-v2';
import dayjs from 'dayjs';
import ini from 'ini';
import maxmind from 'maxmind';
import path from 'path';
import pino from 'pino';
import {GeoDb} from '@hebcal/geo-sqlite';
import {emailVerify, emailForm} from './email';
import {fridgeShabbat} from './fridge';
import {geoAutoComplete} from './complete';
import {hdateJavascript, hdateXml, parshaRss} from './hdate';
import {hebcalApp} from './hebcal';
import {hebrewDateConverter} from './converter';
import {homepage} from './homepage';
import {shabbatApp} from './shabbat';
import {urlArgs, tooltipScript, typeaheadScript, getLocationFromQuery, makeLogInfo} from './common';
import {yahrzeitApp} from './yahrzeit';
import {holidayDetail, holidayYearIndex} from './holidays';

const app = new Koa();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const dest = pino.destination(logDir + '/access.log');
const logger = app.context.logger = pino(dest);

const zipsFilename = 'zips.sqlite3';
const geonamesFilename = 'geonames.sqlite3';
app.context.db = new GeoDb(logger, zipsFilename, geonamesFilename);

const iniDir = process.env.NODE_ENV === 'production' ? '/etc' : '.';
const iniPath = path.join(iniDir, 'hebcal-dot-com.ini');
app.context.iniConfig = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

// const debugLog = pino(pino.destination(logDir + '/debug.log'));

app.use(async (ctx, next) => {
  /*
  debugLog.info(Object.assign({
    ip: ctx.get('x-client-ip') || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
  }, ctx.request.header));
  */
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.startTime = Date.now();
  // don't allow compress middleware to assume that a missing
  // accept-encoding header implies 'accept-encoding: *'
  if (typeof ctx.get('accept-encoding') === 'undefined') {
    ctx.request.header['accept-encoding'] = 'identity';
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
  if (!ctx.lookup) {
    const mmdbPath = 'GeoLite2-Country.mmdb';
    logger.info(`Opening ${mmdbPath}`);
    ctx.lookup = app.context.lookup = await maxmind.open(mmdbPath);
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
app.use(async function router(ctx, next) {
  const rpath = ctx.request.path;
  if (rpath === '/favicon.ico' || rpath.startsWith('/i/')) {
    ctx.set('Cache-Control', 'max-age=5184000');
    // let serve() handle this file
  } else if (rpath === '/robots.txt') {
    ctx.body = 'User-agent: *\nAllow: /\n';
  } else if (rpath === '/') {
    await homepage(ctx);
  } else if (rpath.startsWith('/complete')) {
    await geoAutoComplete(ctx);
  } else if (rpath.startsWith('/geo')) {
    // it's fine if this throws a Not Found exception
    ctx.response.type = ctx.request.header['accept'] = 'application/json';
    ctx.body = getLocationFromQuery(ctx.db, ctx.request.query);
  } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
    await fridgeShabbat(ctx);
  } else if (rpath.startsWith('/converter')) {
    await hebrewDateConverter(ctx);
  } else if (rpath.startsWith('/shabbat')) {
    await shabbatApp(ctx);
  } else if (rpath === '/hebcal/del_cookie.cgi') {
    ctx.set('Cache-Control', 'private');
    const optout = (ctx.request.querystring === 'optout');
    const cookieVal = optout ? 'opt_out' : '0';
    // Either future or in the past (1970-01-01T00:00:01.000Z)
    const expires = optout ? dayjs().add(2, 'year').toDate() : new Date(1000);
    ctx.cookies.set('C', cookieVal, {
      expires: expires,
      overwrite: true,
      httpOnly: false,
    });
    await ctx.render('optout', {
      title: optout ? 'Opt-Out Complete' : 'Cookie Deleted',
      optout,
    });
  } else if (rpath.startsWith('/hebcal')) {
    await hebcalApp(ctx);
  } else if (rpath.startsWith('/yahrzeit')) {
    await yahrzeitApp(ctx);
  } else if (rpath === '/holidays') {
    const proto = ctx.get('x-forwarded-proto') || 'http';
    const host = ctx.get('host') || 'www.hebcal.com';
    ctx.status = 301;
    ctx.redirect(`${proto}://${host}/holidays/`);
  } else if (rpath.startsWith('/holidays/')) {
    if (rpath.endsWith('.pdf')) {
      ctx.set('Cache-Control', 'max-age=5184000');
      // let serve() handle this file
    } else {
      const charCode = rpath.charCodeAt(10);
      if (charCode >= 48 && charCode <= 57) {
        await holidayYearIndex(ctx);
      } else {
        await holidayDetail(ctx);
      }
    }
  } else if (rpath === '/email/verify.php') {
    await emailVerify(ctx);
  } else if (rpath.startsWith('/email')) {
    await emailForm(ctx);
  } else if (rpath.startsWith('/link')) {
    const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
    const location = getLocationFromQuery(ctx.db, q);
    const geoUrlArgs = urlArgs(q);
    const geoUrlArgsDbl = geoUrlArgs.replace(/&/g, '&amp;');
    await ctx.render('link', {
      q, geoUrlArgs, geoUrlArgsDbl,
      locationName: location.getName(),
      title: 'Add weekly Shabbat candle-lighting times to your synagogue website | Hebcal Jewish Calendar',
      xtra_html: tooltipScript + typeaheadScript,
    });
  } else if (rpath === '/ical/') {
    await ctx.render('ical', {
      title: 'Jewish Holiday downloads for desktop, mobile and web calendars | Hebcal Jewish Calendar',
    });
  } else if (rpath === '/etc/hdate-he.js' || rpath === '/etc/hdate-en.js') {
    hdateJavascript(ctx);
  } else if (rpath === '/etc/hdate-he.xml' || rpath === '/etc/hdate-en.xml') {
    await hdateXml(ctx);
  } else if (rpath === '/sedrot/index.xml' || rpath === '/sedrot/israel.xml' || rpath === '/sedrot/israel-he.xml') {
    await parshaRss(ctx);
  } else if (/^\/sedrot\/.+\.csv$/.test(rpath)) {
    ctx.set('Cache-Control', 'max-age=5184000');
    // let serve() handle this file
  }
  await next();
});

app.use(serve('/var/www/html', {defer: true}));

process.on('unhandledRejection', (err) => {
  logger.fatal(err);
  console.log(err);
  process.exit(1);
});

if (process.env.NODE_ENV === 'production' ) {
  fs.writeFileSync(logDir + '/koa.pid', process.pid);
  process.on('SIGHUP', () => dest.reopen());
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  logger.info('Koa server listening on port ' + port);
  console.log('Koa server listening on port ' + port);
});
