import {HDate, HebrewCalendar, Sedra, ParshaEvent, Locale, months, OmerEvent} from '@hebcal/core';
import dayjs from 'dayjs';
import {empty, makeGregDate, setDefautLangTz, httpRedirect, lgToLocale,
  localeMap, getBeforeAfterSunsetForLocation, getStartAndEnd, makeHebDate} from './common';
import gematriya from 'gematriya';
import createError from 'http-errors';
import {pad4} from '@hebcal/rest-api';
import './dayjs-locales';

const CACHE_CONTROL_ONE_YEAR = 'public, max-age=31536000, s-maxage=31536000';
const heInStr = 'בְּ';
const monthInPrefix = {
  'Tamuz': 'בְּתַמּוּז',
  'Elul': 'בֶּאֱלוּל',
  'Tishrei': 'בְּתִשְׁרֵי',
  'Kislev': 'בְּכִסְלֵו',
  'Sh\'vat': 'בִּשְׁבָט',
  'Adar': 'בַּאֲדָר',
  'Adar I': 'בַּאֲדָר א׳',
  'Adar II': 'בַּאֲדָר ב׳',
};

/**
 * @param {HDate} hdate
 * @return {string}
 */
export function gematriyaDate(hdate) {
  const d = hdate.getDate();
  const monthName = hdate.getMonthName();
  const m = monthInPrefix[monthName] || heInStr + Locale.gettext(monthName, 'he');
  const y = hdate.getFullYear();
  return gematriya(d) + ' ' + m + ' ' + gematriya(y, {limit: 3});
}

/**
 * @param {string} val
 * @return {boolean}
 */
function isset(val) {
  return typeof val === 'string';
}

const RANGE_REQUIRES_CFG_JSON = 'Date range conversion using \'start\' and \'end\' requires cfg=json';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebrewDateConverter(ctx) {
  if (ctx.method === 'GET' && ctx.request.querystring.length === 0) {
    setDefautLangTz(ctx);
    const location = ctx.state.location || ctx.db.lookupLegacyCity('New York');
    const {gy, gd, gm, afterSunset} = getBeforeAfterSunsetForLocation(new Date(), location);
    const gs = afterSunset ? '&gs=on' : '';
    const il = location.getIsrael() ? '&i=on' : '';
    ctx.set('Cache-Control', 'private, max-age=0');
    const url = `/converter?gd=${gd}&gm=${gm}&gy=${gy}${gs}${il}&g2h=1`;
    httpRedirect(ctx, url, 302);
    return;
  }
  const p = makeProperties(ctx);
  const q = ctx.request.query;
  if (p.message) {
    ctx.status = 400;
  } else if (typeof p.hdates === 'object' && q.cfg !== 'json') {
    ctx.status = 400;
    p.message = RANGE_REQUIRES_CFG_JSON;
  }
  if (q.cfg === 'json') {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'json';
    if (p.message) {
      ctx.body = {error: p.message};
    } else if (typeof p.hdates === 'object') {
      ctx.lastModified = ctx.launchDate;
      ctx.set('Cache-Control', CACHE_CONTROL_ONE_YEAR);
      let result = p;
      const cb = q.callback;
      if (typeof cb === 'string' && cb.length) {
        result = cb + '(' + JSON.stringify(result) + ')\n';
      }
      ctx.body = result;
    } else {
      if (!p.noCache) {
        ctx.lastModified = ctx.launchDate;
        ctx.set('Cache-Control', CACHE_CONTROL_ONE_YEAR);
      }
      let result = {
        gy: p.gy,
        gm: p.gm,
        gd: p.gd,
        afterSunset: Boolean(p.gs),
        hy: p.hy,
        hm: p.hmStr,
        hd: p.hd,
        hebrew: p.hebrew,
      };
      if (p.events.length) {
        result.events = p.events.map(renameChanukah(p.locale));
        if (typeof q.i !== 'undefined') {
          result.il = p.il;
        }
      }
      const cb = q.callback;
      if (typeof cb === 'string' && cb.length) {
        result = cb + '(' + JSON.stringify(result) + ')\n';
      }
      ctx.body = result;
    }
  } else if (q.cfg === 'xml') {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'text/xml';
    if (p.message) {
      ctx.body = `<?xml version="1.0" ?>\n<error message="${p.message}" />\n`;
    } else {
      p.writeResp = false;
      if (!p.noCache) {
        ctx.lastModified = ctx.launchDate;
        ctx.set('Cache-Control', CACHE_CONTROL_ONE_YEAR);
      }
      ctx.body = await ctx.render('converter-xml', p);
    }
  } else if (typeof p.hdates === 'object') {
    throw createError(400, RANGE_REQUIRES_CFG_JSON);
  } else {
    if (!p.noCache && ctx.method === 'GET' && ctx.request.querystring.length !== 0) {
      ctx.lastModified = ctx.launchDate;
      ctx.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    }
    return ctx.render('converter', p);
  }
}

/**
 * @type {Map<string,Sedra>}
 */
const sedraCache = new Map();

