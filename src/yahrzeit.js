import {HebrewCalendar, HDate, Event, flags, months, Locale, greg} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, eventsToClassicApi} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {basename} from 'path';
import {empty, getIpAddress, eTagFromOptions} from './common';
import {ulid} from 'ulid';
import {getMaxYahrzeitId, getYahrzeitDetailsFromDb, getYahrzeitDetailForId,
  isNumKey, summarizeAnniversaryTypes} from './common2';
import util from 'util';
import mmh3 from 'murmurhash3';

const murmur32Hex = util.promisify(mmh3.murmur32Hex);

const urlPrefix = process.env.NODE_ENV == 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {*} ctx
 * @return {*}
 */
async function makeQuery(ctx) {
  ctx.state.ulid = '';
  ctx.state.isEditPage = false;
  const isPost = ctx.request.body && ctx.request.body.v === 'yahrzeit';
  const defaults = isPost ? {} : {hebdate: 'on', yizkor: 'off', years: 20};
  const query = Object.assign(defaults, ctx.request.body, ctx.request.query);
  if (isPost) {
    return query;
  }
  const rpath = ctx.request.path;
  if (rpath.startsWith('/yahrzeit/edit/')) {
    const id = basename(rpath);
    return lookupFromDb(ctx, id);
  } else if (typeof query.id === 'string' && query.id.length === 26) {
    return lookupFromDb(ctx, query.id);
  } else {
    return query;
  }
}

