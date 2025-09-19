import {HebrewCalendar, Locale, Zmanim, HDate} from '@hebcal/core';
import {empty} from './empty.js';
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie,
  cleanQuery,
  httpRedirect,
  getLocationFromGeoIp,
  eTagFromOptions,
  makeGeoUrlArgs,
  shortenUrl,
  queryDefaultCandleMins,
  CACHE_CONTROL_7DAYS,
  localeMap, makeHebrewCalendar} from './common.js';
import {getTodayDate, getDefaultYear, getDefaultHebrewYear,
  expiresSaturdayNight} from './dateUtil.js';
import {makeDownloadProps} from './makeDownloadProps.js';
import '@hebcal/locales';
import dayjs from 'dayjs';
import {countryNames, getEventCategories, renderTitleWithoutTime, makeAnchor,
  eventsToRss2, appendIsraelAndTracking} from '@hebcal/rest-api';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import './dayjs-locales.js';
import {GeoDb} from '@hebcal/geo-sqlite';
import {myEventsToClassicApi} from './myEventsToClassicApi.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const BASE_URL = 'https://www.hebcal.com/shabbat';

export async function shabbatApp(ctx) {
  const isRedir = geoIpRedirect(ctx);
  if (isRedir) {
    return;
  }
  ctx.status = 200;
  const {q, options, dateOverride, dt} = makeOptions(ctx);
  // only set expiry if there are CGI arguments
  if (ctx.status < 400 && ctx.request.querystring.length > 0) {
    ctx.response.etag = eTagFromOptions(ctx, options, {outputType: q.cfg});
    if (ctx.fresh) {
      ctx.status = 304;
      return;
    }
    if (dateOverride) {
      ctx.lastModified = new Date();
      ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
    } else {
      expiresSaturdayNight(ctx, new Date(), options.location.getTzid());
    }
  }
  makeItems(ctx, options, q);
  const location = options.location;
  const campaign = makeAnchor(location.getShortName());
  const selfUrl = `${BASE_URL}?${ctx.state.geoUrlArgs}`;
  ctx.state.q = q;
  ctx.state.poweredByUrl = appendIsraelAndTracking(selfUrl,
      options.il, 'shabbat1c', 'js-' + q.cfg, 's1c-' + campaign);
  if (q.cfg === 'i') {
    return ctx.render('shabbat-iframe', {Locale});
  } else if (q.cfg === 'i2') {
    return ctx.render('shabbat-js', {Locale});
  } else if (q.cfg === 'j') {
    const html = await ctx.render('shabbat-js', {Locale, writeResp: false});
    ctx.type = 'text/javascript';
    ctx.body = html.split('\n').map((line) => {
      return 'document.write("' + line.replace(/"/g, '\\"') + '");\n';
    }).join('');
  } else if (q.cfg === 'r') {
    ctx.type = 'application/rss+xml; charset=utf-8';
    options.mainUrl = selfUrl;
    options.selfUrl = ctx.state.rssUrl;
    options.evPubDate = q.pubDate != 0;
    options.title = ctx.state.title;
    ctx.body = eventsToRss2(ctx.state.events, options);
  } else if (q.cfg === 'json') {
    const leyningOff = (q.leyning === 'off' || q.leyning === '0');
    if (q.hdp === '1') {
      ctx.state.options.heDateParts = true;
    }
    let obj = myEventsToClassicApi(ctx.state.events, ctx.state.options, !leyningOff);
    const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
    if (cb) {
      obj = cb + '(' + JSON.stringify(obj) + ')\n';
    }
    ctx.body = obj;
  } else {
    const cookie = ctx.cookies.get('C');
    const p = makePropsForFullHtml(ctx, dt);
    if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
      // private cache only if we're tailoring results by cookie
      ctx.set('Cache-Control', 'private');
    }
    if (q.set !== 'off') {
      possiblySetCookie(ctx, q);
    }
    if (q.amp === '1') {
      p.amp = true;
    }
    p.queryDefaultCandleMins = queryDefaultCandleMins;
    makeDownloadProps(ctx, q, options);
    ctx.state.numYears = 4;
    const year = ctx.state.currentYear = new Date().getFullYear();
    ctx.state.downloadAltTitle = `${year} only`;
    delete ctx.state.filename.pdf;
    p.Locale = Locale;
    return ctx.render('shabbat', p);
  }
}

