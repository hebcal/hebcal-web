import createError from 'http-errors';
import {
  getLocationFromQuery,
  httpRedirect,
  langNames,
  CACHE_CONTROL_IMMUTABLE,
} from './common.js';
import {geoAutoComplete} from './complete.js';
import {hebrewDateConverter, dateConverterCsv} from './converter.js';
import {emailForm, emailVerify} from './email.js';
import {emailOpen} from './emailOpen.js';
import {fridgeShabbat} from './fridge.js';
import {hdateJavascript, hdateXml, dafYomiRss} from './hdate.js';
import {parshaRss} from './parshaRss.js';
import {hebcalApp} from './hebcal.js';
import {holidaysApp} from './holidayIndex.js';
import {homepage} from './homepage.js';
import {parshaCsv} from './parsha-csv.js';
import {parshaIndex} from './parshaIndex.js';
import {parshaYear} from './parshaYear.js';
import {parshaMultiYearIndex} from './parshaMultiIndex.js';
import {parshaDetail} from './sedrot.js';
import {shabbatApp} from './shabbat.js';
import {shabbatBrowse} from './shabbat-browse.js';
import {shabbatJsLink} from './shabbat-link.js';
import {shortUrlRedir} from './shortUrlRedir.js';
import {yahrzeitApp} from './yahrzeit.js';
import {yahrzeitEmailSub, yahrzeitEmailVerify} from './yahrzeit-email.js';
import {getZmanim} from './zmanim.js';
import {hebrewDateCalc} from './calc.js';
import {omerApp} from './omerApp.js';
import {sitemapZips} from './sitemapZips.js';
import {getLeyning} from './leyning.js';
import {sendGif} from './sendGif.js';
import {dailyLearningApp} from './dailyLearning.js';
import {delCookie} from './delCookie.js';
import {readJSON} from './readJSON.js';

const redirectMap = readJSON('./redirect.json');

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
    } else if (rpath.startsWith('/leyning')) {
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
      return dateConverterCsv(ctx);
    } else if (rpath.startsWith('/converter')) {
      return hebrewDateConverter(ctx);
    } else if (rpath.startsWith('/shabbat/browse')) {
      return shabbatBrowse(ctx);
    } else if (rpath.startsWith('/shabbat')) {
      return shabbatApp(ctx);
    } else if (rpath.startsWith('/hebcal/del_cookie')) {
      return delCookie(ctx);
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
      return ctx.render('ical', {
        title: 'Jewish Holiday downloads for desktop, mobile and web calendars - Hebcal',
        langNames,
      });
    } else if (rpath.startsWith('/etc/hdate-') && rpath.endsWith('.js')) {
      return hdateJavascript(ctx);
    } else if (rpath.startsWith('/etc/hdate-') && rpath.endsWith('.xml')) {
      return hdateXml(ctx);
    } else if ((rpath.startsWith('/etc/dafyomi-') || rpath.startsWith('/etc/myomi-')) && rpath.endsWith('.xml')) {
      return dafYomiRss(ctx);
    } else if (rpath.startsWith('/sedrot/')) {
      if (rpath === '/sedrot/') {
        return parshaIndex(ctx);
      } else if (rpath === '/sedrot/grid') {
        return parshaMultiYearIndex(ctx);
      } else if (rpath.endsWith('.xml')) {
        return parshaRss(ctx);
      } else if (/^\/sedrot\/.+\.csv$/.test(rpath)) {
        ctx.set('Cache-Control', 'public, max-age=604800');
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
    } else if (rpath === '/matomo/matomo.js') {
      ctx.set('Cache-Control', 'private, max-age=0');
      ctx.type = 'application/javascript';
      ctx.body = '/* Nothing to see here */\n';
      return;
    } else if (rpath === '/ma/ma.php' || rpath === '/matomo/matomo.php') {
      if (ctx.request.query.send_image == '0') {
        ctx.status = 204;
        return;
      }
      return sendGif(ctx);
    } else if (rpath === '/.well-known/security.txt') {
      ctx.lastModified = ctx.launchDate;
      ctx.type = 'text/plain';
      const expires0 = new Date(ctx.launchDate.getTime() + (365 * 24 * 60 * 60 * 1000));
      const expires = expires0.toISOString();
      ctx.body = 'Contact: mailto:security@hebcal.com\n' +
        `Expires: ${expires}\n` +
        'OpenBugBounty: https://openbugbounty.org/bugbounty/HebcalDotCom/\n';
      return;
    }
    await next();
  };
}
