/* eslint-disable require-jsdoc */
import {HDate, ParshaEvent, HebrewCalendar, flags} from '@hebcal/core';
import {gematriyaDate} from './gematriyaDate';
import {pad2, getHolidayDescription, makeTorahMemoText} from '@hebcal/rest-api';
import {CACHE_CONTROL_7DAYS} from './common';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import fs from 'fs/promises';

function expires(ctx, dt) {
  const exp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0);
  ctx.set('Expires', exp.toUTCString());
}

const hdateMinJsPath = '/var/www/node_modules/@hebcal/core/dist/hdate-bundle.min.js';
const bodySuffix = '\n})();\n';
const bodyEn = 'document.write(hd.render(\'en\'));';
const bodyHebrew = `var heInStr = 'בְּ';
var monthInPrefix = {
  'Tamuz': 'בְּתַמּוּז',
  'Elul': 'בֶּאֱלוּל',
  'Tishrei': 'בְּתִשְׁרֵי',
  'Kislev': 'בְּכִסְלֵו',
  "Sh'vat": 'בִּשְׁבָט',
  'Adar': 'בַּאֲדָר',
  'Adar I': 'בַּאֲדָר א׳',
  'Adar II': 'בַּאֲדָר ב׳',
};
var dd = hd.getDate();
var monthName = hd.getMonthName();
var mm = monthInPrefix[monthName] || heInStr + hebcal.Locale.gettext(monthName, 'he');
var yy = hd.getFullYear();
var dateStr = hebcal.gematriya(dd) + ' ' + mm + ' ' + hebcal.gematriya(yy);
document.write(dateStr);`;

export async function hdateJavascript(ctx) {
  ctx.lastModified = ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const hdateMinJs = await fs.readFile(hdateMinJsPath);
  const isoDate = ctx.launchDate.toISOString();
  const bodyPrefix = '(function(){\n' + hdateMinJs + `
/* ${isoDate} */

var dt = new Date();
var hd = new hebcal.HDate(dt);
if (dt.getHours() > 19) {
  hd = hd.next();
}
`;
  const hebrew = ctx.request.path.startsWith('/etc/hdate-he.js');
  const bodyInner = hebrew ? bodyHebrew : bodyEn;
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

export async function hdateXml(ctx) {
  const rpath = ctx.request.path;
  const dt = new Date();
  const hd = new HDate(dt);
  const utcString = dt.toUTCString();
  const hebrew = rpath === '/etc/hdate-he.xml';
  const hm = hd.getMonthName();
  const lang = hebrew ? 'he' : 'en';
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
  const dt = new Date();
  const saturday = dayjs(dt).day(6);
  const hd = new HDate(dt);
  const utcString = dt.toUTCString();
  const hebrew = rpath === '/sedrot/israel-he.xml';
  const il = rpath.startsWith('/sedrot/israel');
  const ev = getSaturdayEvent(hd.onOrAfter(6), il);
  const suffix = il ? ' (Israel)' : ' (Diaspora)';
  const lang = hebrew ? 'he' : 'en';
  const props = {
    writeResp: false,
    title: hebrew ? 'פרשת השבוע בישראל' : 'Hebcal Parashat ha-Shavua' + suffix,
    description: 'Torah reading of the week from Hebcal.com' + suffix,
    lang,
    pubDate: utcString,
    parsha: ev.render(lang),
    memo: createMemo(ev, il),
    link: ev.url() + '?utm_medium=rss&utm_source=rss-parasha',
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
