import {HebrewCalendar, flags, Event} from '@hebcal/core';
import {getHolidayDescription, makeTorahMemoText, eventsToRss2} from '@hebcal/rest-api';
import {getTodayDate, shabbatWeekRange} from './dateUtil.js';
import {basename} from 'node:path';
import dayjs from 'dayjs';
import {expires, getLang, RSS_CONTENT_TYPE} from './rssCommon.js';
import {checkFreshETag} from './etag.js';

export async function parshaRss(ctx) {
  const rpath = ctx.request.path;
  const {dt} = getTodayDate(ctx.request.query);
  const saturday = dayjs(dt).day(6);
  const bn = basename(rpath);
  const il = bn.startsWith('israel');
  const suffix = il ? ' (Israel)' : ' (Diaspora)';
  const lang = getLang(rpath);
  const attrs = {
    il, lang,
    yy: saturday.year(),
    mm: saturday.month(),
    dd: saturday.date(),
  };
  if (checkFreshETag(ctx, ctx.request.query, attrs)) {
    return;
  }
  const hebrew = lang === 'he';
  const utmSource = 'sedrot-' + (il ? 'israel' : 'diaspora');
  const utmMedium = 'rss';
  const events = makeEvents(dt, il, lang);
  expires(ctx, saturday.toDate());
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = eventsToRss2(events, {
    mainUrl: 'https://www.hebcal.com/sedrot/' + (il ? '?i=on' : ''),
    selfUrl: 'https://www.hebcal.com' + ctx.request.path,
    buildDate: dt,
    title: hebrew && il ? 'פרשת השבוע בישראל' : 'Hebcal Parashat ha-Shavua' + suffix,
    description: 'Torah reading of the week from Hebcal.com' + suffix,
    il,
    lang,
    utmSource,
    utmMedium,
    evPubDate: true,
  });
}

function makeEvents(dt, il, lang) {
  const [start, endOfWeek] = shabbatWeekRange(dayjs(dt));
  const events0 = HebrewCalendar.calendar({
    start: new Date(start.year(), start.month(), start.date()),
    end: new Date(endOfWeek.year(), endOfWeek.month(), endOfWeek.date()),
    il,
    sedrot: true,
  });
  const arr = [];
  for (const ev of events0) {
    const memo = makeTorahMemoText(ev, il);
    if (memo) {
      const hd = ev.getDate();
      const d = dayjs(hd.greg());
      const dateStr = d.locale(lang).format('D MMMM YYYY');
      const desc = ev.render(lang) + ' - ' + dateStr;
      arr.push(new WrappedEvent(hd, desc, ev, il, d));
    }
  }
  return arr;
}

class WrappedEvent extends Event {
  constructor(date, desc, ev, il, d) {
    super(date, desc, flags.USER_EVENT);
    this.ev = ev;
    this.memo = createMemo(ev, il);
    this.eventTime = new Date(Date.UTC(d.year(), d.month(), d.date(), 12, 0, 0));
  }
  url() {
    return this.ev.url();
  }
  getCategories() {
    return this.ev.getCategories();
  }
}

function createMemo(ev, il) {
  const memoText = makeTorahMemoText(ev, il);
  const memoHtml = memoText ? '<p>' + memoText.replaceAll('\n', '</p>\n<p>') + '</p>' : '';
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