function geoIpRedirect(ctx) {
  if (ctx.request.querystring.length !== 0) {
    return false;
  }

  const cookieStr = ctx.cookies.get('C');
  if (cookieStr) {
    if (cookieStr.indexOf('geonameid=') !== -1 ||
        cookieStr.indexOf('zip=') !== -1 ||
        cookieStr.indexOf('city=') !== -1 ||
        cookieStr.indexOf('geo=pos') !== -1) {
      return false;
    }
  }

  const geoip = ctx.state.geoip = getLocationFromGeoIp(ctx);
  if (geoip.zip) {
    const dest = `/shabbat?zip=${geoip.zip}&ue=off&b=18&M=on&lg=s&geoip=zip`;
    redir(ctx, dest);
    return true;
  } else if (geoip.geonameid) {
    const mode = geoip.nn ? 'nn' : 'geonameid';
    const candleMins = queryDefaultCandleMins(geoip);
    const dest = `/shabbat?geonameid=${geoip.geonameid}&ue=off&b=${candleMins}&M=on&lg=s&geoip=${mode}`;
    redir(ctx, dest);
    return true;
  }

  return false;
}

function redir(ctx, dest) {
  ctx.set('Cache-Control', 'private, max-age=0');
  httpRedirect(ctx, dest);
}

/**
 * Gets start and end days for filtering relevant hebcal events
 * @param {Date} dt
 * @param {boolean} now
 * @param {string} tzid
 * @return {dayjs.Dayjs[]}
 */
function getStartAndEnd(dt, now, tzid) {
  const input = now ? dt : dayjs(dt).format('YYYY-MM-DD 12:00');
  const d = dayjs.tz(input, tzid);
  // back up to Friday if today is Saturday (include last night's candle-lighting times)
  const start = (d.day() === 6) ? d.subtract(1, 'day') : d;
  const saturday = start.add(6 - start.day(), 'day');
  const fiveDaysAhead = start.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [start, endOfWeek];
}

const includeAdmin1 = {US: 1, CA: 1, UK: 1};

/**
 * @param {Location} location
 * @return {string}
 */
function compactLocationName(location) {
  const cc = location.getCountryCode();
  if (includeAdmin1[cc]) {
    return location.getName();
  }
  const city = location.getShortName();
  const country = countryNames[cc];
  return GeoDb.geonameCityDescr(city, null, country);
}

function makeItems(ctx, options, q) {
  const events = makeHebrewCalendar(ctx, options);
  if (events.length === 0) {
    ctx.throw(400, 'Bad request: no events');
  }
  /** @type {Location} */
  const location = options.location;
  const locale = localeMap[Locale.getLocaleName()] || 'en';
  const items = events.map((ev) => eventToItem(ev, options, locale, q.cfg));
  const titlePrefix = Locale.gettext('Shabbat Times for') + ' ' + compactLocationName(location);
  const title = titlePrefix + ' - Hebcal';
  Object.assign(ctx.state, {
    events,
    options,
    q,
    location,
    locale,
    hyear: getDefaultHebrewYear(events[0].getDate()),
    items,
    h3title: titlePrefix,
    title,
  });

  const geoUrlArgs = makeGeoUrlArgs(q, location, options);
  Object.assign(ctx.state, {
    geoUrlArgs,
    rssUrl: `${BASE_URL}?cfg=r&${geoUrlArgs}&pubDate=0`,
  });
}

function makeOptions(ctx) {
  const q0 = {tgt: '_top', ...ctx.request.query};
  for (const k of ['c', 's', 'maj', 'min', 'nx', 'mod', 'mf', 'ss']) {
    q0[k] = 'on';
  }
  if (empty(q0.M) && empty(q0.m)) {
    q0.M = 'on';
  }
  const cfg = q0.cfg;
  const isApi = (cfg === 'json' || cfg === 'i' || cfg === 'r' || cfg === 'j' || cfg === 'i2');
  const q = isApi ? q0 : processCookieAndQuery(ctx.cookies.get('C'), {}, q0);
  cleanQuery(q);
  delete q.d;
  delete q.D;
  let options = {};
  try {
    options = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    const status = err.status || 400;
    if (isApi) {
      ctx.throw(status, err);
    } else {
      ctx.status = status;
    }
    ctx.state.message = err.message;
  }
  const location = options.location || ctx.db.lookupLegacyCity('New York');
  if (location.geo !== 'pos') {
    q['city-typeahead'] = location.getName();
  }
  if (!options.location) {
    options.location = location;
    options.candlelighting = true;
    options.sedrot = true;
    q.geonameid = location.getGeoId();
    q.geo = 'geoname';
  }
  const {dt, now} = getTodayDate(q);
  let startAndEnd;
  try {
    startAndEnd = getStartAndEnd(dt, now, location.getTzid());
  } catch (err) {
    ctx.throw(400, err); // RangeError: Invalid time zone specified
  }
  const [midnight, endOfWeek] = startAndEnd;
  options.start = new Date(midnight.year(), midnight.month(), midnight.date());
  options.end = new Date(endOfWeek.year(), endOfWeek.month(), endOfWeek.date());
  return {q, options, dateOverride: !now, midnight, endOfWeek, dt};
}

