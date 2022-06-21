import dayjs from 'dayjs';
import createError from 'http-errors';
import {
  getLocationFromQuery,
  httpRedirect,
  langNames,
  CACHE_CONTROL_IMMUTABLE,
} from './common';
import {geoAutoComplete} from './complete';
import {hebrewDateConverter} from './converter';
import {emailForm, emailVerify} from './email';
import {emailOpen} from './emailOpen';
import {fridgeShabbat} from './fridge';
import {hdateJavascript, hdateXml, parshaRss} from './hdate';
import {hebcalApp} from './hebcal';
import {holidaysApp} from './holidays';
import {homepage} from './homepage';
import {parshaCsv} from './parsha-csv';
import redirectMap from './redirect.json';
import {parshaIndex} from './parshaIndex';
import {parshaYear} from './parshaYear';
import {parshaDetail} from './sedrot';
import {shabbatApp} from './shabbat';
import {shabbatBrowse} from './shabbat-browse';
import {shabbatJsLink} from './shabbat-link';
import {shortUrlRedir} from './shortUrlRedir';
import {yahrzeitApp} from './yahrzeit';
import {yahrzeitEmailSub, yahrzeitEmailVerify} from './yahrzeit-email';
import {getZmanim} from './zmanim';
import {hebrewDateCalc} from './calc';
import {omerApp} from './omerApp';
import {sitemapZips} from './sitemapZips';

const needsTrailingSlash = {
  '/shabbat/browse': true,
  '/holidays': true,
  '/ical': true,
  '/sedrot': true,
  '/ma': true,
};

// favicon-like files in the directory root that should be cached for 365 days
const rootDirStatic = new Set(`ads.txt
favicon.ico
android-chrome-192x192.png
android-chrome-512x512.png
apple-touch-icon.png
browserconfig.xml
favicon-16x16.png
favicon-32x32.png
mstile-150x150.png
safari-pinned-tab.svg
site.webmanifest`.split('\n').map((s) => '/' + s));

// eslint-disable-next-line require-jsdoc
export function wwwRouter() {
  return async function router(ctx, next) {
    const rpath = ctx.request.path;
    if (rpath === '/robots.txt') {
      ctx.lastModified = ctx.launchDate;
      ctx.body = 'User-agent: *\nDisallow: /shabbat/fridge.cgi\n';
      return;
    } else if (rpath === '/ping') {
      ctx.type = 'text/plain';
      // let serve() handle this file
    } else if (rpath === '/') {
      return homepage(ctx);
    } else if (rpath === '/i' || rpath === '/i/' || rpath === '/etc' || rpath === '/etc/') {
      ctx.lastModified = ctx.launchDate;
      return ctx.render('dir-hidden');
    } else if (typeof redirectMap[rpath] !== 'undefined') {
      const destination = redirectMap[rpath];
      if (typeof destination === 'number') {
        throw createError(destination);
      } else if (destination === null) {
        throw createError(410,
            'The requested resource is no longer available on this server and there is no forwarding address. ' +
        'Please remove all references to this resource.');
      }
      ctx.status = 301;
      ctx.redirect(destination);
      return;
    } else if (needsTrailingSlash[rpath]) {
      httpRedirect(ctx, `${rpath}/`, 301);
      return;
    } else if (rootDirStatic.has(rpath) || rpath.startsWith('/i/')) {
      ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
      // let serve() handle this file
    } else if (rpath.startsWith('/complete')) {
      return geoAutoComplete(ctx);
    } else if (rpath.startsWith('/zmanim')) {
      return getZmanim(ctx);
    } else if (rpath.startsWith('/geo')) {
    // it's fine if this throws a Not Found exception
      ctx.response.type = ctx.request.header['accept'] = 'application/json';
      ctx.body = getLocationFromQuery(ctx.db, ctx.request.query);
      return;
    } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
      return fridgeShabbat(ctx);
    } else if (rpath.startsWith('/converter')) {
      return hebrewDateConverter(ctx);
    } else if (rpath.startsWith('/shabbat/browse')) {
      return shabbatBrowse(ctx);
    } else if (rpath.startsWith('/shabbat')) {
      return shabbatApp(ctx);
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
      return ctx.render('optout', {
        title: optout ? 'Opt-Out Complete' : 'Cookie Deleted',
        optout,
      });
    } else if (rpath.startsWith('/hebcal')) {
      return hebcalApp(ctx);
    } else if (rpath === '/yahrzeit/email') {
      return yahrzeitEmailSub(ctx);
    } else if (rpath.startsWith('/yahrzeit/verify')) {
      return yahrzeitEmailVerify(ctx);
    } else if (rpath.startsWith('/yahrzeit')) {
      return yahrzeitApp(ctx);
    } else if (rpath.startsWith('/holidays/')) {
      return holidaysApp(ctx);
    } else if (rpath.startsWith('/h/') || rpath.startsWith('/s/') || rpath.startsWith('/o/')) {
      shortUrlRedir(ctx);
    } else if (rpath === '/email/verify.php') {
      return emailVerify(ctx);
    } else if (rpath === '/email/open') {
      return emailOpen(ctx);
    } else if (rpath.startsWith('/email')) {
      return emailForm(ctx);
    } else if (rpath.startsWith('/link')) {
      return shabbatJsLink(ctx);
    } else if (rpath === '/ical/') {
      return ctx.render('ical', {
        title: 'Jewish Holiday downloads for desktop, mobile and web calendars - Hebcal',
        langNames,
      });
    } else if (rpath === '/etc/hdate-he.js' || rpath === '/etc/hdate-en.js') {
      return hdateJavascript(ctx);
    } else if (rpath.startsWith('/etc/hdate-') && rpath.endsWith('.xml')) {
      return hdateXml(ctx);
    } else if (rpath.startsWith('/sedrot/')) {
      if (rpath === '/sedrot/') {
        return parshaIndex(ctx);
      } else if (rpath.endsWith('.xml')) {
        return parshaRss(ctx);
      } else if (/^\/sedrot\/.+\.csv$/.test(rpath)) {
        ctx.set('Cache-Control', 'max-age=5184000');
        return parshaCsv(ctx);
      } else {
        const charCode = rpath.charCodeAt(8);
        if (charCode >= 48 && charCode <= 57) {
          return parshaYear(ctx);
        }
        return parshaDetail(ctx);
      }
    } else if (rpath.startsWith('/calc')) {
      return hebrewDateCalc(ctx);
    } else if (rpath.startsWith('/omer')) {
      return omerApp(rpath, ctx);
    } else if (rpath === '/sitemap_zips.txt') {
      return sitemapZips(ctx);
    } else if (rpath === '/matomo/matomo.js' ||
               rpath === '/ma/ma.js' ||
               (rpath.startsWith('/a/js/') && rpath.endsWith('.js'))) {
      ctx.type = 'application/javascript';
      ctx.body = '/* Nothing to see here */\n';
      return;
    } else if (rpath === '/a/api/event') {
      ctx.status = 202;
      ctx.type = 'text/plain';
      ctx.body = 'bogus';
      return;
    }
    await next();
  };
}
