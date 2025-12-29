import {empty} from './empty.js';
import {makeHebcalOptions,
  urlArgs, getNumYears,
  cacheControl,
  CACHE_CONTROL_7DAYS,
  makeHebrewCalendar,
  makeGeoUrlArgs,
  shortenUrl,
  makeETag} from './common.js';
import {cleanQuery} from './cleanQuery.js';
import {
  hebcalFormDefaults,
  langNames,
  localeMap,
  queryToName,
  queryLongDescr,
  queryDefaultCandleMins,
  dailyLearningConfig,
  dailyLearningOpts,
  makeCalendarSubtitleFromOpts,
  makeIcalOpts,
  processCookieAndQuery,
} from './opts.js';
import {possiblySetCookie} from './cookie.js';
import {getDefaultYear, getDefaultHebrewYear} from './dateUtil.js';
import {makeDownloadProps} from './makeDownloadProps.js';
import {flags, HDate, Locale, DailyLearning} from '@hebcal/core';
import {
  eventToFullCalendar,
  eventToClassicApiObject,
  locationToPlainObj,
  getCalendarTitle,
  getDownloadFilename,
  eventsToCsv,
  eventsToRss2,
} from '@hebcal/rest-api';
import {eventsToIcalendar} from '@hebcal/icalendar';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData.js';
import './dayjs-locales.js';
import '@hebcal/locales';
import {myEventsToClassicApi} from './myEventsToClassicApi.js';

dayjs.extend(localeData);

export async function hebcalApp(ctx) {
  const cookie = ctx.cookies.get('C');
  const q = (ctx.request.querystring.length === 0 && !cookie) ?
    {...hebcalFormDefaults} :
    ctx.request.query.v === '1' ? {...ctx.request.query} :
    processCookieAndQuery(cookie, hebcalFormDefaults, ctx.request.query);
  cleanQuery(q);
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
  const dt = new Date();
  const hd = new HDate(dt);
  const yearInfo = ctx.state.defaultYearInfo = getDefaultYear(dt, hd);
  const startEnd = typeof options.start === 'object' && typeof options.end === 'object';
  if (empty(q.year) && !startEnd) {
    const ytStr = ctx.request.query.yt;
    if (empty(ytStr)) {
      const isHebrewYear = options.isHebrewYear = yearInfo.isHebrewYear;
      q.yt = isHebrewYear ? 'H' : 'G';
      q.year = options.year = isHebrewYear ? yearInfo.hy : yearInfo.gregRange;
    } else {
      q.year = options.year = (ytStr === 'H') ? yearInfo.hy :
        dt.getMonth() === 11 ? dt.getFullYear() + 1 : dt.getFullYear();
    }
  }
  if (!options.isHebrewYear && options.year > 9999) {
    ctx.status = 400;
    q.v = '0';
    error = {message: `Gregorian year cannot be greater than 9999: ${options.year}`};
  } else if (options.isHebrewYear && options.year > 13760) {
    ctx.status = 400;
    q.v = '0';
    error = {message: `Hebrew year cannot be greater than 13760: ${options.year}`};
  }
  if (ctx.status < 400 && q.v === '1') {
    ctx.response.etag = makeETag(ctx, options, {outputType: q.cfg});
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
  ctx.response.etag = makeETag(ctx, icalOpt, {outputType: '.ics'});
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
  const q = {...ctx.state.q};
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
  if (ctx.request.querystring.length === 0 && cookie?.length) {
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
    dailyLearningOpts,
    queryToName,
    queryLongDescr,
  });
}

const hebMonthAbbr = {
  'Adar': 'Adar',
  'Adar I': 'Adar1',
  'Adar II': 'Adar2',
  'Av': 'Av',
  'Cheshvan': 'Chesh.',
  'Elul': 'Elul',
  'Iyyar': 'Iyar',
  'Kislev': 'Kis.',
  'Nisan': 'Nis.',
  'Sh\'vat': 'Shv.',
  'Sh’vat': 'Shv.',
  'Sivan': 'Siv.',
  'Tamuz': 'Tam.',
  'Tevet': 'Tev.',
  'Teves': 'Tev.',
  'Tishrei': 'Tish.',
};


function getHebMonthNames(events, lang) {
  const year = events[0].getDate().getFullYear();
  const months = new Array(14);
  for (let i = 1; i <= 13; i++) {
    const name = HDate.getMonthName(i, year);
    months[i] = Locale.gettext(name, lang);
  }
  return months;
}

const LEARNING_MASK =
  flags.DAILY_LEARNING |
  flags.DAF_YOMI |
  flags.NACH_YOMI |
  flags.MISHNA_YOMI |
  flags.YERUSHALMI_YOMI;