// eslint-disable-next-line require-jsdoc
async function lookupFromDb(ctx, id) {
  const db = ctx.mysql;
  const sql = 'SELECT contents FROM yahrzeit WHERE id = ?';
  const results = await db.query({sql, values: [id], timeout: 5000});
  if (results && results[0]) {
    ctx.state.ulid = id;
    ctx.state.isEditPage = true;
    return results[0].contents;
  } else {
    ctx.throw(404, `Not found: ${id}`);
  }
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitApp(ctx) {
  const rpath = ctx.request.path;
  const yahrzeitCookie = ctx.cookies.get('Y');
  if (ctx.method === 'GET' && !ctx.request.querystring &&
    yahrzeitCookie && yahrzeitCookie.length &&
    !rpath.startsWith('/yahrzeit/edit/') && !rpath.startsWith('/yahrzeit/new')) {
    const ids = yahrzeitCookie.split('|');
    return renderCalPicker(ctx, ids);
  }
  const q = ctx.state.q = await makeQuery(ctx);
  const maxId = ctx.state.maxId = getMaxYahrzeitId(q);
  if (maxId > 0 && q.cfg === 'json') {
    ctx.body = await renderJson(maxId, q);
    return;
  }
  const count = Math.max(+q.count || 1, maxId);
  ctx.state.adarInfo = false;
  ctx.state.url = {};
  if (maxId > 0) {
    const id = q.ulid || ctx.state.ulid || ulid().toLowerCase();
    q.ulid = ctx.state.ulid = id;
    const tables = ctx.state.tables = await makeFormResults(ctx);
    if (tables !== null) {
      setYahrzeitCookie(ctx);
      await makeDownloadProps(ctx);
    }
  } else {
    ctx.state.tables = null;
  }
  await ctx.render('yahrzeit', {
    title: 'Yahrzeit + Anniversary Calendar | Hebcal Jewish Calendar',
    count,
  });
}

// eslint-disable-next-line require-jsdoc
async function renderCalPicker(ctx, ids) {
  const db = ctx.mysql;
  const sql = 'SELECT id, contents FROM yahrzeit WHERE id IN (' + new Array(ids.length).fill('?') + ')';
  const results = await db.query({sql, values: ids, timeout: 5000});
  const calendars = results.map((row) => {
    const names = getCalendarNames(row.contents);
    const title = makeCalendarTitle(row.contents, 100);
    return {id: row.id, title, names};
  });
  ctx.set('Cache-Control', 'private');
  return ctx.render('yahrzeit-calpicker', {
    calendars,
  });
}

// eslint-disable-next-line require-jsdoc
function setYahrzeitCookie(ctx) {
  if (ctx.state.yahrzeitCookieSet) {
    return false;
  } else if (ctx.cookies.get('C') === 'opt_out') {
    return false;
  }
  const yahrzeitCookie = ctx.cookies.get('Y');
  const prevIds = yahrzeitCookie ? yahrzeitCookie.split('|') : [];
  const ids = new Set(prevIds);
  ids.add(ctx.state.ulid);
  const newCookie = Array.from(ids).join('|');
  ctx.set('Cache-Control', 'private');
  ctx.cookies.set('Y', newCookie, {
    path: '/yahrzeit',
    expires: dayjs().add(1, 'year').toDate(),
    overwrite: true,
    httpOnly: false,
  });
  ctx.state.yahrzeitCookieSet = true;
  return true;
}

// eslint-disable-next-line require-jsdoc
async function renderJson(maxId, q) {
  delete q.ulid;
  const events = await makeYahrzeitEvents(maxId, q);
  const results = eventsToClassicApi(events, {}, false);
  for (const item of results.items) {
    delete item.hebrew;
    delete item.category;
    if (typeof item.memo === 'string') {
      item.memo = item.memo.replace(/\\n/g, '\n');
    }
  }
  results.title = makeCalendarTitle(q, 255);
  delete results.location;
  return results;
}

// eslint-disable-next-line require-jsdoc
async function makeFormResults(ctx) {
  const q = ctx.state.q;
  const events0 = await makeYahrzeitEvents(ctx.state.maxId, q);
  const events = filterRecentEvents(events0, 90);
  if (events.length === 0) {
    return null;
  }
  const items = events.map((ev) => {
    const hd = ev.getDate();
    if (hd.getMonth() >= months.ADAR_I) {
      ctx.state.adarInfo = true;
    }
    const dt = hd.greg();
    return {
      date: dayjs(dt).format('ddd, D MMM YYYY'),
      desc: ev.render(),
      year: dt.getFullYear(),
    };
  });
  if (q.yizkor !== 'on' && q.yizkor !== '1') {
    return new Map([['', items]]);
  }
  return items.reduce((m, val) => {
    const arr = m.get(val.year);
    if (arr) {
      arr.push(val);
    } else {
      m.set(val.year, [val]);
    }
    return m;
  }, new Map());
}

/**
 * @param {Event[]} events
 * @param {number} daysAgo
 * @return {Event[]}
 */
function filterRecentEvents(events, daysAgo) {
  const now = new Date();
  const nowAbs = greg.greg2abs(now);
  const janOne = greg.greg2abs(new Date(now.getFullYear(), 0, 1));
  const startAbs = Math.min(janOne, nowAbs - daysAgo);
  return events.filter((ev) => ev.getDate().abs() >= startAbs);
}

// eslint-disable-next-line require-jsdoc
async function makeDownloadProps(ctx) {
  const q = ctx.state.q;
  removeEmptyArgs(q);
  const type = summarizeAnniversaryTypes(q);
  ctx.state.anniversaryType = type;
  ctx.state.downloadAltTitle = `${type}.ics`;
  ctx.state.numYears = parseInt(q.years, 10) || 20;
  ctx.state.currentYear = parseInt(q.start, 10) || new HDate().getFullYear();
  const filename = type.toLowerCase();
  const db = ctx.mysql;
  const id = ctx.state.ulid;
  const ip = getIpAddress(ctx);
  const sql = 'REPLACE INTO yahrzeit (id, created, ip, contents) VALUES (?, NOW(), ?, ?)';
  q.v = 'yahrzeit';
  delete q.ulid;
  await db.query({sql, values: [id, ip, JSON.stringify(q)], timeout: 5000});
  const dlhref = `${urlPrefix}/v3/${id}/${filename}`;
  const subical = dlhref + '.ics';
  const usaCSV = '_usa.csv';
  const eurCSV = '_eur.csv';
  ctx.state.filename = {
    ics: filename + '.ics',
    csv_usa: filename + usaCSV,
    csv_eur: filename + eurCSV,
  };
  ctx.state.url = {
    ics: dlhref + '.ics?dl=1',
    ics1year: dlhref + '.ics?dl=1',
    subical: subical,
    webcal: subical.replace(/^https/, 'webcal').replace(/^http/, 'webcal'),
    gcal: subical.replace(/^https/, 'http'),
    csv_usa: dlhref + usaCSV + '?dl=1',
    csv_eur: dlhref + eurCSV + '?euro=1&dl=1',
    title: makeCalendarTitle(q, 64),
  };
}

// eslint-disable-next-line require-jsdoc
function removeEmptyArgs(q) {
  const maxId = getMaxYahrzeitId(q);
  const keyPrefixes = 'mdytns'.split('');
  for (let i = 1; i <= maxId; i++) {
    // ensure that month, day and year are not empty
    if (empty(q['d' + i]) || empty(q['m' + i]) || empty(q['y' + i])) {
      for (const prefix of keyPrefixes) {
        delete q[prefix + i];
      }
    }
  }
  // remove anything larger than maxId
  for (const k of Object.keys(q)) {
    if (isNumKey(k)) {
      const id = parseInt(k.substring(1), 10);
      if (id > maxId) {
        delete q[k];
      }
    }
  }
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
async function getDetailsFromDb(ctx) {
  const id = ctx.state.ulid = ctx.request.path.substring(4, 30);
  const obj = await getYahrzeitDetailsFromDb(ctx, id);
  ctx.state.relcalid = id;
  return obj;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  const rpath = ctx.request.path;
  const details = rpath.startsWith('/v3') ? await getDetailsFromDb(ctx) : {};
  const query = Object.assign({}, details, ctx.request.query);
  // Fix for legacy duplicated key/value pairs
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value) && value.length === 2) {
      query[key] = value[1];
    }
  }
  if (query.v !== 'yahrzeit') {
    return;
  }
  const startYear = parseInt(query.start, 10) || new HDate().getFullYear() - 1;
  ctx.response.etag = eTagFromOptions(query, {startYear});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const maxId = getMaxYahrzeitId(query);
  if (ctx.state.ulid) {
    query.ulid = ctx.state.ulid;
  }
  const events = await makeYahrzeitEvents(maxId, query);
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  const lastModDt = details.lastModified;
  const lastModMs = lastModDt ? lastModDt.getTime() : 0;
  const firstEventDt = events[0].getDate().greg();
  const firstEventMs = firstEventDt.getTime();
  ctx.lastModified = lastModMs > firstEventMs ? lastModDt : firstEventDt;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const extension = rpath.substring(rpath.length - 4);
  if (query.dl == '1') {
    ctx.response.attachment(basename(rpath));
  }
  if (extension == '.ics') {
    ctx.response.type = 'text/calendar; charset=utf-8';
    const icalOpt = {
      yahrzeit: true,
      emoji: true,
      title: makeCalendarTitle(query, 64),
      relcalid: ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null,
    };
    if (typeof query.color === 'string' && query.color.length) {
      icalOpt.calendarColor = query.color.toUpperCase();
    }
    ctx.body = await eventsToIcalendar(events, icalOpt);
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const csv = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = csv;
  }
}

