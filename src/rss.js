import {reformatTimeStr, Zmanim, holidayDesc as hdesc} from '@hebcal/core';
import {
  getCalendarTitle,
  getEventCategories,
  appendIsraelAndTracking,
  makeAnchor,
} from '@hebcal/rest-api';
import {localeMap} from './lang.js';
import {getParshaSummary} from './parshaCommon.js';
import {makeEventMemo} from './eventMemo.js';

/**
 * @private
 * @param {Event} ev
 * @param {boolean} il
 * @param {string} tzid
 * @param {string} mainUrl
 * @param {string} [utmSource]
 * @param {string} [utmMedium]
 * @return {string[]}
 */
function getLinkAndGuid(ev, il, tzid, mainUrl, utmSource, utmMedium) {
  let link;
  let guid;
  const eventTime = ev.eventTime;
  const dt = eventTime || ev.greg();
  const isoDateTime = Zmanim.formatISOWithTimeZone(tzid, dt);
  const dtStr = isoDateTime.substring(0, isoDateTime.indexOf('T'));
  const dtAnchor = dtStr.replaceAll('-', '');
  const descAnchor = makeAnchor(ev.getDesc());
  const anchor = `${dtAnchor}-${descAnchor}`;
  const url0 = ev.url();
  if (url0) {
    link = appendIsraelAndTracking(url0, il, utmSource, utmMedium).replaceAll('&', '&amp;');
    guid = `${url0}#${anchor}`;
  } else {
    const url1 = `${mainUrl}&dt=${dtStr}`;
    const url = appendIsraelAndTracking(url1, il, utmSource, utmMedium).replaceAll('&', '&amp;');
    guid = url1.replaceAll('&', '&amp;') + `#${anchor}`;
    link = `${url}#${anchor}`;
  }
  return [link, guid];
}

/**
 * Generates an RSS 2.0 feed from an array of events
 * @param {Event[]} events
 * @param {any} options
 * @return {string}
 */
export function eventsToRss2(events, options) {
  options.dayFormat = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const location = options.location;
  if (!options.mainUrl || !options.selfUrl) {
    throw new TypeError('mainUrl cannot be empty or blank');
  }
  const buildDate = options.buildDate = options.buildDate || new Date();
  const thisYear = buildDate.getFullYear();
  const lastBuildDate = options.lastBuildDate = buildDate.toUTCString();
  const title = options.title || getCalendarTitle(events, options);
  const description = options.description || title;
  const utmSource = options.utmSource || 'shabbat1c';
  const utmMedium = options.utmMedium || 'rss';
  const mainUrlEsc = appendIsraelAndTracking(
      options.mainUrl,
      Boolean(location?.getIsrael()),
      utmSource,
      utmMedium,
      options.utmCampaign,
  ).replaceAll('&', '&amp;');
  const selfUrlEsc = options.selfUrl.replaceAll('&', '&amp;');
  // `options.lang` is the feed's own declared language (parshaRss.js sets it
  // from the filename, e.g. `he-x-NoNikud`); otherwise map the locale down to
  // an ISO code, since transliteration locales like `s` are English content.
  const lang = options.lang || localeMap[options.locale] || 'en-US';
  let str = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${title}</title>
<link>${mainUrlEsc}</link>
<atom:link href="${selfUrlEsc}" rel="self" type="application/rss+xml" />
<description>${description}</description>
<language>${lang}</language>
<copyright>Copyright (c) ${thisYear} Michael J. Radwin. All rights reserved.</copyright>
<lastBuildDate>${lastBuildDate}</lastBuildDate>
`;
  for (const ev of events) {
    str += eventToRssItem2(ev, options);
  }
  str += '</channel>\n</rss>\n';
  return str;
}

/**
 * @private
 * @param {Event} ev
 * @param {boolean} [evPubDate]
 * @param {Date} evDate
 * @param {string} [lastBuildDate]
 * @return {string|undefined}
 */
function getPubDate(ev, evPubDate, evDate, lastBuildDate) {
  if (evPubDate) {
    const dt = ev.eventTime;
    if (dt) {
      return dt.toUTCString();
    }
    return evDate.toUTCString().replace(/ \S+ GMT$/, ' 00:00:00 GMT');
  }
  return lastBuildDate;
}

/**
 * Generates a single RSS 2.0 `<item>` from an event
 * @param {Event} ev
 * @param {any} options
 * @return {string}
 */
export function eventToRssItem2(ev, options) {
  let subj = ev.render(options.locale);
  const evDate = ev.greg();
  const pubDate = getPubDate(ev, options.evPubDate, evDate, options.lastBuildDate);
  const location = options.location;
  const il = location ? location.getIsrael() : false;
  const tzid = location ? location.getTzid() : 'UTC';
  let utmSource = options.utmSource;
  if (!utmSource) {
    const url = ev.url();
    if (url) {
      const u = new URL(url);
      if (u.host === 'www.hebcal.com') {
        utmSource = 'shabbat1c';
      }
    } else {
      utmSource = 'shabbat1c';
    }
  }
  const utmMedium = options.utmMedium || 'rss';
  const mainUrl = options.mainUrl || '';
  const [link, guid] = getLinkAndGuid(ev, il, tzid, mainUrl, utmSource, utmMedium);
  const categories = getEventCategories(ev);
  const cat0 = categories[0];
  const desc = ev.getDesc();
  const candles = desc === hdesc.HAVDALAH || desc === hdesc.CANDLE_LIGHTING;
  let memo;
  if (candles) {
    const colon = subj.indexOf(': ');
    if (colon !== -1) {
      const locale = options.locale || 'en';
      const opts = {location, il, locale};
      const time = reformatTimeStr(ev.eventTimeStr, 'pm', opts);
      subj = subj.substring(0, colon) + ': ' + time;
    }
  } else {
    const locale = options.locale || options.lang;
    memo = makeEventMemo(ev, il, locale);
    // lead a Parasha with its prose summary, the way the .ics DESCRIPTION and
    // the /sedrot feeds do.
    const summary = getParshaSummary(ev, locale);
    if (summary) {
      memo = memo ? summary + '\n\n' + memo : summary;
    }
  }
  const dayFormat = options.dayFormat;
  const tmp = memo || dayFormat.format(evDate);
  const description = tmp.indexOf('<') === -1 ? tmp : `<![CDATA[${tmp}]]>`;
  const geoTags = cat0 === 'candles' ?
    `<geo:lat>${location.getLatitude()}</geo:lat>\n<geo:long>${location.getLongitude()}</geo:long>\n` :
    '';
  return `<item>
<title>${subj}</title>
<link>${link}</link>
<guid isPermaLink="false">${guid}</guid>
<description>${description}</description>
<category>${cat0}</category>
<pubDate>${pubDate}</pubDate>
${geoTags}</item>
`;
}
