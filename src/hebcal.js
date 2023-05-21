/* eslint-disable require-jsdoc */
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie,
  empty, urlArgs, getNumYears,
  makeIcalOpts,
  CACHE_CONTROL_7DAYS,
  getDefaultHebrewYear, makeHebrewCalendar,
  makeGeoUrlArgs,
  shortenUrl,
  queryDefaultCandleMins,
  localeMap, eTagFromOptions, langNames} from './common';
import {makeDownloadProps} from './makeDownloadProps';
import {greg, HDate} from '@hebcal/core';
import {eventsToClassicApi, eventToFullCalendar,
  eventToClassicApiObject,
  locationToPlainObj,
  getCalendarTitle,
  getDownloadFilename,
  eventsToCsv,
  eventsToRss2,
} from '@hebcal/rest-api';
import {eventsToIcalendar} from '@hebcal/icalendar';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import './dayjs-locales';
import '@hebcal/locales';

dayjs.extend(localeData);

const hebcalFormDefaults = {
  maj: 'on',
  min: 'on',
  nx: 'on',
  mf: 'on',
  ss: 'on',
  mod: 'on',
  i: 'off',
  yt: 'G',
  lg: 's',
  b: 18,
  M: 'on',
};

export async function hebcalApp(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  const cookie = ctx.cookies.get('C');
  const q = (ctx.request.querystring.length === 0 && !cookie) ?
    Object.assign({}, hebcalFormDefaults) :
    ctx.request.query.v === '1' ? Object.assign({}, ctx.request.query) :
    processCookieAndQuery(cookie, hebcalFormDefaults, ctx.request.query);
  ctx.status = 200;
  let error;
  let options = {};
  try {
    options = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    const status = err.status || 400;
    switch (q.cfg) {
      case 'json':
      case 'fc':
      case 'e':
      case 'e2':
      case 'csv':
      case 'rss':
      case 'ics':
        ctx.throw(status, err);
        break;
      default:
        if (q.v === '1') {
          ctx.status = status;
          q.v = '0';
          error = err;
        }
        break;
    }
  }
  if (options.il) {
    q.i = 'on';
  }
  if (options.location && options.location.geo !== 'pos') {
    q['city-typeahead'] = options.location.getName();
  }
  const startEnd = typeof options.start === 'object' && typeof options.end === 'object';
  if (empty(q.year) && !startEnd) {
    const dt = new Date();
    q.year = options.year = options.isHebrewYear ?
      getDefaultHebrewYear(new HDate(dt)) :
      dt.getMonth() === 11 ? dt.getFullYear() + 1 : dt.getFullYear();
  }
  if (ctx.status < 400 && q.v === '1') {
    ctx.response.etag = eTagFromOptions(options, {outputType: q.cfg});
    if (ctx.fresh) {
      ctx.status = 304;
      return;
    }
  }
  ctx.state.q = q;
  ctx.state.options = options;
  ctx.state.location = options.location;
  switch (q.cfg) {
    case 'json':
      renderJson(ctx);
      break;
    case 'fc':
      renderFullCalendar(ctx);
      break;
    case 'e':
    case 'e2':
      ctx.body = renderLegacyJavascript(ctx);
      break;
    case 'csv':
      ctx.body = renderCsv(ctx);
      break;
    case 'rss':
      ctx.body = renderRss(ctx);
      break;
    case 'ics':
      return renderIcal(ctx);
    default:
      if (q.v === '1') {
        return renderHtml(ctx);
      } else {
        return renderForm(ctx, error);
      }
  }
}

async function renderIcal(ctx) {
  const options = ctx.state.options;
  const icalOpt = makeIcalOpts(options, ctx.state.q);
  ctx.response.etag = eTagFromOptions(icalOpt, {outputType: '.ics'});
  if (isFresh(ctx)) {
    return;
  }
  const events = makeHebrewCalendar(ctx, options);
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  ctx.response.attachment(getDownloadFilename(options) + '.ics');
  ctx.response.type = 'text/calendar; charset=utf-8';
  icalOpt.utmSource = 'api';
  icalOpt.utmMedium = 'icalendar';
  ctx.body = await eventsToIcalendar(events, icalOpt);
}

function renderRss(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  const events = makeHebrewCalendar(ctx, options);
  const q = Object.assign({}, ctx.state.q);
  delete q.cfg;
  options.mainUrl = 'https://www.hebcal.com/hebcal?' + urlArgs(q);
  options.selfUrl = 'https://www.hebcal.com/hebcal?' + urlArgs(ctx.state.q);
  options.utmSource = 'api';
  options.utmMedium = 'rss';
  options.evPubDate = true;
  const rss = eventsToRss2(events, options);
  ctx.response.type = 'application/rss+xml; charset=utf-8';
  return rss;
}

