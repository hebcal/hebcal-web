/* eslint-disable require-jsdoc */
import {HDate, Locale, DailyLearning} from '@hebcal/core';
import {gematriyaDate} from './gematriyaDate.js';
import {CACHE_CONTROL_7DAYS, getTodayDate} from './common.js';
import {basename} from 'path';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import send from 'koa-send';
import {expires, getLang, RSS_CONTENT_TYPE} from './rssCommon.js';

const hdateMinDir = '/var/www/dist/views/partials';

export async function hdateJavascript(ctx) {
  ctx.lastModified = ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const rpath = ctx.request.path;
  const locale = rpath.startsWith('/etc/hdate-he.js') ? 'he' :
    rpath.startsWith('/etc/hdate-en.js') ? 'en' :
    rpath.startsWith('/etc/hdate-he-v2.js') ? 'he-x-NoNikud' :
    'en';
  const fileName = `hdate-${locale}.min.js`;
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
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
  const dt = new Date();
  const hd = new HDate(dt);
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
  ctx.lastModified = utcString;
  expires(ctx, dt);
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = await ctx.render('hdate-xml', props);
}

export async function dafYomiRss(ctx) {
  const rpath = ctx.request.path;
  const {dt} = getTodayDate(ctx.request.query);
  const hd = new HDate(dt);
  const today = dayjs(dt);
  const utcString = dt.toUTCString();
  const lang = getLang(rpath);
  const bn = basename(rpath);
  const isDafYomi = bn.startsWith('dafyomi');
  const calendarName = isDafYomi ? 'dafYomi' : 'mishnaYomi';
  const event = DailyLearning.lookup(calendarName, hd);
  ctx.lastModified = utcString;
  expires(ctx, dt);
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = await ctx.render('dafyomi-rss', {
    writeResp: false,
    title: Locale.gettext(isDafYomi ? 'Daf Yomi' : 'Mishna Yomi', lang),
    homepage: isDafYomi ? 'https://www.sefaria.org/daf-yomi' : 'https://www.sefaria.org/texts/Mishnah',
    description: 'Daily regimen of learning the ' + (isDafYomi ? 'Talmud' : 'Mishna'),
    dt,
    memo: today.locale(lang).format('dddd, D MMMM YYYY'),
    lang,
    event,
  });
}
