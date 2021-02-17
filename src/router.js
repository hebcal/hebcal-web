import dayjs from 'dayjs';
import createError from 'http-errors';
import path from 'path';
import {
  clipboardScript, getLocationFromQuery,
  httpRedirect, tooltipScript, typeaheadScript, urlArgs,
} from './common';
import {geoAutoComplete} from './complete';
import {hebrewDateConverter} from './converter';
import {emailForm, emailVerify} from './email';
import {fridgeShabbat} from './fridge';
import {hdateJavascript, hdateXml, parshaRss} from './hdate';
import {hebcalApp} from './hebcal';
import {holidaysApp} from './holidays';
import {homepage} from './homepage';
import {parshaCsv} from './parsha-csv';
import redirectMap from './redirect.json';
import {parshaDetail, parshaIndex} from './sedrot';
import {shabbatApp} from './shabbat';
import {shabbatBrowse} from './shabbat-browse';
import {yahrzeitApp} from './yahrzeit';
import {yahrzeitEmailSub, yahrzeitEmailVerify} from './yahrzeit-email';
import {getZmanim} from './zmanim';

const needsTrailingSlash = {
  '/shabbat/browse': true,
  '/holidays': true,
  '/ical': true,
  '/sedrot': true,
};

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';

// eslint-disable-next-line require-jsdoc
export function wwwRouter() {
  return async function router(ctx, next) {
    const rpath = ctx.request.path;
    if (rpath === '/robots.txt') {
      ctx.lastModified = ctx.launchDate;
      ctx.body = 'User-agent: *\nAllow: /\n';
    } else if (rpath === '/') {
      await homepage(ctx);
    } else if (rpath === '/i' || rpath === '/i/' || rpath === '/etc' || rpath === '/etc/') {
      ctx.lastModified = ctx.launchDate;
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
      ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
      httpRedirect(ctx, `${rpath}/`, 301);
    } else if (rpath === '/favicon.ico' || rpath.startsWith('/i/') || rpath === '/apple-touch-icon.png') {
      ctx.set('Cache-Control', CACHE_CONTROL_IMMUTABLE);
    // let serve() handle this file
    } else if (rpath.startsWith('/complete')) {
      await geoAutoComplete(ctx);
    } else if (rpath.startsWith('/zmanim')) {
      await getZmanim(ctx);
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
        xtra_html: clipboardScript,
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
  };
}
