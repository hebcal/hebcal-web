import {HDate, HebrewCalendar, Sedra, ParshaEvent, Locale} from '@hebcal/core';
import dayjs from 'dayjs';
import {empty, makeGregDate, setDefautLangTz, httpRedirect, getBeforeAfterSunsetForLocation} from './common';
import gematriya from 'gematriya';

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

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function hebrewDateConverter(ctx) {
  if (ctx.method === 'GET' && ctx.request.querystring.length === 0) {
    setDefautLangTz(ctx);
    const location = ctx.state.location;
    if (location) {
      const {gy, gd, gm, afterSunset} = getBeforeAfterSunsetForLocation(new Date(), location);
      const gs = afterSunset ? '&gs=on' : '';
      httpRedirect(ctx, `/converter?gd=${gd}&gm=${gm}&gy=${gy}${gs}&g2h=1`, 302);
      return;
    }
  }
  Locale.useLocale('en');
  const p = makeProperties(ctx);
  if (p.message) {
    ctx.status = 400;
  }
  const q = ctx.request.query;
  if (q.cfg === 'json') {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.type = 'json';
    if (p.message) {
      ctx.body = {error: p.message};
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
        result.events = p.events.map((ev) => ev.render());
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
  } else {
    if (!p.noCache && ctx.method === 'GET' && ctx.request.querystring.length !== 0) {
      ctx.lastModified = ctx.launchDate;
      ctx.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    }
    return ctx.render('converter', p);
  }
}

const sedraCache = new Map();

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    props = Object.assign(g2h(new Date(), false, true), {message: err.message});
  }
  const dt = props.dt;
  const d = dayjs(dt);
  const dateStr = d.format('ddd, D MMMM ') + String(dt.getFullYear()).padStart(4, '0');
  const afterSunset = props.gs ? ' (after sunset)' : '';
  const hdate = props.hdate;
  const hdateStr = hdate.render();
  const saturday = hdate.onOrAfter(6);
  const hy = saturday.getFullYear();
  let events = [];
  if (hy >= 3762) {
    const sedra = sedraCache.get(hy) || new Sedra(hy, false);
    let pe = [];
    if (sedra.isParsha(saturday)) {
      pe = new ParshaEvent(saturday, sedra.get(saturday));
    }
    sedraCache.set(hy, sedra);
    const holidays = HebrewCalendar.getHolidaysOnDate(hdate, false) || [];
    events = holidays.concat(pe);
  }
  return {
    message: props.message,
    noCache: Boolean(props.noCache),
    events,
    title: `Hebrew Date Converter - ${hdateStr} | Hebcal Jewish Calendar`,
    first: (props.type === 'g2h') ? dateStr + afterSunset : hdateStr,
    second: (props.type === 'g2h') ? hdateStr : dateStr + afterSunset,
    hebrew: gematriyaDate(hdate),
    gs: props.gs,
    gy: dt.getFullYear(),
    gm: dt.getMonth() + 1,
    gd: dt.getDate(),
    hy: hdate.getFullYear(),
    hm: hdate.getMonth(),
    hmStr: hdate.getMonthName(),
    hd: hdate.getDate(),
    hleap: hdate.isLeapYear(),
  };
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function parseConverterQuery(ctx) {
  const query = ctx.request.query;
  if (isset(query.h2g) && isset(query.hy) && isset(query.hm) && isset(query.hd)) {
    const hy = parseInt(query.hy, 10);
    const hd = parseInt(query.hd, 10);
    if (isNaN(hd)) {
      throw new Error('Hebrew day must be numeric');
    } else if (isNaN(hy)) {
      throw new Error('Hebrew year must be numeric');
    } else if (hy < 3761) {
      throw new RangeError('Hebrew year must be in the common era (3761 and above)');
    } else if (hy > 32000) {
      throw new RangeError('Hebrew year is too large');
    }
    const hm = HDate.monthFromName(query.hm);
    const maxDay = HDate.daysInMonth(hm, hy);
    if (hd < 1 || hd > maxDay) {
      const monthName = HDate.getMonthName(hm, hy);
      throw new RangeError(`Hebrew day out of valid range 1-${maxDay} for ${monthName} ${hy}`);
    }
    const hdate = new HDate(hd, hm, hy);
    if (hdate.abs() < 1) {
      throw new RangeError('Hebrew date must be in the common era');
    }
    const dt = hdate.greg();
    return {type: 'h2g', dt, hdate, gs: false};
  } else {
    const gs = query.gs === 'on' || query.gs === '1';
    if (typeof query.gx === 'string' && query.gx.length === 10) {
      return g2h(new Date(query.gx), gs, false);
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
