import {HebrewCalendar, Locale, HDate, flags, months} from '@hebcal/core';
import {makeHebcalOptions} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';

// eslint-disable-next-line require-jsdoc
export async function fridgeShabbat(ctx) {
  const p = makeProperties(ctx);
  return ctx.render('fridge', p);
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  const query = Object.assign({c: 'on', maj: 'on', s: 'on'}, ctx.request.query);
  let options;
  try {
    options = makeHebcalOptions(ctx.db, query);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const location = options.location;
  if (!location) {
    ctx.throw(400, 'Location required: geonameid, zip, city');
  }
  const hyear = +query.year || new HDate().getFullYear();
  options.start = new HDate(1, months.TISHREI, hyear).abs() - 1;
  options.end = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  const events = HebrewCalendar.calendar(options).filter((ev) => {
    const desc = ev.getDesc();
    return desc != 'Havdalah' && !desc.startsWith('Chanukah');
  });
  const items = makeContents(events, options);
  const itemsHtml = formatItemsAsTable(items, options);
  let url = '/shabbat/fridge.cgi?' + (query.zip ? `zip=${query.zip}` : `geonameid=${location.getGeoId()}`);
  for (const opt of ['a', 'i', 'm', 'M', 'lg']) {
    if (query[opt]) {
      url += `&amp;${opt}=${query[opt]}`;
    }
  }
  return {
    location,
    locale: Locale.getLocaleName(),
    hyear,
    gregYear1: events[0].getDate().greg().getFullYear(),
    gregYear2: events[events.length - 1].getDate().greg().getFullYear(),
    itemsHtml,
    url,
    candleLightingStr: Locale.gettext('Candle lighting'),
  };
}

/**
 * @param {Event[]} events
 * @param {HebrewCalendar.Options} options
 * @return {any[]}
 */
function makeContents(events, options) {
  const objs = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.getDesc() != 'Candle lighting') {
      continue;
    }
    const hd = ev.getDate();
    const attrs = ev.getAttrs();
    const d = dayjs(hd.greg());
    const item = {
      date: d,
      time: HebrewCalendar.reformatTimeStr(attrs.eventTimeStr, '', options),
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
    if (attrs.linkedEvent && attrs.linkedEvent.getDesc().startsWith('Chanukah')) {
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
 * @return {string}
 */
function formatItemsAsTable(items) {
  const half = Math.ceil(items.length / 2);
  let html = '';
  for (let i = 0; i < half; i++) {
    html += '<tr>' + row(items[i], false) + '\n<td></td>\n';
    html += row(items[i + half], true) + '</tr>\n';
  }
  return html;
}

/**
 * @param {any} item
 * @param {boolean} right
 * @return {string}
 */
function row(item, right) {
  if (!item) {
    return '<td></td><td></td><td></td><td></td>';
  }
  const cl = [];
  if (item.yomtov) {
    cl.push('yomtov');
  }
  const narrow = [];
  const lang = Locale.getLocaleName();
  const subj = item.reason;
  if (lang == 'he') {
    narrow.push('text-right');
  } else if (subj.length > 14) {
    narrow.push('narrow');
  }
  const monthClass = cl.slice();
  const timeClass = cl.slice();
  timeClass.push('text-right');
  if (right) {
    monthClass.push('leftpad');
  }
  return td(monthClass, item.date.format('MMM')) +
    td(cl.concat(['text-right']), item.date.format('D')) +
    td(cl.concat(narrow), subj) +
    td(timeClass, item.time);
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
