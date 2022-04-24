import {HebrewCalendar, Locale, HDate, flags, months} from '@hebcal/core';
import {makeHebcalOptions, makeHebrewCalendar, localeMap, empty, cacheControl} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';

const CACHE_CONTROL_3DAYS = cacheControl(3);

// eslint-disable-next-line require-jsdoc
export async function fridgeShabbat(ctx) {
  const p = makeProperties(ctx);
  ctx.lastModified = ctx.launchDate;
  if (!empty(ctx.request.query.year)) {
    ctx.set('Cache-Control', CACHE_CONTROL_3DAYS);
  }
  return ctx.render('fridge', p);
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  const query = Object.assign({}, ctx.request.query);
  for (const k of ['c', 's', 'maj', 'min', 'nx', 'mod', 'mf', 'ss']) {
    query[k] = 'on';
  }
  const options = makeHebcalOptions(ctx.db, query);
  const location = options.location;
  if (!location) {
    ctx.throw(400, 'Location required: geonameid, zip, city');
  }
  const hyear = parseInt(query.year, 10) || new HDate().getFullYear();
  if (hyear < 3761) {
    ctx.throw(400, 'Hebrew year must be in the common era (3761 and above)');
  }
  options.start = new HDate(1, months.TISHREI, hyear).abs() - 1;
  options.end = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  const events = makeHebrewCalendar(ctx, options).filter((ev) => {
    return !ev.getDesc().startsWith('Chanukah');
  });
  const items = makeContents(events, options);
  const itemsRows = formatItemsAsTable(items, options);
  let url = '/shabbat/fridge.cgi?' + (query.zip ? `zip=${query.zip}` : `geonameid=${location.getGeoId()}`);
  for (const opt of ['a', 'i', 'b', 'm', 'M', 'lg']) {
    if (query[opt]) {
      url += `&amp;${opt}=${query[opt]}`;
    }
  }
  const locale = Locale.getLocaleName();
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
  };
}

/**
 * @param {Event[]} events
 * @param {HebrewCalendar.Options} options
 * @return {any[]}
 */
function makeContents(events, options) {
  const locale0 = Locale.getLocaleName();
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
    if (i == events.length - 1) {
      item.reason = Locale.gettext('Rosh Hashana');
      item.yomtov = true;
      objs.push(item);
      return objs;
    }
    if (d.day() == 5) {
      const parshaEv = events.slice(i + 1).find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
      if (parshaEv && parshaEv.getDate().isSameDate(hd.next())) {
        const parsha = parshaEv.render();
        const space = parsha.indexOf(' ');
        item.reason = parsha.substring(space + 1);
        objs.push(item);
        continue;
      }
    }
    if (ev.linkedEvent && ev.linkedEvent.getDesc().startsWith('Chanukah')) {
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
function formatItemsAsTable(items) {
  const half = Math.ceil(items.length / 2);
  const rows = [];
  for (let i = 0; i < half; i++) {
    rows.push([row(items[i], false), row(items[i + half], true)]);
  }
  return rows;
}

const BLANK_ROW = '<td></td><td></td><td></td><td></td><td></td>';

/**
 * @param {any} item
 * @param {boolean} right
 * @return {string}
 */
function row(item, right) {
  if (!item) {
    return BLANK_ROW;
  }
  const cl = [];
  if (item.yomtov) {
    cl.push('yomtov');
  }
  const narrow = [];
  const locale = Locale.getLocaleName();
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
