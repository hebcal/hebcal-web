/* eslint-disable require-jsdoc */
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie,
  empty, urlArgs, getNumYears,
  makeIcalOpts,
  CACHE_CONTROL_7DAYS,
  getDefaultHebrewYear, makeHebrewCalendar,
  localeMap, eTagFromOptions, langNames} from './common';
import {makeDownloadProps} from './makeDownloadProps';
import {HebrewCalendar, greg, flags, HDate} from '@hebcal/core';
import {eventsToClassicApi, eventToFullCalendar, pad2,
  eventToClassicApiObject,
  locationToPlainObj,
  shouldRenderBrief,
  getCalendarTitle,
  eventsToCsv,
  eventsToRss2,
  getEventCategories, getHolidayDescription, pad4, toISOString} from '@hebcal/rest-api';
import {eventsToIcalendar} from '@hebcal/icalendar';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import './dayjs-locales';
import fs from 'fs';
import readline from 'readline';

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
  if (options.location) {
    q['city-typeahead'] = options.location.getName();
  }
  if (empty(q.year) && q.cfg !== 'fc') {
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
  ctx.response.type = 'text/x-csv; charset=utf-8';
  return csv;
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
  const tzids = ctx.state.q.geo === 'pos' ? await getTzids() : [];
  return ctx.render('hebcal-form', {
    message,
    tzids,
    langNames,
    defaultYear,
    defaultYearHeb,
  });
}

async function getTzids() {
  return new Promise((resolve, reject) => {
    const infile = '/usr/share/zoneinfo/zone.tab';
    const result = [];
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(infile),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (line[0] !== '#') {
          result.push(line.split('\t')[2]);
        }
      });
      rl.on('close', () => resolve(result.sort()));
      rl.on('error', (err) => reject(err));
    } catch (err) {
      return reject(err);
    }
  });
}

