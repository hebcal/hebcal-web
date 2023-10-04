/* eslint-disable require-jsdoc */
import {HDate, Locale, DailyLearning} from '@hebcal/core';
import {gematriyaDate} from './gematriyaDate';
import {CACHE_CONTROL_7DAYS, getTodayDate} from './common';
import {basename} from 'path';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import fs from 'fs/promises';
import {expires, getLang, RSS_CONTENT_TYPE} from './rssCommon';

const hdateMinEnPath = '/var/www/node_modules/@hebcal/core/dist/hdate0-bundle.min.js';
const hdateMinJsPath = '/var/www/node_modules/@hebcal/core/dist/hdate-bundle.min.js';
const bodySuffix = '\n})();\n';
const bodyEn = `
function ordinal(n) {
 var s = ['th', 'st', 'nd', 'rd'];
 var v = n % 100;
 return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
var dt = new Date();
var abs = hebcal.greg2abs(dt);
if (dt.getHours() > 19) {
  abs++;
}
var hdt = hebcal.hdate.abs2hebrew(abs);
var mname = hebcal.hdate.getMonthName(hdt.mm, hdt.yy);
var dateStr = ordinal(hdt.dd) + ' of ' + mname + ', ' + hdt.yy;
document.write(dateStr);`;
const bodyHebrew = `
var dt = new Date();
var hd = new hebcal.HDate(dt);
if (dt.getHours() > 19) {
  hd = hd.next();
}
var heInStr = 'בְּ';
var monthInPrefix = {
  'Tamuz': 'בְּתַמּוּז',
  'Elul': 'בֶּאֱלוּל',
  'Tishrei': 'בְּתִשְׁרֵי',
  'Kislev': 'בְּכִסְלֵו',
  "Sh'vat": 'בִּשְׁבָט',
  'Adar': 'בַּאֲדָר',
  'Adar I': 'בַּאֲדָר א׳',
  'Adar II': 'בַּאֲדָר ב׳',
};
var dd = hd.getDate();
var monthName = hd.getMonthName();
var mm = monthInPrefix[monthName] || heInStr + hebcal.Locale.gettext(monthName, 'he');
var yy = hd.getFullYear();
var dateStr = hebcal.gematriya(dd) + ' ' + mm + ' ' + hebcal.gematriya(yy);
document.write(dateStr);`;

const bodyHebrewNoNikud = `
var dt = new Date();
var hd = new hebcal.HDate(dt);
if (dt.getHours() > 19) {
  hd = hd.next();
}
var dd = hd.getDate();
var monthName = hd.getMonthName();
var mm = hebcal.Locale.gettext(monthName, 'he-x-NoNikud');
var yy = hd.getFullYear();
var dateStr = hebcal.gematriya(dd) + ' ' + mm + ' ' + hebcal.gematriya(yy);
document.write(dateStr);`;

const config = {
  'en': [hdateMinEnPath, bodyEn],
  'he': [hdateMinJsPath, bodyHebrew],
  'he-x-NoNikud': [hdateMinJsPath, bodyHebrewNoNikud],
};

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
  const jsPath = config[locale][0];
  const minJs = await fs.readFile(jsPath);
  const isoDate = ctx.launchDate.toISOString();
  const bodyPrefix = `/* ${isoDate} */\n(function(){\n` + minJs;
  const bodyInner = config[locale][1];
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.type = 'text/javascript';
  ctx.body = bodyPrefix + bodyInner + bodySuffix;
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
