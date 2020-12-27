/* eslint-disable require-jsdoc */
import {HebrewCalendar, Locale} from '@hebcal/core';
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie,
  empty, typeaheadScript, tooltipScript, getDefaultHebrewYear,
  localeMap, makeHebrewCalendar} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';
import {countryNames, getEventCategories, renderTitleWithoutTime, makeAnchor,
  eventsToRss, eventsToClassicApi} from '@hebcal/rest-api';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/es';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hu';
import 'dayjs/locale/pl';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);

function expires(ctx) {
  const today = dayjs();
  const dt = today.toDate();
  ctx.set('Last-Modified', dt.toUTCString());
  const sunday = today.day(7);
  const tzid = ctx.state.location.getTzid();
  const exp = dayjs.tz(sunday.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

export async function shabbatApp(ctx) {
  if (ctx.request.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  makeItems(ctx);
  // only set expiry if there are CGI arguments
  if (ctx.request.querystring.length > 0) {
    expires(ctx);
  }
  const q = ctx.state.q;
  if (q.cfg === 'i') {
    return ctx.render('shabbat-iframe');
  } else if (q.cfg === 'j') {
    const html = await ctx.render('shabbat-js', {writeResp: false});
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'text/javascript';
    ctx.body = html.split('\n').map((line) => {
      return 'document.write("' + line.replace(/"/g, '\\"') + '");\n';
    }).join('');
  } else if (q.cfg === 'r') {
    ctx.type = 'application/rss+xml; charset=utf-8';
    const selfUrl = `https://www.hebcal.com/shabbat?${ctx.state.geoUrlArgs}`;
    ctx.body = eventsToRss(ctx.state.events, ctx.state.location,
        selfUrl, ctx.state.rssUrl, ctx.state.locale, q.pubDate != 0);
  } else if (q.cfg === 'json') {
    let obj = eventsToClassicApi(ctx.state.events, ctx.state.options);
    if (q.leyning === 'off') {
      for (const item of obj.items) {
        delete item.leyning;
      }
    }
    const cb = q.callback;
    if (typeof cb === 'string' && cb.length) {
      obj = cb + '(' + JSON.stringify(obj) + ')\n';
    }
    ctx.body = obj;
  } else {
    const cookie = ctx.cookies.get('C');
    const p = makePropsForFullHtml(ctx);
    if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
      // private cache only if we're tailoring results by cookie
      ctx.set('Cache-Control', 'private');
    } else {
      possiblySetCookie(ctx, q);
    }
    return ctx.render('shabbat', p);
  }
}

/**
 * Gets start and end days for filtering relevant hebcal events
 * @param {Date} now
 * @return {dayjs.Dayjs[]}
 */
function getStartAndEnd(now) {
  let midnight = dayjs(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = midnight.day();
  // back up to Friday if today is Saturday (include last night's candle-lighting times)
  if (dow == 6) {
    midnight = midnight.subtract(1, 'day');
  }
  const saturday = midnight.add(6 - dow, 'day');
  const fiveDaysAhead = midnight.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [midnight, endOfWeek];
}

function makeItems(ctx) {
  const q = processCookieAndQuery(
      ctx.cookies.get('C'),
      {c: 'on', s: 'on', tgt: '_top'},
      ctx.request.query,
  );
  let opts0 = {};
  try {
    opts0 = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    if (q.cfg === 'json' || q.cfg === 'r' || q.cfg === 'j') {
      ctx.throw(400, err);
    }
    ctx.state.message = err.message;
  }
  const location = opts0.location || ctx.db.lookupLegacyCity('New York');
  q['city-typeahead'] = location.getName();
  if (!opts0.location) {
    q.geonameid = location.getGeoId();
    q.geo = 'geoname';
  }
  const dt = (!empty(q.gy) && !empty(q.gm) && !empty(q.gd)) ?
      new Date(parseInt(q.gy, 10), parseInt(q.gm, 10) - 1, parseInt(q.gd, 10)) :
      new Date();
  const [midnight, endOfWeek] = getStartAndEnd(dt);
  const options = {
    start: midnight.toDate(),
    end: endOfWeek.toDate(),
    candlelighting: true,
    location,
    locale: opts0.locale,
    il: opts0.il,
    sedrot: true,
  };
  q.M = typeof opts0.havdalahMins === 'undefined' ? 'on' : 'off';
  if (q.M === 'off' && !isNaN(opts0.havdalahMins)) {
    options.havdalahMins = opts0.havdalahMins;
  }
  if (!isNaN(opts0.candleLightingMins)) {
    options.candleLightingMins = opts0.candleLightingMins;
  }
  const events = makeHebrewCalendar(ctx, options);
  const locale = localeMap[Locale.getLocaleName()] || 'en';
  const titlePrefix = location.getName() + ' ' + Locale.gettext('Shabbat') + ' Times';
  Object.assign(ctx.state, {
    events,
    options,
    q,
    location,
    locale,
    hyear: getDefaultHebrewYear(events[0].getDate()),
    items: events.map((ev) => eventToItem(ev, options, locale)),
    h3title: titlePrefix,
    title: titlePrefix + ' | Hebcal Jewish Calendar',
    Shabbat: Locale.gettext('Shabbat'),
  });

  let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
  if (typeof options.candleLightingMins !== 'undefined') {
    geoUrlArgs += '&b=' + options.candleLightingMins;
  }
  if (typeof options.havdalahMins !== 'undefined') {
    geoUrlArgs += '&m=' + options.havdalahMins;
  }
  geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
  Object.assign(ctx.state, {
    geoUrlArgs,
    rssUrl: `https://www.hebcal.com/shabbat?cfg=r&${geoUrlArgs}&pubDate=0`,
  });
}

function makePropsForFullHtml(ctx) {
  const items = ctx.state.items;
  const location = ctx.state.location;
  const briefText = items.map((i) => {
    const date = i.d.format('MMM D');
    if (i.fmtTime) {
      return `${i.desc} at ${i.fmtTime} on ${date}`;
    } else if (i.cat === 'parashat') {
      return i.desc;
    } else {
      return `${i.desc} on ${date}`;
    }
  });
  const firstCandles = items.find((i) => i.cat === 'candles');
  const parashaItem = items.find((i) => i.cat === 'parashat');
  return {
    summary: briefText.join('. '),
    jsonLD: firstCandles && location.getGeoId() ?
      JSON.stringify(getJsonLD(firstCandles, parashaItem && parashaItem.desc, location)) :
      '',
    locationName: location.getName(),
    xtra_html: typeaheadScript + tooltipScript,
  };
}

function getJsonLD(item, torahPortion, location) {
  const admin1 = location.admin1 || '';
  const result = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': `${location.getShortName()} Shabbat candle lighting`,
    'startDate': `${item.isoDate}T${item.isoTime}:00`,
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'eventStatus': 'https://schema.org/EventScheduled',
    'location': {
      '@type': 'Place',
      'name': location.getName(),
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': location.getShortName(),
        'addressRegion': admin1,
        'addressCountry': countryNames[location.getCountryCode()],
      },
      'geo': {
        '@type': 'GeoCoordinates',
        'latitude': location.getLatitude(),
        'longitude': location.getLongitude(),
      },
    },
  };
  if (torahPortion) {
    result.description = `Torah portion: ${torahPortion}`;
  }
  return result;
}

/**
 * @param {Event} ev
 * @param {HebrewCalendar.Options} options
 * @param {string} locale
 * @return {Object}
 */
function eventToItem(ev, options, locale) {
  const desc = ev.getDesc();
  const hd = ev.getDate();
  const d = dayjs(hd.greg());
  const fmtDate = d.locale(locale).format('dddd, D MMMM YYYY');
  const isoDate = d.format('YYYY-MM-DD');
  const categories = getEventCategories(ev);
  const cat0 = categories[0];
  const id = d.format('YYYYMMDD') + '-' + makeAnchor(desc);
  const subj = renderTitleWithoutTime(ev);
  const obj = {
    id,
    desc: subj,
    cat: cat0,
    d,
    isoDate,
    fmtDate,
  };
  const timed = Boolean(ev.eventTime);
  if (timed) {
    const hourMin = timed && HebrewCalendar.reformatTimeStr(ev.eventTimeStr, 'pm', options);
    obj.isoTime = ev.eventTimeStr;
    obj.fmtTime = hourMin;
  }
  const url0 = ev.url();
  const url = url0 && options.il ? url0 + '?i=on' : url0;
  if (url) {
    obj.url = url;
  }
  return obj;
}