function makePropsForFullHtml(ctx, dt) {
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
  const havdalah = items.find((i) => i.cat === 'havdalah');
  const jsonLD = firstCandles && location.getGeoId() &&
    getJsonLD(
        ctx,
        firstCandles,
        havdalah,
        parashaItem && parashaItem.desc,
    );
  const geoUrlArgs = ctx.state.geoUrlArgs;
  const yearInfo = getDefaultYear(dt, new HDate(dt));
  const fridgeURL = `/shabbat/fridge.cgi?${geoUrlArgs}${yearInfo.yearArgs}`;
  return {
    summary: briefText.join('. '),
    jsonLD,
    locationName: location.getName(),
    fridgeURL,
    ...yearInfo,
  };
}

function getJsonLD(ctx, candles, havdalah, torahPortion) {
  const location = ctx.state.location;
  const url = `${BASE_URL}?${ctx.state.geoUrlArgs}&utm_campaign=json-ld`;
  const candlesSubj = `Light Shabbat candles at ${candles.fmtTime} in ${location.getShortName()}`;
  const candlesLD = makeJsonLDevent(candles, location, candlesSubj, url);
  if (torahPortion) {
    candlesLD.description = `Torah portion: ${torahPortion}`;
  }
  const breadCrumbLD = makeBreadCrumbLD(location, ctx.state.geoUrlArgs);
  const result = breadCrumbLD ? [breadCrumbLD, candlesLD] : [candlesLD];
  if (havdalah) {
    const havdalahSubj = `Shabbat ends at ${havdalah.fmtTime} in ${location.getShortName()}`;
    const havdalahLD = makeJsonLDevent(havdalah, location, havdalahSubj, url);
    result.push(havdalahLD);
  }
  return result;
}

function makeBreadCrumbLD(location, geoUrlArgs) {
  const country = countryNames[location.getCountryCode()];
  if (!country) {
    return null;
  }
  const countryUrl = 'https://www.hebcal.com/shabbat/browse/' + makeAnchor(country);
  const elems = [{
    '@type': 'ListItem',
    'position': 1,
    'name': 'Shabbat',
    'item': 'https://www.hebcal.com/shabbat',
  }, {
    '@type': 'ListItem',
    'position': 2,
    'name': country,
    'item': countryUrl,
  }];
  let position = 3;
  if (location.admin1) {
    const suffix = location.stateName || location.admin1;
    elems.push({
      '@type': 'ListItem',
      'position': position++,
      'name': location.admin1,
      'item': countryUrl + '-' + makeAnchor(suffix),
    });
  }
  elems.push({
    '@type': 'ListItem',
    'position': position,
    'name': location.getShortName(),
    'item': 'https://www.hebcal.com/shabbat?' + geoUrlArgs,
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': elems,
  };
}

function makeJsonLDevent(item, location, subj, url) {
  const admin1 = location.admin1 || '';
  const result = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': subj,
    'startDate': item.isoDateTime,
    'url': url,
    'location': {
      '@type': 'Place',
      'name': location.getName(),
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': location.getShortName(),
        'addressRegion': admin1,
        'addressCountry': countryNames[location.getCountryCode()],
      },
    },
  };
  if (typeof location.zip === 'string') {
    result.location.address.postalCode = location.zip;
  }
  return result;
}

/**
 * @param {Event} ev
 * @param {import('@hebcal/core').CalOptions} options
 * @param {string} locale
 * @param {string} cfg
 * @return {Object}
 */
function eventToItem(ev, options, locale, cfg) {
  const desc = ev.getDesc();
  const hd = ev.getDate();
  const d = dayjs(hd.greg());
  const monthFmt = locale === 'he' ? 'MMMM' : 'MMM';
  const fmtDate = d.locale(locale).format(`dddd, ${monthFmt} D`);
  const isoDate = d.format('YYYY-MM-DD');
  const categories = getEventCategories(ev);
  const cat0 = categories[0];
  const id = d.format('YYYYMMDD') + '-' + makeAnchor(desc);
  const subj = renderTitleWithoutTime(ev, locale);
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
    obj.fmtTime = HebrewCalendar.reformatTimeStr(ev.eventTimeStr, 'pm', options);
    const tzid = ev.location.getTzid();
    obj.isoDateTime = Zmanim.formatISOWithTimeZone(tzid, ev.eventTime);
  }
  const url = ev.url();
  if (url) {
    if (cfg === 'i' || cfg === 'j' || cfg === 'i2') {
      const location = options.location;
      const campaign = makeAnchor(location.getShortName());
      obj.url = appendIsraelAndTracking(url, options.il, 'shabbat1c', 'js-' + cfg, 's1c-' + campaign);
    } else {
      let u = url;
      if (options.il && url.indexOf('?') === -1) {
        u += '?i=on';
      }
      if (empty(cfg)) {
        u = shortenUrl(u);
      }
      obj.url = u;
    }
  }
  return obj;
}