function renderCsv(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  const events = makeHebrewCalendar(ctx, options);
  const csv = eventsToCsv(events, options);
  ctx.response.attachment(getDownloadFilename(options) + '.csv');
  ctx.response.type = 'text/x-csv; charset=utf-8';
  const locale = localeMap[options.locale] || 'en';
  const byteOrderMark = locale == 'en' ? '' : '\uFEFF';
  return byteOrderMark + csv;
}

async function renderForm(ctx, error) {
  const message = error ? error.message : undefined;
  const cookie = ctx.cookies.get('C');
  if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
    // private cache only if we're tailoring results by cookie
    ctx.set('Cache-Control', 'private');
  }
  const today = dayjs();
  const defaultYear = today.month() === 11 ? today.year() + 1 : today.year();
  const defaultYearHeb = getDefaultHebrewYear(new HDate(today.toDate()));
  return ctx.render('hebcal-form-page', {
    message,
    langNames,
    defaultYear,
    defaultYearHeb,
    queryDefaultCandleMins,
  });
}

function renderHtml(ctx) {
  const options = ctx.state.options;
  const events = makeHebrewCalendar(ctx, options);
  if (events.length === 0) {
    ctx.status = 400;
    if (options.dafyomi) {
      return renderForm(ctx, {message: 'Daf Yomi cycle began in 5684 (September 1923)'});
    } else if (options.mishnaYomi) {
      return renderForm(ctx, {message: 'Mishna Yomi cycle began in 5707 (May 1947)'});
    }
    return renderForm(ctx, {message: 'Please select at least one event option'});
  }
  const locationName = ctx.state.location ? ctx.state.location.getName() : options.il ? 'Israel' : 'Diaspora';
  const shortTitle = pageTitle(options, events);
  const locale = localeMap[options.locale] || 'en';
  const memos = {};
  const items = events.map((ev) => {
    const item0 = eventToClassicApiObject(ev, options, false);
    const item = {
      title: item0.title,
      date: item0.date,
      category: item0.category,
    };
    const bn = ev.basename();
    if (bn !== item0.title) {
      item.bn = bn;
    }
    if (locale === 'he' || options.appendHebrewToSubject) {
      item.hebrew = item0.hebrew;
    }
    if (item0.link) {
      item.link = shortenUrl(ev.url());
    }
    if (item0.yomtov) {
      item.yomtov = true;
    }
    if (item0.memo && typeof memos[bn] === 'undefined' && item0.date.indexOf('T') === -1) {
      const fullStop = item0.memo.indexOf('. ');
      memos[bn] = fullStop === -1 ? item0.memo : item0.memo.substring(0, fullStop);
    }
    return item;
  });
  const q = ctx.state.q;
  if (q.set !== 'off') {
    possiblySetCookie(ctx, q);
  }
  const today = dayjs();
  const localeData = today.locale(locale).localeData();
  makeDownloadProps(ctx, q, options);
  const url = ctx.state.url;
  url.canonical = 'https://www.hebcal.com/hebcal?' + urlArgs(q);
  url.settings = '/hebcal?' + urlArgs(q, {v: 0});
  const prev = makePrevNextUrl(q, options, events, false);
  const next = makePrevNextUrl(q, options, events, true);
  url.prev = prev.href;
  url.next = next.href;
  const optsTmp = Object.assign({}, options);
  optsTmp.subscribe = '1';
  url.title = getCalendarTitle(events, optsTmp);
  if (options.candlelighting) {
    const location = ctx.state.location;
    const geoUrlArgs = makeGeoUrlArgs(q, location, options);
    const idx = Math.floor(events.length / 2);
    const hyear = options.isHebrewYear ? options.year : events[idx].getDate().getFullYear();
    url.fridge = `/shabbat/fridge.cgi?${geoUrlArgs}&year=${hyear}`;
  }
  const localeConfig = {
    weekdaysShort: localeData.weekdaysShort(),
    monthsShort: localeData.monthsShort(),
    months: localeData.months(),
  };
  const gy = events[0].getDate().greg().getFullYear();
  if (gy >= 3762 && q.yt === 'G') {
    ctx.state.futureYears = gy - today.year();
    ctx.state.sameUrlHebYear = '/hebcal?' + urlArgs(q, {yt: 'H'});
  } else if (gy <= 0 && q.yt === 'H') {
    ctx.state.hebrewYear = options.year;
    ctx.state.sameUrlGregYear = '/hebcal?' + urlArgs(q, {yt: 'G'});
  }
  const cconfig = locationToPlainObj(ctx.state.location);
  const defaultYear = today.month() === 11 ? today.year() + 1 : today.year();
  const defaultYearHeb = getDefaultHebrewYear(new HDate(today.toDate()));
  const opts = Object.assign({}, options);
  delete opts.location;
  return ctx.render('hebcal-results', {
    items,
    memos,
    cconfig: Object.assign({geo: q.geo || 'none'}, cconfig),
    opts,
    today,
    gy,
    lang: locale === 'he' ? 'en' : locale, // twbs5 doesn't handle <html lang="he"> well enough yet
    locale,
    localeConfig,
    prevTitle: prev.title,
    nextTitle: next.title,
    shortTitle: 'Jewish Calendar ' + shortTitle,
    locationName,
    currentYear: options.isHebrewYear ? new HDate().getFullYear() : today.year(),
    downloadAltTitle: shortTitle + ' only',
    numYears: getNumYears(options),
    langNames,
    defaultYear,
    defaultYearHeb,
    queryDefaultCandleMins,
  });
}