// eslint-disable-next-line require-jsdoc
function renameChanukah(locale) {
  return (ev) => {
    if (ev.chanukahDay) {
      return Locale.gettext('Chanukah', locale) + ' Day ' + ev.chanukahDay;
    }
    return ev.render(locale);
  };
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  const query = ctx.request.query;
  const lg = lgToLocale[query.lg || 's'] || query.lg;
  const locale = ctx.state.locale = localeMap[lg] || 'en';
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    props = Object.assign(g2h(new Date(), false, true), {message: err.message});
  }
  if (typeof props.hdates === 'object') {
    return props;
  }
  const dt = props.dt;
  const d = dayjs(dt).locale(locale);
  const gy = dt.getFullYear();
  const gyStr = gy > 0 ? pad4(gy) : pad4(-gy) + ' B.C.E.';
  const dateStr = d.format('ddd, D MMMM ') + gyStr;
  const afterSunset = props.gs ? ' (after sunset)' : '';
  const hdate = props.hdate;
  const hdateStr = hdate.render(locale);
  const il = Boolean(query.i === 'on');
  const events = getEvents(hdate, il);
  return {
    message: props.message,
    noCache: Boolean(props.noCache),
    events: events.filter((ev) => ev.getDesc() != 'Chanukah: 1 Candle'),
    title: `Hebrew Date Converter - ${hdateStr} | Hebcal Jewish Calendar`,
    first: (props.type === 'g2h') ? dateStr + afterSunset : hdateStr,
    second: (props.type === 'g2h') ? hdateStr : dateStr + afterSunset,
    hebrew: gematriyaDate(hdate),
    gs: props.gs,
    gy,
    gm: dt.getMonth() + 1,
    gd: dt.getDate(),
    hy: hdate.getFullYear(),
    hm: hdate.getMonth(),
    hmStr: hdate.getMonthName(),
    hd: hdate.getDate(),
    hleap: hdate.isLeapYear(),
    il,
    locale,
  };
}

/**
 * @param {HDate} hdate
 * @param {boolean} il
 * @return {Event[]}
 */
function getEvents(hdate, il) {
  let events = HebrewCalendar.getHolidaysOnDate(hdate, il) || [];
  const saturday = hdate.onOrAfter(6);
  const hy = saturday.getFullYear();
  if (hy >= 3762) {
    const cacheKey = `${hy}-${il ? 1 : 0}`;
    const sedra = sedraCache.get(cacheKey) || new Sedra(hy, il);
    if (sedra.isParsha(saturday)) {
      const pe = new ParshaEvent(saturday, sedra.get(saturday), il);
      events = events.concat(pe);
    }
    sedraCache.set(cacheKey, sedra);
  }
  events = events.concat(makeOmer(hdate));
  return events;
}

/**
 * @private
 * @param {HDate} hdate
 * @return {Event[]}
 */
function makeOmer(hdate) {
  const beginOmer = HDate.hebrew2abs(hdate.getFullYear(), months.NISAN, 16);
  const abs = hdate.abs();
  if (abs >= beginOmer && abs < (beginOmer + 49)) {
    const omer = abs - beginOmer + 1;
    return [new OmerEvent(hdate, omer)];
  }
  return [];
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function parseConverterQuery(ctx) {
  const query = ctx.request.query;
  if (!empty(query.start) && !empty(query.end)) {
    const {isRange, startD, endD} = getStartAndEnd(query, 'UTC');
    if (isRange) {
      const il = Boolean(query.i === 'on');
      const locale = ctx.state.locale;
      const hdates = {};
      for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
        const isoDate = d.format('YYYY-MM-DD');
        const hdate = new HDate(d.toDate());
        const result = {
          hy: hdate.getFullYear(),
          hm: hdate.getMonthName(),
          hd: hdate.getDate(),
          hebrew: gematriyaDate(hdate),
        };
        const events = getEvents(hdate, il);
        if (events.length) {
          result.events = events.map(renameChanukah(locale));
          if (typeof query.i !== 'undefined') {
            result.il = il;
          }
        }
        hdates[isoDate] = result;
      }
      return {
        start: startD.format('YYYY-MM-DD'),
        end: endD.format('YYYY-MM-DD'),
        locale,
        hdates,
      };
    } else {
      return g2h(startD.toDate(), false, false);
    }
  }
  if (isset(query.h2g) && isset(query.hy) && isset(query.hm) && isset(query.hd)) {
    const hdate = makeHebDate(query.hy, query.hm, query.hd);
    const dt = hdate.greg();
    return {type: 'h2g', dt, hdate, gs: false};
  } else {
    const gs = query.gs === 'on' || query.gs === '1';
    if (typeof query.date === 'string' && query.date.length === 10) {
      return g2h(new Date(query.date), gs, false);
    } else if (isset(query.gy) && isset(query.gm) && isset(query.gd)) {
      if (empty(query.gy) && empty(query.gm) && empty(query.gd)) {
        return g2h(new Date(), gs, true);
      }
      const dt = makeGregDate(query.gy, query.gm, query.gd);
      return g2h(dt, gs, false);
    } else {
      const dt = (!empty(query.t) && query.t.charCodeAt(0) >= 48 && query.t.charCodeAt(0) <= 57) ?
        new Date(parseInt(query.t, 10) * 1000) : new Date();
      return g2h(dt, gs, true);
    }
  }
}

// eslint-disable-next-line require-jsdoc
function g2h(dt, gs, noCache) {
  let hdate = new HDate(dt);
  if (gs) {
    hdate = hdate.next();
  }
  return {type: 'g2h', dt, hdate, gs, noCache};
}
