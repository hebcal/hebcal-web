import {flags} from '@hebcal/core';
import {appendIsraelAndTracking, getHolidayDescription} from '@hebcal/rest-api';
import QuickLRU from 'quick-lru';
import {cloneEventWithMemo} from './cloneEvent.js';
import {HOLIDAY_IGNORE_MASK, makeTorahMemoText} from './torahMemo.js';

/**
 * Appends utm_source, utm_medium and utm_campaign to an event URL,
 * defaulting `utm_medium` to `icalendar`.
 * @private
 * @param {string} [url]
 * @param {any} options
 * @return {string|null}
 */
function appendTrackingToUrl(url, options) {
  if (!url) {
    return null;
  }
  let utmSource = options.utmSource;
  if (!utmSource) {
    const u = new URL(url);
    if (u.host === 'www.hebcal.com') {
      utmSource = 'ical';
    }
  }
  const utmMedium = options.utmMedium || 'icalendar';
  const utmCampaign = options.utmCampaign;
  return appendIsraelAndTracking(url, options.il, utmSource, utmMedium, utmCampaign);
}

const torahMemoCache = new QuickLRU({maxSize: 5000});

/**
 * @private
 * @param {Event} ev
 * @param {boolean} il
 * @return {string}
 */
function makeTorahMemo(ev, il) {
  if (ev.getFlags() & HOLIDAY_IGNORE_MASK || ev.eventTime) {
    return '';
  }
  const hd = ev.getDate();
  const key = [
    hd.getFullYear(), hd.getMonth(), hd.getDate(),
    il ? '1' : '0', ev.getDesc(),
  ].join('-');
  const cached = torahMemoCache.get(key);
  if (typeof cached === 'string') {
    return cached;
  }
  const memo = makeTorahMemoText(ev, il);
  torahMemoCache.set(key, memo);
  return memo;
}

/**
 * Builds the iCalendar `DESCRIPTION` text for an event: holiday description,
 * Omer count, Torah reading, and a link back to hebcal.com.
 *
 * Newlines are ordinary `\n` characters; `@hebcal/icalendar` takes care of
 * escaping them for RFC 5545.
 * @param {Event} ev
 * @param {any} options
 * @return {string}
 */
export function createMemo(ev, options) {
  let memo = ev.memo || '';
  const desc = ev.getDesc();
  if (desc === 'Havdalah' || desc === 'Candle lighting') {
    return memo;
  }
  const mask = ev.getFlags();
  if (mask & flags.OMER_COUNT) {
    const sefira = [
      ev.sefira('en'),
      ev.sefira('he'),
      ev.sefira('translit'),
    ].join('\n');
    return ev.getTodayIs('en') + '\n\n' + ev.getTodayIs('he') + '\n\n' + sefira;
  }
  if (!memo) {
    memo = getHolidayDescription(ev);
  }
  if (!memo) {
    const linkEv = ev.linkedEvent;
    if (linkEv && linkEv.getDesc() !== ev.getDesc()) {
      memo = linkEv.render(options.locale);
    }
  }
  const torahMemo = makeTorahMemo(ev, options.il);
  if (torahMemo) {
    if (memo.length) {
      memo += '\n\n';
    }
    memo += torahMemo;
  }
  const url = appendTrackingToUrl(ev.url(), options);
  if (url) {
    if (memo.length) {
      memo += '\n\n';
    }
    memo += url;
  }
  return memo;
}

/**
 * Returns a copy of `events` where every event carries the `memo` that should
 * become the iCalendar `DESCRIPTION`
 * @param {Event[]} events
 * @param {any} options iCalendar options (`il`, `locale`, `utmSource`, ...)
 * @return {Event[]}
 */
export function applyIcalMemos(events, options) {
  return events.map((ev) => {
    const memo = createMemo(ev, options);
    return memo === (ev.memo || '') ? ev : cloneEventWithMemo(ev, memo);
  });
}