/**
 * @param {any} query
 * @param {number} maxlen
 * @return {string}
 */
function makeCalendarTitle(query, maxlen) {
  const names = getCalendarNames(query);
  const calendarType = summarizeAnniversaryTypes(query, true);
  let title = calendarType;
  if (names.length > 0) {
    title += ': ' + names.join(', ');
  }
  if (title.length > maxlen) {
    title = title.substring(0, maxlen - 3) + '...';
  }
  return title;
}

/**
 * @param {any} query
 * @return {string[]}
 */
function getCalendarNames(query) {
  return Object.entries(query)
      .filter(([k, val]) => k[0] == 'n' && isNumKey(k))
      .map((x) => x[1])
      .filter((str) => str.length > 0);
}

/**
 * @param {number} maxId
 * @param {any} query
 * @return {Event[]}
 */
async function makeYahrzeitEvents(maxId, query) {
  const years = parseInt(query.years, 10) || 20;
  const startYear = parseInt(query.start, 10) || new HDate().getFullYear() - 1;
  const endYear = parseInt(query.end, 10) || (startYear + years - 1);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    const events0 = await getEventsForId(query, id, startYear, endYear);
    events = events.concat(events0);
  }
  const yizkor = query.yizkor;
  if (yizkor === 'on' || yizkor === '1') {
    const holidays = makeYizkorEvents(startYear, endYear, query.i === 'on');
    for (const ev of holidays) {
      const d = dayjs(ev.getDate().greg());
      const hash = await murmur32Hex(ev.getDesc());
      ev.uid = 'yizkor-' + d.format('YYYYMMDD') + '-' + hash;
    }
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

/**
 * @param {Date} origDt
 * @param {number} hyear
 * @return {string}
 */
function calculateAnniversaryNth(origDt, hyear) {
  const origHd = new HDate(origDt);
  const origHyear = origHd.getFullYear();
  const numYears = hyear - origHyear;
  const nth = Locale.ordinal(numYears, 'en');
  return nth;
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
async function getEventsForId(query, id, startYear, endYear) {
  const events = [];
  const info = getYahrzeitDetailForId(query, id);
  if (info === null) {
    return events;
  }
  const type = info.type;
  const name = info.name;
  const day = info.day;
  const urlPrefix = query.ulid && query.dl !== '1' ? `https://www.hebcal.com/yahrzeit/edit/${query.ulid}` : null;
  const appendHebDate = (query.hebdate === 'on' || query.hebdate === '1');
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    const origDt = day.toDate();
    const isYahrzeit = (type === 'Yahrzeit');
    const hd = isYahrzeit ?
      HebrewCalendar.getYahrzeit(hyear, origDt) :
      HebrewCalendar.getBirthdayOrAnniversary(hyear, origDt);
    if (hd) {
      const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
      const hebdate = hd.render('en');
      const nth = calculateAnniversaryNth(origDt, hyear);
      let subj = `${name}'s ${nth} ${typeStr}`;
      if (appendHebDate) {
        const comma = hebdate.indexOf(',');
        subj += ' (' + hebdate.substring(0, comma) + ')';
      }
      const ev = new Event(hd, subj, flags.USER_EVENT);
      if (isYahrzeit) {
        ev.emoji = '🕯️';
      } else if (type === 'Birthday') {
        ev.emoji = '🎂✡️';
      }
      const observed = dayjs(hd.greg());
      const erev = observed.subtract(1, 'day');
      const verb = isYahrzeit ? 'remembering' : 'honoring';
      let memo = `Hebcal joins you in ${verb} ${name}, whose ${nth} ${typeStr} occurs on ` +
      `${observed.format('dddd, MMMM D')}, corresponding to the ${hebdate}.\\n\\n` +
      `${name}'s ${typeStr} begins at sundown on ${erev.format('dddd, MMMM D')} and continues until ` +
      `sundown on the day of observance.`;
      if (isYahrzeit) {
        const dow = erev.day();
        const when = dow === 5 ? 'before sundown' : dow === 6 ? 'after nightfall' : 'at sundown';
        memo += ` It is customary to light a memorial candle ${when} as the Yahrzeit begins.\\n\\n` +
        'May your loved one\'s soul be bound up in the bond of eternal life and may their memory ' +
        'serve as a continued source of inspiration and comfort to you.';
      }
      if (urlPrefix) {
        memo += `\\n\\n${urlPrefix}#row${id}`;
      }
      ev.memo = memo;
      const hash = query.ulid || await murmur32Hex(name);
      ev.uid = type.toLowerCase() + '-' + observed.format('YYYYMMDD') + '-' + hash + '-' + id;
      events.push(ev);
    }
  }
  return events;
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @param {boolean} il
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear, il) {
  const holidays = [];
  const attrs = {emoji: '🕯️'};
  const pesachDay = il ? 21 : 22;
  const pesachDesc = il ? 'Yizkor (Pesach VII)' : 'Yizkor (Pesach VIII)';
  const shavuotDay = il ? 6 : 7;
  const shavuotDesc = il ? 'Yizkor (Shavuot)' : 'Yizkor (Shavuot II)';
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(pesachDay, months.NISAN, hyear), pesachDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(shavuotDay, months.SIVAN, hyear), shavuotDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT, attrs),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT, attrs),
    );
  }
  return holidays;
}
