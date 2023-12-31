import {HDate, HebrewCalendar, Event, ParshaEvent, Locale, months,
  OmerEvent, gematriya, greg} from '@hebcal/core';
import dayjs from 'dayjs';
import {empty, makeGregDate, setDefautLangTz, httpRedirect, lgToLocale,
  localeMap, getBeforeAfterSunsetForLocation, getStartAndEnd, makeHebDate,
  CACHE_CONTROL_7DAYS, cacheControl,
  isoDateStringToDate,
  getDefaultYear, urlArgs,
} from './common.js';
import {getLeyningOnDate} from '@hebcal/leyning';
import createError from 'http-errors';
import {pad4, pad2, makeAnchor} from '@hebcal/rest-api';
import './dayjs-locales.js';
import {gematriyaDate} from './gematriyaDate.js';

const CACHE_CONTROL_ONE_YEAR = cacheControl(365);
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
  }
  const query = ctx.request.query;
  ctx.state.lg = query.lg || 's';
  const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
  ctx.state.locale = localeMap[lg] || 'en';
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    if (query.strict === '1') {
      const status = err.status || 400;
      ctx.throw(status, err);
    }
    props = Object.assign(g2h(new Date(), false, true), {message: err.message});
  }
  if (ctx.method === 'GET' && props.noCache && !props.message) {
    const location = ctx.state.location || ctx.db.lookupLegacyCity('New York');
    const {gy, gd, gm, afterSunset} = getBeforeAfterSunsetForLocation(new Date(), location);
    const gs = afterSunset ? '&gs=on' : '';
    const il = location.getIsrael() ? '&i=on' : '';
    const json = query.cfg == 'json' ? '&cfg=json' : '';
    const lg = empty(query.lg) ? '' : `&lg=${query.lg}`;
    ctx.set('Cache-Control', 'private, max-age=3600');
    const url = `/converter?gd=${gd}&gm=${gm}&gy=${gy}${gs}${il}&g2h=1${json}${lg}`;
    httpRedirect(ctx, url, 302);
    return;
  }
  const p = makeProperties(ctx, props);
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
      const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
      if (cb) {
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
        heDateParts: {
          y: gematriya(p.hy),
          m: Locale.gettext(p.hmStr, 'he-x-NoNikud'),
          d: gematriya(p.hd),
        },
      };
      if (p.events.length) {
        result.events = p.events.map(renameChanukah(p.lg));
        if (typeof q.i !== 'undefined') {
          result.il = p.il;
        }
      }
      const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
      if (cb) {
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
    if (q.amp === '1') {
      p.amp = true;
    }
    makeCalendarUrl(p);
    makePrevNext(p);
    makeFutureYears(ctx, p);
    return ctx.render('converter', p);
  }
}

/**
 * @param {HDate} hdate
 * @param {boolean} il
 * @return {any}
 */
function h2gURL(hdate, il) {
  const ilStr = il ? '&i=on' : '';
  const hy = hdate.getFullYear();
  const hmonthName = hdate.getMonthName();
  const hmStr = hmonthArg[hmonthName] || hmonthName;
  const hd = hdate.getDate();
  return {
    title: `${hd} ${hmonthName}`,
    url: `/converter?hd=${hd}&hm=${hmStr}&hy=${hy}${ilStr}&h2g=1`,
  };
}

// eslint-disable-next-line require-jsdoc
function makePrevNext(p) {
  const isEpoch = p.hy === 1 && p.hd === 1 && p.hm === months.TISHREI;
  if (!isEpoch) {
    p.prev = h2gURL(p.hdate.prev(), p.il);
  }
  p.next = h2gURL(p.hdate.next(), p.il);
}

// eslint-disable-next-line require-jsdoc
function makeFutureYears(ctx, p) {
  const locale = ctx.state.locale;
  const arr = makeFutureYearsHeb(p.hdate, 25, locale);
  p.futureYearsHeb = arr;
  p.h2gURL = h2gURL;
  const arr2 = makeFutureYearsGreg(p.d, locale);
  p.futureYearsGreg = arr2;
}

/**
 * @private
 * @param {Date} dt
 * @return {string}
 */
function dateToISOString(dt) {
  const s = dt.toISOString();
  return s.substring(0, s.indexOf('T'));
}

/**
 * @private
 * @param {dayjs.Dayjs} d
 * @param {string} locale
 * @return {any[]}
 */
function makeFutureYearsGreg(d, locale) {
  const arr2 = [];
  const gy = d.year();
  const gm = d.month() + 1;
  const gd0 = d.date();
  for (let i = -5; i <= 25; i++) {
    const gyear = gy + i;
    if (gyear < -3760) {
      continue;
    }
    const gd = gm === 2 && gd0 === 29 && !greg.isLeapYear(gyear) ? 28 : gd0;
    try {
      const dt = makeGregDate(gyear, gm, gd);
      const hdate = new HDate(dt);
      const d = dayjs(dt).locale(locale);
      arr2.push({hd: hdate, d: d, isoDate: dateToISOString(dt)});
    } catch (err) {
      // ignore error from makeGregDate
    }
  }
  return arr2;
}

