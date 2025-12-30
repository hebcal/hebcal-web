import {HDate, HebrewCalendar, Event, ParshaEvent, Locale, months,
  OmerEvent, gematriya, greg} from '@hebcal/core';
import dayjs from 'dayjs';
import {makeETag} from './etag.js';
import {setDefautLangTz, httpRedirect} from './common.js';
import {CACHE_CONTROL_7DAYS, CACHE_CONTROL_1_YEAR} from './cacheControl.js';
import {lgToLocale, localeMap} from './lang.js';
import {makeGregDate, getBeforeAfterSunsetForLocation,
  getStartAndEnd, simchatTorahDate,
  makeHebDate, isoDateStringToDate} from './dateUtil.js';
import {empty} from './empty.js';
import {getLeyningOnDate} from '@hebcal/leyning';
import {pad4} from '@hebcal/hdate';
import {makeAnchor} from '@hebcal/rest-api';
import './dayjs-locales.js';
import {gematriyaDate} from './gematriyaDate.js';

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
  const q = ctx.request.query;
  ctx.state.lg = q.lg || 's';
  const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
  ctx.state.locale = localeMap[lg] || 'en';
  let props;
  try {
    props = parseConverterQuery(ctx);
  } catch (err) {
    if (q.strict === '1') {
      const status = err.status || 400;
      ctx.throw(status, err);
    }
    props = g2h(new Date(), false, true);
    props.message = err.message;
  }
  if (ctx.method === 'GET' && props.noCache && !props.message) {
    const location = ctx.state.location || ctx.db.lookupLegacyCity('New York');
    const {gy, gd, gm, afterSunset} = getBeforeAfterSunsetForLocation(new Date(), location);
    const gs = afterSunset ? '&gs=on' : '';
    const il = location.getIsrael() ? '&i=on' : '';
    const json = q.cfg == 'json' ? '&cfg=json' : '';
    const lg = empty(q.lg) ? '' : `&lg=${q.lg}`;
    ctx.set('Cache-Control', 'private, max-age=3600');
    const url = `/converter?gd=${gd}&gm=${gm}&gy=${gy}${gs}${il}&g2h=1${json}${lg}`;
    httpRedirect(ctx, url, 302);
    return;
  }
  const p = makeProperties(ctx, props);
  if (p.message) {
    ctx.status = 400;
  } else if (typeof p.hdates === 'object' && q.cfg !== 'json') {
    ctx.status = 400;
    p.message = RANGE_REQUIRES_CFG_JSON;
  }
  if (ctx.status !== 400 && !p.noCache) {
    ctx.response.etag = makeETag(ctx, q, props);
    ctx.status = 200;
    if (ctx.fresh) {
      ctx.status = 304;
      return;
    }
  }
  if (q.cfg === 'json') {
    ctx.type = 'json';
    if (p.message) {
      ctx.body = {error: p.message};
    } else if (typeof p.hdates === 'object') {
      ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
      let result = p;
      const cb = empty(q.callback) ? false : q.callback.replace(/[^\w\.]/g, '');
      if (cb) {
        result = cb + '(' + JSON.stringify(result) + ')\n';
      }
      ctx.body = result;
    } else {
      if (!p.noCache) {
        ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
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
    ctx.type = 'text/xml';
    if (p.message) {
      ctx.body = `<?xml version="1.0" ?>\n<error message="${p.message}" />\n`;
    } else {
      p.writeResp = false;
      p.heDateParts = {
        y: gematriya(p.hy),
        m: Locale.gettext(p.hmStr, 'he-x-NoNikud'),
        d: gematriya(p.hd),
      };
      if (!p.noCache) {
        ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
      }
      ctx.body = await ctx.render('converter-xml', p);
    }
  } else if (typeof p.hdates === 'object') {
    ctx.throw(400, RANGE_REQUIRES_CFG_JSON);
  } else {
    if (!p.noCache && ctx.method === 'GET' && ctx.request.querystring.length !== 0) {
      ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
    }
    if (q.amp === '1') {
      p.amp = true;
    }
    p.h2gURL = h2gURL;
    if (!p.message) {
      makePrevNext(p);
      makeFutureYears(ctx, p);
    }
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

function makePrevNext(p) {
  const isEpoch = p.hy === 1 && p.hd === 1 && p.hm === months.TISHREI;
  if (!isEpoch) {
    p.prev = h2gURL(p.hdate.prev(), p.il);
  }
  p.next = h2gURL(p.hdate.next(), p.il);
}

function makeFutureYears(ctx, p) {
  const locale = ctx.state.locale;
  const arr = makeFutureYearsHeb(p.hdate, 25, locale);
  p.futureYearsHeb = arr;
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
    // eslint-disable-next-line no-unused-vars
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
    events,
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
  const diaspora = getEvents(hdate, false);
  const israel = getEvents(hdate, true);
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
  // Matan Torah traditionally on 6 Sivan 2448
  if (hdate.abs() < -479441) {
    return [];
  }
  let events = HebrewCalendar.calendar({
    start: hdate,
    end: hdate,
    il,
    yomKippurKatan: false,
    shabbatMevarchim: true,
    molad: true,
  });
  events = events.filter((ev) => ev.getDesc() != 'Chanukah: 1 Candle');
  events = events.concat(getParshaEvents(hdate, il));
  events = events.concat(makeOmer(hdate));
  return events;
}

function getParshaEvents(hdate, il) {
  const saturday = hdate.onOrAfter(6);
  const hy = saturday.getFullYear();
  const sedra = HebrewCalendar.getSedra(hy, il);
  const parsha = sedra.lookup(saturday);
  if (!parsha.chag) {
    const pe = new ParshaEvent(parsha);
    return [pe];
  }
  let hasFullKriyah = false;
  const readings = getLeyningOnDate(hdate, il, true);
  for (const reading of readings) {
    if (reading.fullkriyah && !reading.parshaNum) {
      hasFullKriyah = true;
    }
  }
  const mm = hdate.getMonth();
  const dd = hdate.getDate();
  let events = [];
  if (!hasFullKriyah) {
    if (mm === months.TISHREI && (dd > 2 && dd < 15)) {
      const simchatTorah = simchatTorahDate(hy, il);
      const pe = new ParshaEvent({
        hdate: simchatTorah,
        parsha: ['Vezot Haberakhah'],
        il,
      });
      events = events.concat(pe);
    } else {
      const satHolidays = HebrewCalendar.getHolidaysOnDate(saturday, il) || [];
      for (const ev of satHolidays) {
        const pe = new PseudoParshaEvent(ev);
        events = events.concat(pe);
      }
    }
  }
  return events;
}

/**
 * @private
 * @param {HDate} hdate
 * @return {Event[]}
 */
function makeOmer(hdate) {
  const mm = hdate.getMonth();
  if (mm === months.NISAN || mm === months.IYYAR || mm === months.SIVAN) {
    const beginOmer = HDate.hebrew2abs(hdate.getFullYear(), months.NISAN, 16);
    const abs = hdate.abs();
    if (abs >= beginOmer && abs < (beginOmer + 49)) {
      const omer = abs - beginOmer + 1;
      return [new OmerEvent(hdate, omer)];
    }
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
        ctx.throw(400, `Missing parameter '${param}' for conversion from Hebrew to Gregorian`);
      }
    }
  }
  if (isset(query.h2g)) {
    if (!empty(query.ndays)) {
      const ndays = parseInt(query.ndays, 10);
      if (isNaN(ndays) || ndays < 1) {
        ctx.throw(400, `Invalid value for ndays: ${query.ndays}`);
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
    const gy = dt.getFullYear();
    if (gy > 9999) {
      ctx.throw(400, `Gregorian year cannot be greater than 9999: ${gy}`);
    }
    return {type: 'h2g', dt, hdate, gs: false};
  }
  if (isset(query.g2h) && query.strict === '1') {
    if (isset(query.date)) {
      isoDateStringToDate(query.date); // throws if invalid
    } else {
      for (const param of ['gy', 'gm', 'gd']) {
        if (empty(query[param])) {
          ctx.throw(400, `Missing parameter '${param}' for conversion from Gregorian to Hebrew`);
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
  const lg = ctx.state.lg;
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
      result.events = events.map(renameChanukah(lg));
      if (typeof query.i !== 'undefined') {
        result.il = il;
      }
    }
    hdates[isoDate] = result;
  }
  return {
    start: dateToISOString(startD.toDate()),
    end: dateToISOString(endD.toDate()),
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
  const p = parseConverterQuery(ctx);
  ctx.response.etag = makeETag(ctx, ctx.request.query, p);
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const hdate = p.hdate;
  const arr = makeFutureYearsHeb(hdate, 75, 'en');
  let csv = 'Gregorian Date,Hebrew Date\r\n';
  for (const item of arr) {
    const isoDate = dateToISOString(item.d.toDate());
    csv += isoDate + ',' + item.hd.toString() + '\r\n';
  }
  if (!p.noCache && ctx.request.querystring.length !== 0) {
    ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  }
  const suffix = hdate.getDate() + '-' + makeAnchor(hdate.getMonthName());
  ctx.response.attachment(`hdate-${suffix}.csv`);
  ctx.response.type = 'text/x-csv; charset=utf-8';
  ctx.body = csv;
}
