import {HDate, Locale, DailyLearning} from '@hebcal/core';
import '@hebcal/learning';
import dayjs from 'dayjs';
import './dayjs-locales.js';
import {basename} from 'node:path';
import {getTodayDate} from './dateUtil.js';
import {checkFreshETag} from './etag.js';
import {getLang, expires, RSS_CONTENT_TYPE} from './rssCommon.js';

export async function dafYomiRss(ctx) {
  const rpath = ctx.request.path;
  const q = ctx.request.query;
  const {dt} = getTodayDate(q);
  const hd = new HDate(dt);
  expires(ctx, dt);
  if (checkFreshETag(ctx, q, {hd})) {
    return;
  }
  const today = dayjs(dt);
  const lang = getLang(rpath);
  const bn = basename(rpath);
  const isDafYomi = bn.startsWith('dafyomi');
  const calendarName = isDafYomi ? 'dafYomi' : 'mishnaYomi';
  const event = DailyLearning.lookup(calendarName, hd);
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
