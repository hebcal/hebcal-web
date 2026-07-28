import {flags} from '@hebcal/core';
import {IcalEvent, icalEventsToString} from '@hebcal/icalendar';
import {
  appendIsraelAndTracking,
  getCalendarTitle,
} from '@hebcal/rest-api';
import {getParshaSummary} from './parshaCommon.js';
import {localizedHolidayDescription, makeTorahMemoText} from './torahMemo.js';

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

/**
 * Builds the iCalendar `DESCRIPTION` text for an event: parsha summary or
 * holiday description, Omer count, Torah reading, and a link back to
 * hebcal.com.
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
    memo = getParshaSummary(ev, options.locale) || '';
  }
  if (!memo) {
    memo = localizedHolidayDescription(ev, options.locale);
  }
  if (!memo) {
    const linkEv = ev.linkedEvent;
    if (linkEv && linkEv.getDesc() !== ev.getDesc()) {
      memo = linkEv.render(options.locale);
    }
  }
  const torahMemo = makeTorahMemoText(ev, options.il);
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
 * Builds the `IcalEvent` for each event, handing `@hebcal/icalendar` the
 * `DESCRIPTION` text through the per-event `memo` option.
 *
 * The memo goes in the options rather than on the event itself because
 * `@hebcal/core` caches (and therefore shares) holiday event instances between
 * calendars: setting `ev.memo` here would leak this calendar's Israel/locale/
 * tracking-specific memo into later requests.
 * @param {Event[]} events
 * @param {any} options iCalendar options (`il`, `locale`, `utmSource`, ...)
 * @return {IcalEvent[]}
 */
export function makeIcalEvents(events, options) {
  return events.map(
      (ev) => new IcalEvent(ev, {...options, memo: createMemo(ev, options)}),
  );
}

/**
 * Like `eventsToIcalendar()` from `@hebcal/icalendar`, but builds each event's
 * `DESCRIPTION` first
 * @param {Event[]} events
 * @param {any} options
 * @return {Promise<string>}
 */
export function makeIcalendar(events, options) {
  if (!events.length) {
    throw new RangeError('Events can not be empty');
  }
  const opts = {...options};
  opts.dtstamp = opts.dtstamp || IcalEvent.makeDtstamp(new Date());
  if (!opts.title) {
    opts.title = getCalendarTitle(events, opts);
  }
  return icalEventsToString(makeIcalEvents(events, opts), opts);
}