function renderHtml(ctx) {
  const options = ctx.state.options;
  const locationName = ctx.state.location ? ctx.state.location.getName() : options.il ? 'Israel' : 'Diaspora';
  let shortTitle = 'Jewish Calendar ';
  if (options.month) {
    shortTitle += greg.monthNames[options.month] + ' ';
  }
  const titleYear = options.year >= 0 ? options.year : -options.year + ' B.C.E.';
  shortTitle += titleYear;
  const events = makeHebrewCalendar(ctx, options);
  if (events.length === 0) {
    ctx.status = 400;
    return renderForm(ctx, {message: 'Please select at least one event option'});
  }
  const locale = localeMap[options.locale] || 'en';
  const months = makeMonthlyDates(events, locale);
  if (months.length > 14) {
    throw new Error(`Something is wrong; months.length=${months.length}`);
  }
  const items = events.map((ev) => {
    const item = eventToClassicApiObject(ev, options, false);
    if (item.link) {
      item.link = ev.url();
    }
    delete item.memo;
    return item;
  });
  // Reduce size of HTML
  const hebcalPrefix = 'https://www.hebcal.com/';
  items.forEach((i) => {
    if (typeof i.link === 'string' && i.link.startsWith(hebcalPrefix)) {
      i.link = i.link.substring(hebcalPrefix.length - 1);
      const utm = i.link.indexOf('utm_source=');
      if (utm !== -1) {
        i.link = i.link.substring(0, utm - 1);
      }
    }
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
  url.prev ='/hebcal?' + urlArgs(q, {year: options.year - 1});
  url.next = '/hebcal?' + urlArgs(q, {year: options.year + 1});
  const optsTmp = Object.assign({}, options);
  optsTmp.subscribe = '1';
  url.title = getCalendarTitle(events, optsTmp);
  if (options.candlelighting) {
    const location = ctx.state.location;
    let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
    if (typeof options.havdalahMins === 'number' && !isNaN(options.havdalahMins)) {
      geoUrlArgs += '&m=' + options.havdalahMins;
    }
    geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
    const hyear = options.isHebrewYear ? options.year : events[0].getDate().getFullYear();
    url.fridge = `/shabbat/fridge.cgi?${geoUrlArgs}&year=${hyear}`;
  }
  const localeConfig = {
    weekdaysShort: localeData.weekdaysShort(),
    monthsShort: localeData.monthsShort(),
    months: localeData.months(),
  };
  const gy = months[0].year();
  if (gy >= 3762 && q.yt === 'G') {
    ctx.state.futureYears = gy - today.year();
    ctx.state.sameUrlHebYear = '/hebcal?' + urlArgs(q, {yt: 'H'});
  } else if (gy < 0 && q.yt === 'H') {
    ctx.state.hebrewYear = options.year;
    ctx.state.sameUrlGregYear = '/hebcal?' + urlArgs(q, {yt: 'G'});
  }
  const cconfig = locationToPlainObj(ctx.state.location);
  return ctx.render('hebcal-results', {
    items: items,
    cconfig: JSON.stringify(Object.assign({geo: q.geo || 'none'}, cconfig)),
    today,
    dates: months,
    gy,
    tableBodies: makeTableBodies(events, months, options, locale),
    lang: locale === 'he' ? 'en' : locale, // twbs5 doesn't handle <html lang="he"> well enough yet
    locale,
    localeConfig,
    prevTitle: options.year - 1,
    nextTitle: options.year + 1,
    shortTitle,
    locationName,
    currentYear: options.isHebrewYear ? new HDate().getFullYear() : today.year(),
    downloadAltTitle: `${options.year} only`,
    numYears: getNumYears(options),
  });
}

function makeTableBodies(events, months, options, locale) {
  const eventMap = new Map();
  for (const ev of events) {
    const key = toISOString(ev.date.greg());
    if (eventMap.has(key)) {
      eventMap.get(key).push(ev);
    } else {
      eventMap.set(key, [ev]);
    }
  }
  const tableBodies = {};
  for (const d of months) {
    let html = '<tr>';
    const dow = d.day();
    for (let i = 0; i < dow; i++) {
      html += '<td>&nbsp;</td>';
    }
    let n = dow;
    const daysInMonth = greg.daysInMonth(d.month() + 1, d.year());
    const yearStr = pad4(d.year());
    const yearMonth = yearStr + '-' + pad2(d.month() + 1);
    for (let i = 1; i <= daysInMonth; i++) {
      html += `<td><p><b>${i}</b></p>`;
      const evs = eventMap.get(yearMonth + '-' + pad2(i)) || [];
      for (const ev of evs) {
        html += renderEventHtml(ev, options, locale);
      }
      html += '</td>\n';
      n++;
      if (n % 7 === 0) {
        html += '</tr>\n<tr>';
      }
    }
    while (n % 7 !== 0) {
      html += '<td>&nbsp;</td>';
      n++;
    }
    html += '</tr>\n';
    if (html.endsWith('<tr></tr>\n')) {
      html = html.substring(0, html.length - 10);
    }
    const prev = d.subtract(1, 'month');
    const next = d.add(1, 'month');
    tableBodies[yearMonth] = {
      year: yearStr,
      d,
      html,
      prevMonth: pad4(prev.year()) + '-' + pad2(prev.month() + 1),
      nextMonth: pad4(next.year()) + '-' + pad2(next.month() + 1),
    };
  }
  return tableBodies;
}

/**
 * @param {Event} ev
 * @param {HebrewCalendar.Options} options
 * @param {string} locale
 * @return {string}
 */
function renderEventHtml(ev, options, locale) {
  const categories = getEventCategories(ev);
  const mask = ev.getFlags();
  if (categories[0] == 'holiday' && mask & flags.CHAG) {
    categories.push('yomtov');
  }
  const time = ev.eventTimeStr && HebrewCalendar.reformatTimeStr(ev.eventTimeStr, 'pm', options);
  let title = shouldRenderBrief(ev) ? ev.renderBrief(options.locale) : ev.render(options.locale);
  if (time) {
    categories.push('timed');
    const timeHtml = mask & flags.CHANUKAH_CANDLES ?
     '<small>' + time + '</small>' :
     '<small class="text-muted">' + time + '</small>';
    title = timeHtml + ' ' + subjectSpan(ev, locale, title);
  } else {
    title = subjectSpan(ev, locale, title);
  }
  const classes = categories.join(' ');
  const memo0 = getHolidayDescription(ev, true);
  const memo = memo0 ? ` title="${memo0}"` : '';
  let url = ev.url();
  if (typeof url === 'string' && url.startsWith('https://www.hebcal.com/')) {
    const suffix = options.il && url.indexOf('?') === -1 ? '?i=on' : '';
    url = url.substring(22) + suffix;
  }
  const ahref = url ? `<a href="${url}">` : '';
  const aclose = url ? '</a>' : '';
  const hebrew = options.appendHebrewToSubject ?
    '<br>' + subjectSpan(null, 'he', ev.renderBrief('he-x-NoNikud')) : '';
  // eslint-disable-next-line max-len
  return `<div class="fc-event ${classes}">${ahref}<span class="fc-title"${memo}>${title}${hebrew}</span>${aclose}</div>\n`;
}

/**
 * @param {Event} ev
 * @param {string} locale
 * @param {string} str
 * @return {string}
 */
function subjectSpan(ev, locale, str) {
  str = str.replace(/(\(\d+.+\))$/, '<small>$&</small>');
  if (locale === 'he') {
    return '<span lang="he" dir="rtl">' + str + '</span>';
  }
  /*
  const emoji0 = ev && ev.getEmoji();
  const emoji = emoji0 ? ' ' + emoji0 : '';
  return str + emoji;
  */
  return str;
}

/**
 * Returns an array of dayjs objects for every month (including blanks) in the range
 * @param {Event[]} events
 * @param {string} locale
 * @return {dayjs.Dayjs[]}
 */
function makeMonthlyDates(events, locale) {
  const startDate = dayjs(events[0].getDate().greg());
  const endDate = dayjs(events[events.length - 1].getDate().greg());
  const start = startDate.date(1);
  if (events.length === 1) {
    return [start];
  }
  const result = [];
  for (let d = start; d.isBefore(endDate); d = d.add(1, 'month')) {
    result.push(d.locale(locale));
  }
  return result;
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
  let obj = eventsToClassicApi(events, options, !leyningOff);
  const cb = q.callback;
  if (typeof cb === 'string' && cb.length) {
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
        obj.u = url.startsWith('https://www.hebcal.com/') ? url.substring(22) : url;
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
