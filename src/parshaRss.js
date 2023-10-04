/* eslint-disable require-jsdoc */
import {HebrewCalendar, flags, Event} from '@hebcal/core';
import {getHolidayDescription, makeTorahMemoText, eventToRssItem2} from '@hebcal/rest-api';
import {getTodayDate} from './common';
import {basename} from 'path';
import dayjs from 'dayjs';
import {expires, getLang, RSS_CONTENT_TYPE} from './rssCommon';

export async function parshaRss(ctx) {
  const rpath = ctx.request.path;
  const {dt} = getTodayDate(ctx.request.query);
  const saturday = dayjs(dt).day(6);
  const utcString = dt.toUTCString();
  const bn = basename(rpath);
  const il = bn.startsWith('israel');
  const suffix = il ? ' (Israel)' : ' (Diaspora)';
  const lang = getLang(rpath);
  const hebrew = lang === 'he';
  const utmSource = 'sedrot-' + (il ? 'israel' : 'diaspora');
  const utmMedium = 'rss';
  const events = makeEvents(dt, il, lang);
  let str = '';
  for (const evt of events) {
    str += eventToRssItem2(evt, {il, utmSource, utmMedium, evPubDate: true});
  }
  const props = {
    writeResp: false,
    title: hebrew && il ? 'פרשת השבוע בישראל' : 'Hebcal Parashat ha-Shavua' + suffix,
    description: 'Torah reading of the week from Hebcal.com' + suffix,
    lang,
    pubDate: utcString,
    year: dt.getFullYear(),
    items: str,
  };
  ctx.lastModified = utcString;
  expires(ctx, saturday.toDate());
  ctx.type = RSS_CONTENT_TYPE;
  ctx.body = await ctx.render('parsha-rss', props);
}

function makeEvents(dt, il, lang) {
  const d = dayjs(dt);
  const start = (d.day() === 6) ? d.subtract(1, 'day') : d;
  const saturday = start.add(6 - start.day(), 'day');
  const fiveDaysAhead = start.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
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
