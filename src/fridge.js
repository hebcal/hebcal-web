import {HebrewCalendar, Locale, HDate, flags, months, greg} from '@hebcal/core';
import {empty} from './empty.js';
import {makeHebcalOptions, makeHebrewCalendar, localeMap,
  cleanQuery,
  makeGeoUrlArgs,
  langNames,
  setDefautLangTz,
  cacheControl, queryDefaultCandleMins} from './common.js';
import {getDefaultHebrewYear} from './dateUtil.js';
import '@hebcal/locales';
import dayjs from 'dayjs';
import createError from 'http-errors';

const CACHE_CONTROL_3DAYS = cacheControl(3);

export async function fridgeShabbat(ctx) {
  if (ctx.request.path.startsWith('/fridge')) {
    return fridgeIndex(ctx);
  }
  const p = makeProperties(ctx);
  ctx.lastModified = ctx.launchDate;
  if (!empty(ctx.request.query.year)) {
    ctx.set('Cache-Control', CACHE_CONTROL_3DAYS);
  }
  return ctx.render('fridge', p);
}

function fridgeIndex(ctx) {
  const q = setDefautLangTz(ctx);
  const location = ctx.state.location;
  q['city-typeahead'] = location && location.geo !== 'pos' ? location.getName() : '';
  return ctx.render('fridge-index', {
    q,
    langNames,
  });
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  const query = {...ctx.request.query};
  for (const k of ['c', 's', 'maj', 'min', 'nx', 'mod', 'mf', 'ss']) {
    query[k] = 'on';
  }
  cleanQuery(query);
  if (empty(query.year)) {
    const today = new HDate();
    const hyear = getDefaultHebrewYear(today);
    query.year = '' + hyear;
    delete query.yt;
  }
  const options = makeHebcalOptions(ctx.db, query);
  const location = options.location;
  if (!location) {
    throw createError(400, 'Location required: geonameid, zip, city');
  }
  const startEnd = getStartAndEnd(query);
  options.start = startEnd[0];
  options.end = startEnd[1];
  const hyear = startEnd[2];
  const events = makeHebrewCalendar(ctx, options).filter((ev) => {
    return !ev.getDesc().startsWith('Chanukah');
  });
  const items = makeContents(events, options);
  const itemsRows = formatItemsAsTable(items, options);
  const url = '/shabbat/fridge.cgi?' + makeGeoUrlArgs(query, location, options);
  const locale = options.locale || 'en';
  const lang = localeMap[locale] || 'en';
  return {
    htmlDir: lang === 'he' ? 'rtl' : 'ltr',
    lang,
    location,
    locale,
    hyear,
    gregYear1: events[0].getDate().greg().getFullYear(),
    gregYear2: events[events.length - 1].getDate().greg().getFullYear(),
    itemsRows,
    url,
    candleLightingStr: Locale.gettext('Candle lighting'),
    q: query,
    options,
    queryDefaultCandleMins,
  };
}

/**
 * @param {any} query
 * @return {number[]}
 */
function getStartAndEnd(query) {
  if (query.yt === 'G') {
    const year = parseInt(query.year, 10) || new Date().getFullYear();
    if (year <= 1752) {
      throw createError(400, 'Gregorian year must be 1753 or later');
    }
    const start = greg.greg2abs(new Date(year, 0, 1));
    const end = greg.greg2abs(new Date(year, 11, 31));
    return [start, end];
  }
  const hyear = parseInt(query.year, 10) || new HDate().getFullYear();
  if (hyear < 3761) {
    throw createError(400, 'Hebrew year must be in the common era (3761 and above)');
  }
  const start = new HDate(1, months.TISHREI, hyear).abs() - 1;
  const end = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  return [start, end, hyear];
}

/**
 * @param {Event[]} events
 * @param {import('@hebcal/core').CalOptions} options
 * @return {any[]}
 */
function makeContents(events, options) {
  const locale0 = options.locale || 'en';
  const locale = localeMap[locale0] || 'en';
  const objs = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const desc = ev.getDesc();
    if (desc === 'Havdalah') {
      if (objs.length) {
        objs[objs.length - 1].havdalah =
          HebrewCalendar.reformatTimeStr(ev.eventTimeStr, '', options);
      }
      continue;
    }
    if (desc !== 'Candle lighting') {
      continue;
    }
    const hd = ev.getDate();
    const d = dayjs(hd.greg()).locale(locale);
    const item = {
      date: d,
      time: HebrewCalendar.reformatTimeStr(ev.eventTimeStr, '', options),
    };
    if (i === events.length - 1) {
      if (hd.getMonth() === months.ELUL) {
        item.reason = Locale.gettext('Rosh Hashana');
        item.yomtov = true;
        objs.push(item);
      } else {
        const parsha = ev.memo;
        const space = parsha.indexOf(' ');
        item.reason = parsha.substring(space + 1);
        objs.push(item);
      }
      continue;
    }
    if (d.day() == 5) {
      const parshaEv = events.slice(i + 1).find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
      if (parshaEv && parshaEv.getDate().isSameDate(hd.next())) {
        const parsha = parshaEv.render(locale0);
        const space = parsha.indexOf(' ');
        item.reason = parsha.substring(space + 1);
        objs.push(item);
        continue;
      }
    }
    if (ev.linkedEvent?.getDesc().startsWith('Chanukah')) {
      continue;
    }
    const nextEv = events[i + 1];
    item.reason = Locale.gettext(nextEv.basename());
    item.yomtov = Boolean(nextEv.getFlags() & flags.CHAG);
    objs.push(item);
  }
  return objs;
}

/**
 * @param {any[]} items
 * @return {any[]}
 */
function formatItemsAsTable(items, options) {
  const half = Math.ceil(items.length / 2);
  const rows = [];
  for (let i = 0; i < half; i++) {
    rows.push([
      row(items[i], false, options),
      row(items[i + half], true, options),
    ]);
  }
  return rows;
}

const BLANK_ROW = '<td></td><td></td><td></td><td></td><td></td>';

/**
 * @param {any} item
 * @param {boolean} right
 * @return {string}
 */
function row(item, right, options) {
  if (!item) {
    return BLANK_ROW;
  }
  const cl = [];
  if (item.yomtov) {
    cl.push('yomtov');
  }
  const narrow = [];
  const locale = options.locale || 'en';
  const lang = localeMap[locale] || 'en';
  const subj = item.reason;
  if (lang == 'he') {
    narrow.push('text-right');
  } else if (lang === 'ru' && subj.length > 10) {
    narrow.push('narrow');
  } else if (subj.length > 14) {
    narrow.push('narrow');
  }
  const monthClass = cl.slice();
  const timeClass = cl.slice();
  timeClass.push('text-right');
  if (right) {
    const dir = lang === 'he' ? 'right' : 'left';
    monthClass.push(`${dir}pad`);
  }
  const str = td(monthClass, item.date.format('MMM')) +
    td(cl.concat(['text-right']), item.date.format('D')) +
    td(cl.concat(narrow), subj) +
    td(timeClass, item.time) +
    td(timeClass.concat('havdalah'), item.havdalah || '');
  return str;
}

/**
 * @param {string[]} arr
 * @param {string} str
 * @return {string}
 */
function td(arr, str) {
  let s = arr.length ? ('<td class="' + arr.join(' ') + '">') : '<td>';
  s += str;
  s += '</td>';
  return s;
}