/**
 * @private
 * @param {HDate} orig
 * @param {number} numYears
 * @param {string} locale
 * @return {any[]}
 */
function makeFutureYearsHeb(orig, numYears, locale) {
  const hy = orig.getFullYear();
  const month = orig.getMonth();
  const day = orig.getDate();
  const isOrigAdar = month === months.ADAR_I;
  const isOrigAdarNonLeap = isOrigAdar && !HDate.isLeapYear(hy);
  const isAdar30 = isOrigAdar && day === 30;
  const arr = [];
  for (let i = -5; i <= numYears; i++) {
    const hyear = hy + i;
    if (hyear < 1) {
      continue;
    }
    const isLeap = HDate.isLeapYear(hyear);
    const isNonLeap = !isLeap;
    const hm = isOrigAdarNonLeap && isLeap ? months.ADAR_II :
      isAdar30 && isNonLeap ? months.NISAN : month;
    const hd = isAdar30 && isNonLeap ? 1 : day;
    const hdate = new HDate(hd, hm, hyear);
    const dt = hdate.greg();
    const d = dayjs(dt).locale(locale);
    arr.push({hd: hdate, d: d, isoDate: dateToISOString(dt)});
  }
  return arr;
}

// eslint-disable-next-line require-jsdoc
function makeCalendarUrl(p) {
  const now = new Date();
  const yearInfo = getDefaultYear(now, new HDate(now));
  const gy = now.getFullYear();
  const gm = now.getMonth() + 1;
  p.yearArgs = yearInfo.yearArgs;
  p.gregRangeShort = yearInfo.gregRangeShort;
  p.calendarUrl = '/hebcal?' + urlArgs({
    v: '1',
    maj: 'on',
    min: 'on',
    nx: 'on',
    mf: 'on',
    ss: 'on',
    mod: 'on',
    i: p.il ? 'on' : 'off',
    set: 'off',
  });
  if ((gm === 12) || (yearInfo.isHebrewYear && yearInfo.todayAbs >= yearInfo.av15Abs)) {
    const start = pad4(gy) + '-' + pad2(gm) + '-01';
    const end = pad4(gy + 1) + '-12-31';
    p.yearArgs = `&start=${start}&end=${end}`;
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
 * @param {Object} props
 * @return {Object}
 */
function makeProperties(ctx, props) {
  if (typeof props.hdates === 'object') {
    return props;
  }
  const query = ctx.request.query;
  const lg = ctx.state.lg;
  const locale = ctx.state.locale;
  const dt = props.dt;
  const d = dayjs(dt).locale(locale);
  const gy = dt.getFullYear();
  const gyStr = gy > 0 ? pad4(gy) : pad4(-(gy-1)) + ' B.C.E.';
  const dateStr = d.format('ddd, D MMMM ') + gyStr;
  const afterSunset = props.gs ? ' ' + Locale.gettext('after sunset', locale) : '';
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
    gdateStr: d.format('MMMM D, ') + gyStr,
    canonical,
    first: greg2heb ? dateStr + afterSunset : hdateStr,
    second: greg2heb ? hdateStr : dateStr,
    hebrew: gematriyaDate(hdate),
    hebrewNoNikkud: Locale.hebrewStripNikkud(hdate.renderGematriya()),
    gs: props.gs,
    d,
    gy,
    gm,
    gd,
    hdate,
    hy,
    hm: hdate.getMonth(),
    hmStr: hmonthName,
    hd: hd,
    hleap: hdate.isLeapYear(),
    il,
    locale,
    lg,
    todayHd: new HDate(),
  };
}

// eslint-disable-next-line require-jsdoc
function eventToItem(ctx, ev) {
  const lg = ctx.state.lg;
  const desc = renameChanukah(lg)(ev);
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
class PseudoParshaEvent extends Event {
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
  const sedra = HebrewCalendar.getSedra(hy, il);
  const parsha = sedra.lookup(saturday);
  let hasFullKriyah = false;
  if (!parsha.chag) {
    const pe = new ParshaEvent(saturday, parsha.parsha, il);
    events = events.concat(pe);
    hasFullKriyah = true;
  }
  const readings = getLeyningOnDate(hdate, il, true);
  for (const reading of readings) {
    if (reading.fullkriyah && !reading.parshaNum) {
      hasFullKriyah = true;
    }
  }
  const mm = hdate.getMonth();
  const dd = hdate.getDate();
  if (!hasFullKriyah) {
    if (mm === months.TISHREI && (dd > 2 && dd < 15)) {
      const simchatTorah = new HDate(il ? 22 : 23, months.TISHREI, hy);
      const pe = new ParshaEvent(simchatTorah, ['Vezot Haberakhah'], il);
      events = events.concat(pe);
    } else {
      const satHolidays = HebrewCalendar.getHolidaysOnDate(saturday, il);
      for (const ev of satHolidays) {
        const pe = new PseudoParshaEvent(ev);
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
  const mm = hdate.getMonth();
  switch (mm) {
    case months.NISAN:
    case months.IYYAR:
    case months.SIVAN:
      const beginOmer = HDate.hebrew2abs(hdate.getFullYear(), months.NISAN, 16);
      const abs = hdate.abs();
      if (abs >= beginOmer && abs < (beginOmer + 49)) {
        const omer = abs - beginOmer + 1;
        return [new OmerEvent(hdate, omer)];
      }
      break;
    default:
      break;
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
      return convertDateRange(ctx, startD, endD);
    } else {
      return g2h(startD.toDate(), false, false);
    }
  }
  if (isset(query.h2g) && query.strict === '1') {
    for (const param of ['hy', 'hm', 'hd']) {
      if (empty(query[param])) {
        throw createError(400, `Missing parameter '${param}' for conversion from Hebrew to Gregorian`);
      }
    }
  }
  if (isset(query.h2g)) {
    if (!empty(query.ndays)) {
      const ndays = parseInt(query.ndays, 10);
      if (isNaN(ndays) || ndays < 1) {
        throw createError(400, `Invalid value for ndays: ${query.ndays}`);
      }
      const startD = dayjs(dt);
      const numDays = Math.min(ndays - 1, 179);
      const endD = startD.add(numDays, 'days');
      return convertDateRange(ctx, startD, endD);
    }
    if (empty(query.hy) && empty(query.hm) && empty(query.hd)) {
      return g2h(new Date(), false, true);
    }
    // in either mode, this will throw if the params are invalid
    const hdate = makeHebDate(query.hy, query.hm, query.hd);
    const dt = hdate.greg();
    return {type: 'h2g', dt, hdate, gs: false};
  }
  if (isset(query.g2h) && query.strict === '1') {
    if (isset(query.date)) {
      isoDateStringToDate(query.date); // throws if invalid
    } else {
      for (const param of ['gy', 'gm', 'gd']) {
        if (empty(query[param])) {
          throw createError(400, `Missing parameter '${param}' for conversion from Gregorian to Hebrew`);
        }
      }
    }
  }
  const gs = query.gs === 'on' || query.gs === '1';
  if (!empty(query.date)) {
    const dt = isoDateStringToDate(query.date);
    return g2h(dt, gs, false);
  } else if (empty(query.gy) && empty(query.gm) && empty(query.gd)) {
    return g2h(new Date(), gs, true);
  } else {
    const dt = makeGregDate(query.gy, query.gm, query.gd);
    return g2h(dt, gs, false);
  }
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @param {dayjs.Dayjs} startD
 * @param {dayjs.Dayjs} endD
 * @return {Object}
 */
function convertDateRange(ctx, startD, endD) {
  const query = ctx.request.query;
  const il = Boolean(query.i === 'on');
  const locale = ctx.state.locale;
  const hdates = {};
  for (let d = startD; d.isSameOrBefore(endD, 'd'); d = d.add(1, 'd')) {
    const dt = d.toDate();
    const isoDate = dateToISOString(dt);
    const hdate = new HDate(dt);
    const hy = hdate.getFullYear();
    const hm = hdate.getMonthName();
    const hd = hdate.getDate();
    const result = {
      hy, hm, hd,
      hebrew: gematriyaDate(hdate),
      heDateParts: {
        y: gematriya(hy),
        m: Locale.gettext(hm, 'he-x-NoNikud'),
        d: gematriya(hd),
      },
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
    start: dateToISOString(startD.toDate()),
    end: dateToISOString(endD.toDate()),
    locale,
    hdates,
  };
}

/**
 * @private
 * @param {Date} dt
 * @param {boolean} gs
 * @param {boolean} noCache
 * @return {any}
 */
function g2h(dt, gs, noCache) {
  let hdate = new HDate(dt);
  if (gs) {
    hdate = hdate.next();
  }
  return {type: 'g2h', dt, hdate, gs, noCache};
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function dateConverterCsv(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
  const p = parseConverterQuery(ctx);
  const hdate = p.hdate;
  const arr = makeFutureYearsHeb(hdate, 75, 'en');
  let csv = 'Gregorian Date,Hebrew Date\r\n';
  for (const item of arr) {
    const isoDate = dateToISOString(item.d.toDate());
    csv += isoDate + ',' + item.hd.toString() + '\r\n';
  }
  if (!p.noCache && ctx.method === 'GET' && ctx.request.querystring.length !== 0) {
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  } else {
    ctx.lastModified = new Date();
  }
  const suffix = hdate.getDate() + '-' + makeAnchor(hdate.getMonthName());
  ctx.response.attachment(`hdate-${suffix}.csv`);
  ctx.response.type = 'text/x-csv; charset=utf-8';
  ctx.body = csv;
}
