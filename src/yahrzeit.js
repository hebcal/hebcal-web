import {HebrewCalendar, HDate, Event, flags, months, Locale} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, eventsToClassicApi} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {basename} from 'path';
import {empty, getIpAddress, eTagFromOptions, makeIcalOpts} from './common';
import {ulid} from 'ulid';
import {getMaxYahrzeitId, getYahrzeitDetailsFromDb, getYahrzeitDetailForId,
  isNumKey, summarizeAnniversaryTypes} from './common2';
import util from 'util';
import mmh3 from 'murmurhash3';
import uuid from 'uuid-random';

const murmur32Hex = util.promisify(mmh3.murmur32Hex);

const urlPrefix = process.env.NODE_ENV == 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';
const MIN_YEARS = 2;
const MAX_YEARS = 50;
const DEFAULT_YEARS = 20;

/**
 * @param {*} ctx
 * @return {*}
 */
async function makeQuery(ctx) {
  ctx.state.ulid = '';
  ctx.state.isEditPage = false;
  const reqBody = ctx.request.body;
  const isPost = ctx.method === 'POST' && reqBody?.v === 'yahrzeit';
  const defaults = isPost ? {} : {hebdate: 'on', yizkor: 'off', years: DEFAULT_YEARS};
  const query = Object.assign(defaults, reqBody, ctx.request.query);
  if (isPost) {
    return query;
  }
  const rpath = ctx.request.path;
  const qid = query.id;
  if (rpath.startsWith('/yahrzeit/edit/') || (typeof qid === 'string' && qid.length === 26)) {
    const id = qid || basename(rpath);
    const contents = await getYahrzeitDetailsFromDb(ctx, id);
    ctx.state.ulid = id;
    ctx.state.isEditPage = true;
    return contents;
  } else {
    return query;
  }
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitApp(ctx) {
  ctx.set('Cache-Control', 'private');
  const rpath = ctx.request.path;
  const yahrzeitCookie = ctx.cookies.get('Y');
  if (ctx.method === 'GET' && !ctx.request.querystring &&
    yahrzeitCookie && yahrzeitCookie.length &&
    !rpath.startsWith('/yahrzeit/edit/') && !rpath.startsWith('/yahrzeit/new')) {
    const ids = yahrzeitCookie.split('|');
    const calendars = await getCalPickerIds(ctx, ids);
    if (calendars.length) {
      return ctx.render('yahrzeit-calpicker', {
        calendars,
      });
    }
  }
  const q = ctx.state.q = await makeQuery(ctx);
  const maxId = ctx.state.maxId = getMaxYahrzeitId(q);
  if (maxId > 0 && q.cfg === 'json') {
    ctx.body = await renderJson(maxId, q);
    return;
  }
  const count = Math.max(+q.count || 1, maxId);
  ctx.state.adarInfo = false;
  ctx.state.futureDate = false;
  ctx.state.distantPastDate = false;
  ctx.state.url = {};
  if (maxId > 0) {
    const id = q.ulid || ctx.state.ulid || ulid().toLowerCase();
    q.ulid = ctx.state.ulid = id;
    const tables = ctx.state.tables = await makeFormResults(ctx);
    if (tables !== null) {
      const today = dayjs();
      for (let num = 1; num <= maxId; num++) {
        const info = getYahrzeitDetailForId(q, num);
        if (!info) {
          continue;
        }
        if (info.day.isAfter(today)) {
          ctx.state.futureDate = info;
        } else if ((today.year() - info.day.year()) > 150) {
          ctx.state.distantPastDate = info;
        }
      }
      setYahrzeitCookie(ctx);
      await makeDownloadProps(ctx);
    }
  } else {
    ctx.state.tables = null;
  }
  q.years = getNumYears(q.years);
  await ctx.render('yahrzeit', {
    count,
  });
}

// eslint-disable-next-line require-jsdoc
async function getCalPickerIds(ctx, ids) {
  const db = ctx.mysql;
  const sql = 'SELECT id, contents FROM yahrzeit WHERE id IN (' + new Array(ids.length).fill('?') + ')';
  const results = await db.query({sql, values: ids, timeout: 5000});
  const calendars = results.map((row) => {
    const names = getCalendarNames(row.contents);
    const title = makeCalendarTitle(row.contents, 100);
    return {id: row.id, title, names};
  });
  return calendars;
}

// eslint-disable-next-line require-jsdoc
function setYahrzeitCookie(ctx) {
  const cCookie = ctx.cookies.get('C');
  if (ctx.state.yahrzeitCookieSet) {
    return false;
  } else if (cCookie === 'opt_out') {
    return false;
  }
  const yahrzeitCookie = ctx.cookies.get('Y');
  const prevIds = yahrzeitCookie ? yahrzeitCookie.split('|') : [];
  const ids = new Set(prevIds);
  ids.add(ctx.state.ulid);
  const newCookie = Array.from(ids).join('|');
  const expires = dayjs().add(1, 'year').toDate();
  ctx.cookies.set('Y', newCookie, {
    path: '/yahrzeit',
    expires: expires,
    overwrite: true,
    httpOnly: false,
  });
  if (!cCookie) {
    const userId = uuid();
    ctx.cookies.set('C', 'uid=' + userId, {
      expires: expires,
      path: '/',
      overwrite: true,
      httpOnly: false,
    });
  }
  ctx.state.yahrzeitCookieSet = true;
  return true;
}

// eslint-disable-next-line require-jsdoc
async function renderJson(maxId, q) {
  delete q.ulid;
  const events = await makeYahrzeitEvents(maxId, q);
  const options = {includeEvent: true};
  if (q.hdp === '1') {
    options.heDateParts = true;
  }
  const results = eventsToClassicApi(events, options, false);
  for (const item of results.items) {
    delete item.hebrew;
    delete item.category;
    if (typeof item.memo === 'string') {
      item.memo = item.memo.replace(/\\n/g, '\n');
    }
    const ev = item.ev;
    delete item.ev;
    if (ev.name) item.name = ev.name;
    if (ev.type) {
      item.category = ev.type.toLowerCase();
    } else if (item.title.startsWith('Yizkor (')) {
      item.category = 'yizkor';
    }
    if (ev.anniversary) item.anniversary = ev.anniversary;
  }
  results.title = makeCalendarTitle(q, 255);
  delete results.location;
  return results;
}

// eslint-disable-next-line require-jsdoc
async function makeFormResults(ctx) {
  const q = ctx.state.q;
  const events = await makeYahrzeitEvents(ctx.state.maxId, q);
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
      desc: ev.render('en'),
      year: hd.getFullYear(),
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
 * @param {string|number} str
 * @return {number}
 */
function getNumYears(str) {
  const y = parseInt(str, 10);
  if (isNaN(y)) {
    return DEFAULT_YEARS;
  } else if (y < MIN_YEARS) {
    return MIN_YEARS;
  } else if (y > MAX_YEARS) {
    return MAX_YEARS;
  } else {
    return y;
  }
}

// eslint-disable-next-line require-jsdoc
async function makeDownloadProps(ctx) {
  const q = ctx.state.q;
  removeEmptyArgs(q);
  const type = summarizeAnniversaryTypes(q);
  ctx.state.anniversaryType = type;
  ctx.state.downloadAltTitle = `${type}.ics`;
  ctx.state.numYears = getNumYears(q.years);
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
    } else {
      // valid date; trim whitespace from names
      const nameKey = 'n' + i;
      const name = q[nameKey] || '';
      q[nameKey] = name.trim();
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
  const vv = query.v;
  if (!vv || vv[0] !== 'y') {
    return;
  }
  const startYear = parseInt(query.start, 10) || getDefaultStartYear();
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
    const opts = {
      yahrzeit: true,
      emoji: true,
      title: makeCalendarTitle(query, 64),
      relcalid: ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null,
      publishedTTL: 'PT1D',
    };
    const icalOpt = makeIcalOpts(opts, query);
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
 * @return {number}
 */
function getDefaultStartYear() {
  const today = new HDate();
  const hmonth = today.getMonth();
  const hyear = today.getFullYear();
  const isFirst3months = hmonth >= months.TISHREI && hmonth <= months.KISLEV;
  return isFirst3months ? hyear - 1 : hyear;
}

/**
 * @param {number} maxId
 * @param {any} query
 * @return {Event[]}
 */
async function makeYahrzeitEvents(maxId, query) {
  const years = getNumYears(query.years);
  const startYear = parseInt(query.start, 10) || getDefaultStartYear();
  const endYear = parseInt(query.end, 10) || (startYear + years - 1);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    const events0 = await getEventsForId(query, id, startYear, years);
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
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} numYears
 * @return {Event[]}
 */
async function getEventsForId(query, id, startYear, numYears) {
  const events = [];
  const info = getYahrzeitDetailForId(query, id);
  if (info === null) {
    return events;
  }
  const calendarId = query.ulid;
  const includeUrl = Boolean(calendarId && query.dl !== '1');
  const appendHebDate = (query.hebdate === 'on' || query.hebdate === '1');
  for (let hyear = startYear; events.length < numYears; hyear++) {
    const ev = await makeYahrzeitEvent(id, info, hyear, appendHebDate, calendarId, includeUrl);
    if (ev) {
      events.push(ev);
    }
  }
  return events;
}

/**
 * @param {number} id
 * @param {any} info
 * @param {number} hyear
 * @param {boolean} appendHebDate
 * @param {string} calendarId
 * @param {boolean} includeUrl
 * @return {Event}
 */
async function makeYahrzeitEvent(id, info, hyear, appendHebDate, calendarId, includeUrl) {
  const type = info.type;
  const isYahrzeit = (type === 'Yahrzeit');
  const isBirthday = (type === 'Birthday');
  const origDt = info.day.toDate();
  const hd = isYahrzeit ?
    HebrewCalendar.getYahrzeit(hyear, origDt) :
    HebrewCalendar.getBirthdayOrAnniversary(hyear, origDt);
  if (!hd) {
    return null;
  }
  const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
  const hebdate = hd.render('en');
  const origHd = new HDate(origDt);
  const origHyear = origHd.getFullYear();
  const yearNumber = hyear - origHyear;
  const nth = Locale.ordinal(yearNumber, 'en');
  const name = info.name;
  let subj = `${name}'s ${nth} ${typeStr}`;
  if (appendHebDate) {
    const comma = hebdate.indexOf(',');
    subj += ' (' + hebdate.substring(0, comma) + ')';
  }
  const ev = new Event(hd, subj, flags.USER_EVENT);
  if (isYahrzeit) {
    ev.emoji = '🕯️';
  } else if (isBirthday) {
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
  } else if (isBirthday) {
    memo += '\\n\\nMazel Tov!';
  }
  if (includeUrl) {
    memo += `\\n\\nhttps://www.hebcal.com/yahrzeit/edit/${calendarId}#row${id}`;
  }
  ev.memo = memo;
  const hash = calendarId || await murmur32Hex(name);
  ev.uid = type.toLowerCase() + '-' + observed.format('YYYYMMDD') + '-' + hash + '-' + id;
  ev.name = name;
  ev.type = type;
  ev.anniversary = yearNumber;
  return ev;
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
