import {HDate, HebrewCalendar, Event, ParshaEvent, Locale, months, OmerEvent} from '@hebcal/core';
import dayjs from 'dayjs';
import {empty, makeGregDate, setDefautLangTz, httpRedirect, lgToLocale,
  localeMap, getBeforeAfterSunsetForLocation, getStartAndEnd, makeHebDate,
  CACHE_CONTROL_7DAYS,
} from './common';
import createError from 'http-errors';
import {pad4} from '@hebcal/rest-api';
import './dayjs-locales';
import {gematriyaDate} from './gematriyaDate';

const CACHE_CONTROL_ONE_YEAR = 'public, max-age=31536000, s-maxage=31536000';
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
      ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
    }
    return ctx.render('converter', p);
  }
}

// eslint-disable-next-line require-jsdoc
function renameChanukah(locale) {
  return (ev) => {
    if (ev.chanukahDay) {
      const str = Locale.lookupTranslation(`Chanukah Day ${ev.chanukahDay}`, locale);
      if (str) {
        return str;
      }
      return Locale.gettext('Chanukah', locale) + ' ' +
        Locale.gettext('day', locale) + ' ' + ev.chanukahDay;
    }
    return ev.render(locale);
  };
}

const hmonthArg = {
  'Sh\'vat': 'Shvat',
  'Adar I': 'Adar1',
  'Adar II': 'Adar2',
};

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
  const hdateStr = hdate.render(lg);
  const il = Boolean(query.i === 'on');
  const events = getEvents(hdate, il);
  const gm = dt.getMonth() + 1;
  const gd = dt.getDate();
  const hy = hdate.getFullYear();
  const hmonthName = hdate.getMonthName();
  const hmStr = hmonthArg[hmonthName] || hmonthName;
  const greg2heb = props.type === 'g2h';
  const gsStr = props.gs ? '&gs=on' : '';
  const ilStr = il ? '&i=on' : '';
  const hd = hdate.getDate();
  const canonical = greg2heb ?
    `gd=${gd}&gm=${gm}&gy=${gy}${gsStr}${ilStr}&g2h=1` :
    `hd=${hd}&hm=${hmStr}&hy=${hy}${ilStr}&h2g=1`;
  return {
    message: props.message,
    noCache: Boolean(props.noCache),
    events: events.filter((ev) => ev.getDesc() != 'Chanukah: 1 Candle'),
    dateItems: makeDiasporaIsraelItems(ctx, hdate),
    hdateStr,
    canonical,
    first: greg2heb ? dateStr + afterSunset : hdateStr,
    second: greg2heb ? hdateStr : dateStr,
    hebrew: gematriyaDate(hdate),
    hebrewNoNikkud: Locale.hebrewStripNikkud(hdate.renderGematriya()),
    gs: props.gs,
    gy,
    gm,
    gd,
    hy,
    hm: hdate.getMonth(),
    hmStr: hmonthName,
    hd: hd,
    hleap: hdate.isLeapYear(),
    il,
    locale,
    todayHd: new HDate(),
  };
}

// eslint-disable-next-line require-jsdoc
function eventToItem(ctx, ev) {
  const locale = ctx.state.locale;
  const desc = renameChanukah(locale)(ev);
  const emoji = ev.chanukahDay ? '🕎' : ev.omer ? '' : ev.getEmoji() || '';
  const url = ev.url();
  return {desc, emoji, url};
}

/**
 * @param {any} ctx
 * @param {HDate} hdate
 * @return {any}
 */
function makeDiasporaIsraelItems(ctx, hdate) {
  const diaspora = getEvents(hdate, false)
      .filter((ev) => ev.getDesc() != 'Chanukah: 1 Candle');
  const israel = getEvents(hdate, true)
      .filter((ev) => ev.getDesc() != 'Chanukah: 1 Candle');
  const both = diaspora.filter((a) => israel.find((b) => a.getDesc() === b.getDesc()));
  const diasporaOnly = diaspora.filter((ev) => !both.includes(ev));
  const bothIL = israel.filter((a) => diaspora.find((b) => a.getDesc() === b.getDesc()));
  const israelOnly = israel.filter((ev) => !bothIL.includes(ev));
  return {
    both: both.map((ev) => eventToItem(ctx, ev)),
    diasporaOnly: diasporaOnly.map((ev) => eventToItem(ctx, ev)),
    israelOnly: israelOnly.map((ev) => eventToItem(ctx, ev)),
  };
}

/** @private */
class PesudoParshaEvent extends Event {
  /**
   * @param {Event} ev
   */
  constructor(ev) {
    super(ev.getDate(), 'Parashat ' + ev.basename(), ev.getFlags());
    this.ev = ev;
  }
  /** @return {string} */
  basename() {
    return this.ev.basename();
  }
  /** @return {string} */
  url() {
    return this.ev.url();
  }
  /**
   * @param {string} locale
   * @return {string}
   */
  render(locale) {
    return Locale.gettext('Parashat', locale) + ' ' + Locale.gettext(this.basename(), locale);
  }
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
    const sedra = HebrewCalendar.getSedra(hy, il);
    const parsha = sedra.lookup(saturday);
    if (!parsha.chag) {
      const pe = new ParshaEvent(saturday, parsha.parsha, il);
      events = events.concat(pe);
    } else if (saturday.abs() != hdate.abs()) {
      const satHolidays = HebrewCalendar.getHolidaysOnDate(saturday, il);
      for (const ev of satHolidays) {
        const pe = new PesudoParshaEvent(ev);
        events = events.concat(pe);
      }
    }
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
