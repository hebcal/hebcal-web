import {HDate} from '@hebcal/core';
import {gematriyaDate} from './gematriyaDate.js';
import {getTodayDate} from './dateUtil.js';
import {checkFreshETag} from './etag.js';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';
import {send} from '@koa/send';
import {expires, getLang, RSS_CONTENT_TYPE} from './rssCommon.js';

const hdateMinDir = process.env.NODE_ENV === 'production' ?
  '/var/www/views/partials' : './views/partials';

function getLocale(rpath) {
  if (rpath.startsWith('/etc/hdate-he.js')) return 'he';
  if (rpath.startsWith('/etc/hdate-en.js')) return 'en';
  if (rpath.startsWith('/etc/hdate-he-v2.js')) return 'he-x-NoNikud';
  return 'en';
}

export async function hdateJavascript(ctx) {
  const locale = getLocale(ctx.request.path);
  const fileName = `hdate-${locale}.min.js`;
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  if (checkFreshETag(ctx, {}, {})) {
    return;
  }
  ctx.type = 'text/javascript';
  return send(ctx, fileName, {root: hdateMinDir});
}

const hmToArg = {
  'Sh\'vat': 'Shvat',
  'Adar I': 'Adar1',
  'Adar II': 'Adar2',
};

export async function hdateXml(ctx) {
  const rpath = ctx.request.path;
  const q = ctx.request.query;
  const {dt} = getTodayDate(q);
  const hd = new HDate(dt);
  expires(ctx, dt);
  if (checkFreshETag(ctx, q, {hd})) {
    return;
  }
  const utcString = dt.toUTCString();
  const hm = hd.getMonthName();
  const lang = getLang(rpath);
  const hebrew = lang === 'he';
  const props = {
    writeResp: false,
    title: hebrew ? gematriyaDate(hd) : hd.render(lang),
    lang,
    lastBuildDate: utcString,
    year: dt.getFullYear(),
    hy: hd.getFullYear(),
    hm: hmToArg[hm] || hm,
    hd: hd.getDate(),
  };
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = await ctx.render('hdate-xml', props);
}

