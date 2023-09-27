/* eslint-disable require-jsdoc */
import {HDate, ParshaEvent, HebrewCalendar, flags, Locale, DailyLearning} from '@hebcal/core';
import {gematriyaDate} from './gematriyaDate';
import {pad2, getHolidayDescription, makeTorahMemoText, appendIsraelAndTracking} from '@hebcal/rest-api';
import {CACHE_CONTROL_7DAYS, getTodayDate} from './common';
import {basename} from 'path';
import createError from 'http-errors';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import fs from 'fs/promises';

function expires(ctx, dt) {
  const exp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0);
  ctx.set('Expires', exp.toUTCString());
}

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

const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

function getLang(rpath) {
  const bn = basename(rpath);
  const dash = bn.indexOf('-');
  const lang = dash === -1 ? 'en' : bn.substring(dash + 1, bn.indexOf('.'));
  const locales = Locale.getLocaleNames();
  if (locales.indexOf(lang) === -1) {
    throw createError(404, `Unknown locale: ${lang}`);
  }
  return lang;
}

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

export async function parshaRss(ctx) {
  const rpath = ctx.request.path;
  const {dt} = getTodayDate(ctx.request.query);
  const saturday = dayjs(dt).day(6);
  const hd = new HDate(dt);
  const utcString = dt.toUTCString();
  const bn = basename(rpath);
  const il = bn.startsWith('israel');
  const ev = getSaturdayEvent(hd.onOrAfter(6), il);
  const suffix = il ? ' (Israel)' : ' (Diaspora)';
  const lang = getLang(rpath);
  const hebrew = lang === 'he';
  const props = {
    writeResp: false,
    title: hebrew && il ? 'פרשת השבוע בישראל' : 'Hebcal Parashat ha-Shavua' + suffix,
    description: 'Torah reading of the week from Hebcal.com' + suffix,
    lang,
    pubDate: utcString,
    parsha: ev.render(lang),
    memo: createMemo(ev, il),
    link: appendIsraelAndTracking(ev.url(), il, 'sedrot-' + (il ? 'israel' : 'diaspora'), 'rss'),
    dt: '' + dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate()),
    year: dt.getFullYear(),
    saturdayDate: saturday.locale(lang).format('D MMMM YYYY'),
    parshaPubDate: saturday.format('ddd, DD MMM YYYY') + ' 12:00:00 GMT',
  };
  ctx.lastModified = utcString;
  expires(ctx, saturday.toDate());
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = await ctx.render('parsha-rss', props);
}

function getSaturdayEvent(hd, il) {
  const sedra = HebrewCalendar.getSedra(hd.getFullYear(), il);
  const parsha = sedra.lookup(hd);
  return parsha.chag ? HebrewCalendar.getHolidaysOnDate(hd, il)[0] : new ParshaEvent(hd, parsha.parsha, il);
}

function createMemo(ev, il) {
  const memoText = makeTorahMemoText(ev, il);
  const memoHtml = memoText ? '<p>' + memoText.replace(/\n/g, '</p>\n<p>') + '</p>' : '';
  if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
    return memoHtml;
  } else {
    let memo = '<p>' + getHolidayDescription(ev) + '</p>';
    if (memoHtml) {
      memo += '\n' + memoHtml;
    }
    return memo;
  }
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