/**
 * @private
 * @param {number} year
 * @return {string}
 */
function yearTitle(year) {
  return year > 0 ? '' + year : '' + (-(year-1)) + ' B.C.E.';
}

/**
 * @private
 * @param {CalOptions} options
 * @param {Event[]} events
 * @return {string}
 */
function pageTitle(options, events) {
  let shortTitle = '';
  if (options.month) {
    shortTitle += greg.monthNames[options.month] + ' ';
  }
  if (typeof options.year === 'number') {
    return shortTitle + yearTitle(options.year);
  }
  const gy1 = events[0].getDate().greg().getFullYear();
  const gy2 = events[events.length - 1].getDate().greg().getFullYear();
  if (gy1 === gy2) {
    return shortTitle + gy1;
  }
  return shortTitle + gy1 + '-' + (gy2 % 100);
}

function makePrevNextUrl(q, options, events, isNext) {
  const numYears = isNext ? 1 : -1;
  if (typeof options.year === 'number') {
    return {
      title: yearTitle(options.year + numYears),
      href: '/hebcal?' + urlArgs(q, {year: options.year + numYears}),
    };
  }
  const idx = isNext ? events.length - 1 : 0;
  const gy = events[idx].getDate().greg().getFullYear();
  const q2 = Object.assign({}, q);
  delete q2.start;
  delete q2.end;
  return {
    title: yearTitle(gy + numYears),
    href: '/hebcal?' + urlArgs(q2, {yt: 'G', year: gy + numYears}),
  };
}

function isFresh(ctx) {
  ctx.lastModified = ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return true;
  }
  return false;
}

function renderFullCalendar(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  for (const param of ['start', 'end']) {
    if (typeof options[param] === 'undefined') {
      if (Array.isArray(ctx.state.q[param])) {
        ctx.throw(400, `Invalid duplicate parameter '${param}'`);
      }
      ctx.throw(400, `Please specify required parameter '${param}'`);
    }
  }
  const events = makeHebrewCalendar(ctx, options);
  const location = options.location;
  const tzid = location ? location.getTzid() : 'UTC';
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.lastModified = new Date();
  ctx.body = events.map((ev) => eventToFullCalendar(ev, tzid, options.il));
}

function renderJson(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  const events = makeHebrewCalendar(ctx, options);
  const q = ctx.state.q;
  const leyningOff = (q.leyning === 'off' || q.leyning === '0');
  if (q.hdp === '1') {
    options.heDateParts = true;
  }
  let obj = eventsToClassicApi(events, options, !leyningOff);
  const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
  if (cb) {
    obj = cb + '(' + JSON.stringify(obj) + ')\n';
  }
  const orig = ctx.request.query;
  const yearNow = typeof orig.year === 'undefined' || orig.year === 'now' || orig.month === 'now';
  const startEnd = typeof options.start === 'object' && typeof options.end === 'object';
  const cacheControl = (startEnd || !yearNow) ? CACHE_CONTROL_7DAYS :
    'public, max-age=10800, s-maxage=10800';
  ctx.set('Cache-Control', cacheControl);
  ctx.lastModified = new Date();
  ctx.body = obj;
}

function renderLegacyJavascript(ctx) {
  if (isFresh(ctx)) {
    return;
  }
  const options = ctx.state.options;
  options.numYears = 2;
  const events = makeHebrewCalendar(ctx, options);
  ctx.type = 'text/javascript';
  const isoDate = new Date().toISOString();
  if (ctx.state.q.cfg === 'e') {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const fmtDt = d.format('YYYYMMDD');
      const desc = ev.render(options.locale);
      const url = ev.url() || '';
      return `DefineEvent(${fmtDt},"${desc}","${url}","",0,0);`;
    });
    return `/*! ${isoDate} */\n` + strs.join('\n');
  } else {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const url = ev.url();
      const obj = {d: Number(d.format('YYYYMMDD')), s: ev.render(options.locale)};
      if (url) {
        obj.u = shortenUrl(url);
      }
      return JSON.stringify(obj);
    });
    return `/*! ${isoDate} */\n` +
      'if(typeof HEBCAL=="undefined"||!HEBCAL){var HEBCAL={};}\nHEBCAL.eraw2=[\n' +
      strs.join(',\n') + `];
HEBCAL.jec2events=HEBCAL.eraw2.map(function(e){
var f={eventDate:''+e.d,eventDescription:e.s};
if(e.u){f.eventLink=e.u[0]=="/"?"https://www.hebcal.com"+e.u:e.u}
return f;
});
`;
  }
}
