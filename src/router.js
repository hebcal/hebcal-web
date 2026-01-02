import createError from 'http-errors';
import {basename} from 'node:path';
import {send} from '@koa/send';
import {getLocationFromQuery} from './location.js';
import {
  httpRedirect,
  throw410,
  DOCUMENT_ROOT,
} from './common.js';
import {CACHE_CONTROL_7DAYS, CACHE_CONTROL_IMMUTABLE} from './cacheControl.js';
import {langNames} from './lang.js';
import {dailyLearningConfig} from './urlArgs.js';
import {geoAutoComplete} from './complete.js';
import {hebrewDateConverter, dateConverterCsv} from './converter.js';
import {emailForm, emailVerify} from './email.js';
import {emailOpen} from './emailOpen.js';
import {fridgeShabbat} from './fridge.js';
import {hdateJavascript, hdateXml} from './hdate.js';
import {dafYomiRss} from './dafYomiRss.js';
import {parshaRss} from './parshaRss.js';
import {hebcalApp} from './hebcal.js';
import {holidayApp} from './holidayApp.js';
import {homepage} from './homepage.js';
import {parshaCsv} from './parsha-csv.js';
import {parshaIndex} from './parshaIndex.js';
import {parshaYearApp} from './parshaYear.js';
import {parshaMultiYearIndex} from './parshaMultiIndex.js';
import {parshaDetail} from './sedrot.js';
import {shabbatApp} from './shabbat.js';
import {shabbatBrowse} from './shabbat-browse.js';
import {shabbatJsLink} from './shabbat-link.js';
import {shortUrlRedir} from './shortUrlRedir.js';
import {yahrzeitApp} from './yahrzeit.js';
import {yahrzeitEmailSub, yahrzeitEmailVerify, yahrzeitEmailSearch} from './yahrzeit-email.js';
import {getZmanim} from './zmanim.js';
import {hebrewDateCalc} from './calc.js';
import {omerApp} from './omerApp.js';
import {sitemapZips} from './sitemapZips.js';
import {getLeyning} from './leyning.js';
import {sendGif, sendMatomoJs} from './sendGif.js';
import {dailyLearningApp} from './dailyLearning.js';
import {delCookie} from './delCookie.js';
import {readJSON} from './readJSON.js';
import {securityTxt} from './securityTxt.js';

const redirectMap = readJSON('./redirect.json');
const staticCalendars = readJSON('./staticCalendars.json');

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

/**
 * Bail early if there's an extra slash in what should
 * be a basename only
 * @param {string} rpath
 * @param {number} position
 */
function checkSlash(rpath, position) {
  if (rpath.includes('/', position)) {
    throw createError(404, 'Unexpected extra / in path');
  }
}

function onlyGetAndHead(ctx) {
  const method = ctx.method;
  if (method !== 'GET' && method !== 'HEAD') {
    ctx.set('Allow', 'GET');
    throw createError(405, `${method} not allowed; use GET instead`);
  }
}

