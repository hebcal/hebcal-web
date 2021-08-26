/* eslint-disable require-jsdoc */
import {HDate, Sedra, ParshaEvent, HebrewCalendar, flags} from '@hebcal/core';
import {gematriyaDate} from './converter';
import {pad2, getHolidayDescription, makeTorahMemoText} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

function expires(ctx, dt) {
  const exp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0);
  ctx.set('Expires', exp.toUTCString());
}

export function hdateJavascript(ctx) {
  const rpath = ctx.request.path;
  const dt = new Date();
  const hd = new HDate(dt);
  ctx.lastModified = dt;
  expires(ctx, dt);
  ctx.type = 'application/javascript';
  const dateStr = rpath === '/etc/hdate-en.js' ? hd.render('en') : gematriyaDate(hd);
  ctx.body = 'document.write("' + dateStr + '");\n';
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
  const props = {
    writeResp: false,
    title: hebrew ? gematriyaDate(hd) : hd.render(),
    lang: hebrew ? 'he' : 'en',
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
  const hy = hd.getFullYear();
  const utcString = dt.toUTCString();
  const hebrew = rpath === '/sedrot/israel-he.xml';
  const il = rpath.startsWith('/sedrot/israel');
  const sedra = new Sedra(hy, il);
  const isParsha = sedra.isParsha(hd);
  let ev;
  if (isParsha) {
    ev = new ParshaEvent(hd, sedra.get(hd), il);
  } else {
    const events = HebrewCalendar.getHolidaysOnDate(saturday.toDate(), il) || [];
    ev = events[0];
  }

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
