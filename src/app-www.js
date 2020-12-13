import fs from 'fs';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import compress from 'koa-compress';
import createError from 'http-errors';
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
import {parshaDetail, parshaIndex} from './sedrot';
import {parshaCsv} from './parsha-csv';
import {shabbatApp} from './shabbat';
import {shabbatBrowse} from './shabbat-browse';
import {urlArgs, tooltipScript, typeaheadScript, getLocationFromQuery, makeLogInfo,
  httpRedirect} from './common';
import {yahrzeitApp} from './yahrzeit';
import {holidaysApp} from './holidays';
import redirectMap from './redirect.json';
import {yahrzeitEmailSub, yahrzeitEmailVerify} from './yahrzeit-email';

const DOCUMENT_ROOT = '/var/www/html';

const needsTrailingSlash = {
  '/shabbat/browse': true,
  '/holidays': true,
  '/ical': true,
  '/sedrot': true,
};

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

app.context.launchUTCString = new Date().toUTCString();

app.use(async (ctx, next) => {
  ctx.state.rpath = ctx.request.path; // used by some ejs templates
  ctx.state.spriteHref = '/i/sprite5.svg';
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
  if (rpath === '/robots.txt') {
    ctx.set('Last-Modified', ctx.launchUTCString);
    ctx.body = 'User-agent: *\nAllow: /\n';
  } else if (rpath === '/') {
    await homepage(ctx);
  } else if (rpath === '/i' || rpath === '/i/' || rpath === '/etc' || rpath === '/etc/') {
    ctx.set('Last-Modified', ctx.launchUTCString);
    await ctx.render('dir-hidden');
  } else if (typeof redirectMap[rpath] !== 'undefined') {
    const destination = redirectMap[rpath];
    if (destination === null) {
      throw createError(410,
          'The requested resource is no longer available on this server and there is no forwarding address. ' +
          'Please remove all references to this resource.');
    }
    ctx.status = 301;
    ctx.redirect(destination);
  } else if (needsTrailingSlash[rpath]) {
    ctx.status = 301;
    httpRedirect(ctx, `${rpath}/`);
  } else if (rpath === '/favicon.ico' || rpath.startsWith('/i/') || rpath === '/apple-touch-icon.png') {
    ctx.set('Cache-Control', 'max-age=5184000');
    // let serve() handle this file
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
  } else if (rpath.startsWith('/shabbat/browse')) {
    await shabbatBrowse(ctx);
  } else if (rpath.startsWith('/shabbat')) {
    await shabbatApp(ctx);
  } else if (rpath.startsWith('/hebcal/del_cookie')) {
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
  } else if (rpath === '/yahrzeit/email') {
    await yahrzeitEmailSub(ctx);
  } else if (rpath.startsWith('/yahrzeit/verify')) {
    await yahrzeitEmailVerify(ctx);
  } else if (rpath.startsWith('/yahrzeit')) {
    await yahrzeitApp(ctx);
  } else if (rpath.startsWith('/holidays/')) {
    await holidaysApp(ctx);
  } else if (rpath.startsWith('/h/') || rpath.startsWith('/s/')) {
    const base = path.basename(rpath);
    const dest = rpath.startsWith('/h/') ? 'holidays' : 'sedrot';
    httpRedirect(ctx, `/${dest}/${base}?utm_source=redir&utm_medium=redir`);
  } else if (rpath === '/email/verify.php') {
    await emailVerify(ctx);
  } else if (rpath.startsWith('/email')) {
    await emailForm(ctx);
  } else if (rpath.startsWith('/link')) {
    const q = ctx.request.querystring ? ctx.request.query : {geonameid: '281184', M: 'on'};
    const location0 = getLocationFromQuery(ctx.db, q);
    const location = location0 || ctx.db.lookupLegacyCity('New York');
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
  } else if (rpath.startsWith('/sedrot/')) {
    if (rpath === '/sedrot/') {
      await parshaIndex(ctx);
    } else if (/^\/sedrot\/.+\.csv$/.test(rpath)) {
      ctx.set('Cache-Control', 'max-age=5184000');
      await parshaCsv(ctx);
    } else {
      await parshaDetail(ctx);
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

if (process.env.NODE_ENV === 'production' ) {
  fs.writeFileSync(logDir + '/koa.pid', String(process.pid));
  process.on('SIGHUP', () => dest.reopen());
}

const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  logger.info('Koa server listening on port ' + port);
  console.log('Koa server listening on port ' + port);
});