export function wwwRouter() {
  return async function router(ctx, next) {
    const rpath = ctx.request.path;
    if (rpath === '/robots.txt') {
      ctx.body = 'User-agent: *\nDisallow: /shabbat/fridge.cgi\n';
      return;
    } else if (rpath === '/ping') {
      ctx.type = 'text/plain';
      return send(ctx, rpath, {root: DOCUMENT_ROOT});
    } else if (rpath === '/') {
      onlyGetAndHead(ctx);
      return homepage(ctx);
    } else if (rpath === '/i' || rpath === '/i/' || rpath === '/etc' || rpath === '/etc/') {
      return ctx.render('dir-hidden');
    } else if (redirectMap[rpath] !== undefined) {
      const destination = redirectMap[rpath];
      if (typeof destination === 'number') {
        throw createError(destination);
      } else if (destination === null) {
        throw410(ctx);
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
      onlyGetAndHead(ctx);
      return getZmanim(ctx);
    } else if (rpath.startsWith('/leyning')) {
      onlyGetAndHead(ctx);
      return getLeyning(ctx);
    } else if (rpath.startsWith('/learning')) {
      return dailyLearningApp(ctx);
    } else if (rpath.startsWith('/geo')) {
    // it's fine if this throws a Not Found exception
      ctx.response.type = ctx.request.header['accept'] = 'application/json';
      ctx.body = getLocationFromQuery(ctx.db, ctx.request.query);
      return;
    } else if (rpath.startsWith('/fridge') || rpath.startsWith('/shabbat/fridge.cgi')) {
      return fridgeShabbat(ctx);
    } else if (rpath.startsWith('/converter/csv')) {
      onlyGetAndHead(ctx);
      return dateConverterCsv(ctx);
    } else if (rpath.startsWith('/converter')) {
      return hebrewDateConverter(ctx);
    } else if (rpath.startsWith('/shabbat/browse')) {
      onlyGetAndHead(ctx);
      return shabbatBrowse(ctx);
    } else if (rpath.startsWith('/shabbat')) {
      onlyGetAndHead(ctx);
      return shabbatApp(ctx);
    } else if (rpath.startsWith('/hebcal/del_cookie')) {
      onlyGetAndHead(ctx);
      return delCookie(ctx);
    } else if (rpath.startsWith('/hebcal')) {
      onlyGetAndHead(ctx);
      return hebcalApp(ctx);
    } else if (rpath === '/yahrzeit/email') {
      return yahrzeitEmailSub(ctx);
    } else if (rpath.startsWith('/yahrzeit/verify')) {
      return yahrzeitEmailVerify(ctx);
    } else if (rpath.startsWith('/yahrzeit/search')) {
      return yahrzeitEmailSearch(ctx);
    } else if (rpath.startsWith('/yahrzeit')) {
      return yahrzeitApp(ctx);
    } else if (rpath.startsWith('/holidays/')) {
      checkSlash(rpath, 10);
      onlyGetAndHead(ctx);
      return holidayApp(ctx);
    } else if (rpath.startsWith('/h/') || rpath.startsWith('/s/') || rpath.startsWith('/o/')) {
      shortUrlRedir(ctx);
      return;
    } else if (rpath === '/email/verify.php') {
      return emailVerify(ctx);
    } else if (rpath === '/email/open') {
      return emailOpen(ctx);
    } else if (rpath.startsWith('/email')) {
      return emailForm(ctx);
    } else if (rpath.startsWith('/link')) {
      return shabbatJsLink(ctx);
    } else if (rpath === '/ical/') {
      const holidayCalendars = staticCalendars
          .filter((cfg) => cfg.ordinal)
          .sort((a, b) => a.ordinal - b.ordinal);
      return ctx.render('ical', {
        title: 'Jewish Holiday downloads for desktop, mobile and web calendars - Hebcal',
        langNames,
        dailyLearningConfig,
        holidayCalendars,
      });
    } else if (rpath.startsWith('/etc/hdate-') && rpath.endsWith('.js')) {
      onlyGetAndHead(ctx);
      return hdateJavascript(ctx);
    } else if (rpath.startsWith('/etc/hdate-') && rpath.endsWith('.xml')) {
      onlyGetAndHead(ctx);
      return hdateXml(ctx);
    } else if ((rpath.startsWith('/etc/dafyomi-') || rpath.startsWith('/etc/myomi-')) && rpath.endsWith('.xml')) {
      onlyGetAndHead(ctx);
      return dafYomiRss(ctx);
    } else if (rpath.startsWith('/sedrot/')) {
      checkSlash(rpath, 8);
      if (rpath === '/sedrot/') {
        return parshaIndex(ctx);
      } else if (rpath === '/sedrot/grid') {
        return parshaMultiYearIndex(ctx);
      } else if (rpath.endsWith('.xml')) {
        return parshaRss(ctx);
      } else if (/^\/sedrot\/.+\.csv$/.test(rpath)) {
        ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
        return parshaCsv(ctx);
      } else {
        const charCode = rpath.charCodeAt(8);
        if (charCode >= 48 && charCode <= 57) {
          return parshaYearApp(ctx);
        }
        return parshaDetail(ctx);
      }
    } else if (rpath.startsWith('/calc')) {
      return hebrewDateCalc(ctx);
    } else if (rpath.startsWith('/omer')) {
      onlyGetAndHead(ctx);
      return omerApp(rpath, ctx);
    } else if (rpath === '/sitemap_zips.txt') {
      onlyGetAndHead(ctx);
      return sitemapZips(ctx);
    } else if (rpath.startsWith('/ma/') || rpath.startsWith('/matomo/')) {
      const bn = basename(rpath);
      if (bn === 'ma.js' || bn === 'matomo.js') {
        return sendMatomoJs(ctx);
      } else if (bn === 'ma.php' || bn === 'matomo.php') {
        if (ctx.request.query.send_image == '0') {
          ctx.status = 204;
          return;
        }
        return sendGif(ctx);
      }
      // otherwise fallthrough
    } else if (rpath === '/.well-known/security.txt') {
      return securityTxt(ctx);
    }
    await next();
  };
}