function renderHtml(ctx) {
  const options = ctx.state.options;
  const events = makeHebrewCalendar(ctx, options);
  if (events.length === 0) {
    ctx.status = 400;
    if (options.dailyLearning) {
      for (const dlOpt of Object.keys(options.dailyLearning)) {
        const startDate = DailyLearning.getStartDate(dlOpt);
        if (startDate) {
          const cfg = dailyLearningConfig.find((cfg) => cfg.dailyLearningOptName === dlOpt);
          const d = dayjs(startDate.greg());
          const fmtDt = d.format('MMM YYYY');
          return renderForm(ctx, {message: `${cfg.settingsName} cycle began in ${startDate.getFullYear()} (${fmtDt})`});
        }
      }
    }
    return renderForm(ctx, {message: 'Please select at least one event option'});
  }
  const location = ctx.state.location;
  const q = ctx.state.q;
  const locationName = location ? location.getName() : makeCalendarSubtitleFromOpts(options, q);
  const shortTitle = pageTitle(options, events);
  const locale = localeMap[options.locale] || 'en';
  const memos = {};
  const items = events.map((ev) => {
    const item0 = eventToClassicApiObject(ev, options, false);
    const item = {
      t0: item0.title,
      dt: item0.date,
      cat: item0.category,
    };
    if (ev.getFlags() & LEARNING_MASK) {
      item.cat += ' learning';
    } else if (item0.subcat) {
      item.cat += ' ' + item0.subcat;
    }
    const bn = ev.basename();
    if (bn !== item0.title) {
      item.bn = bn;
    }
    if (locale === 'he' || options.appendHebrewToSubject) {
      item.h0 = item0.hebrew;
    }
    if (item0.link) {
      item.u0 = shortenUrl(ev.url());
    }
    if (item0.yomtov) {
      item.yt = true;
    }
    if (item0.memo && typeof memos[bn] === 'undefined' && item0.date.indexOf('T') === -1) {
      const fullStop = item0.memo.indexOf('. ');
      memos[bn] = fullStop === -1 ? item0.memo : item0.memo.substring(0, fullStop);
    }
    return item;
  });
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
  const optsTmp = {...options};
  optsTmp.subscribe = '1';
  url.title = getCalendarTitle(events, optsTmp);
  if (options.candlelighting) {
    const geoUrlArgs = makeGeoUrlArgs(q, location, options);
    const idx = Math.floor(events.length / 2);
    const hyear = options.isHebrewYear ? options.year : events[idx].getDate().getFullYear();
    url.fridge = `/shabbat/fridge.cgi?${geoUrlArgs}&year=${hyear}`;
  }
  const localeConfig = {
    weekdaysShort: localeData.weekdaysShort(),
    weekdays: localeData.weekdays(),
    monthsShort: localeData.monthsShort(),
    months: localeData.months(),
    hebMonths: getHebMonthNames(events, options.locale || 's'),
    hebMonthAbbr: locale === 'en' ? hebMonthAbbr : undefined,
  };
  const gy = events[0].greg().getFullYear();
  if (gy >= 3762 && q.yt === 'G') {
    ctx.state.futureYears = gy - today.year();
    ctx.state.sameUrlHebYear = '/hebcal?' + urlArgs(q, {yt: 'H'});
  } else if (gy <= 0 && q.yt === 'H') {
    ctx.state.hebrewYear = options.year;
    ctx.state.sameUrlGregYear = '/hebcal?' + urlArgs(q, {yt: 'G'});
  }
  const cconfig = locationToPlainObj(location);
  const defaultYear = today.month() === 11 ? today.year() + 1 : today.year();
  const defaultYearHeb = getDefaultHebrewYear(new HDate(today.toDate()));
  const opts = {...options};
  delete opts.location;
  const mm = q.mm || '0';
  opts.hebrewMonths = (mm === '1' || mm === '2');
  opts.gematriyaNumerals = (mm === '2');
  return ctx.render('hebcal-results', {
    items,
    memos,
    cconfig: {geo: q.geo || 'none', ...cconfig},
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
    dailyLearningOpts,
    queryToName,
    queryLongDescr,
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
 * @param {import('@hebcal/core').CalOptions} options
 * @param {Event[]} events
 * @return {string}
 */
function pageTitle(options, events) {
  let shortTitle = '';
  const startDt = events[0].greg();
  if (options.month) {
    shortTitle += dayjs(startDt).format('MMMM') + ' ';
  }
  if (typeof options.year === 'number') {
    return shortTitle + yearTitle(options.year);
  }
  const gy1 = startDt.getFullYear();
  const gy2 = events.at(-1).greg().getFullYear();
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
  const gy = events[idx].greg().getFullYear();
  const q2 = {...q};
  delete q2.start;
  delete q2.end;
  return {
    title: yearTitle(gy + numYears),
    href: '/hebcal?' + urlArgs(q2, {yt: 'G', year: gy + numYears}),
  };
}

function isFresh(ctx) {
  if (!ctx.response.etag) {
    ctx.response.etag = makeETag(ctx, ctx.state.options, ctx.state.q);
  }
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
  ctx.body = events.map((ev) => {
    const item = eventToFullCalendar(ev, tzid, options);
    const emoji = ev.getEmoji();
    if (emoji) {
      item.emoji = emoji;
    }
    return item;
  });
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
  let obj = myEventsToClassicApi(events, options, !leyningOff);
  const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
  if (cb) {
    obj = cb + '(' + JSON.stringify(obj) + ')\n';
  }
  const orig = ctx.request.query;
  const yearNow = typeof orig.year === 'undefined' || orig.year === 'now' || orig.month === 'now';
  const startEnd = typeof options.start === 'object' && typeof options.end === 'object';
  const cacheCtrlStr = (startEnd || !yearNow) ? CACHE_CONTROL_7DAYS :
    cacheControl(0.125);
  ctx.set('Cache-Control', cacheCtrlStr);
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
      const d = dayjs(ev.greg());
      const fmtDt = d.format('YYYYMMDD');
      const desc = ev.render(options.locale);
      const url = ev.url() || '';
      return `DefineEvent(${fmtDt},"${desc}","${url}","",0,0);`;
    });
    return `/*! ${isoDate} */\n` + strs.join('\n');
  } else {
    const strs = events.map((ev) => {
      const d = dayjs(ev.greg());
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
