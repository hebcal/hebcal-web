import {Event, HDate, HebrewCalendar, Locale,
  Location,
  flags, gematriya, months} from '@hebcal/core';
import {IcalEvent, icalEventsToString} from '@hebcal/icalendar';
import {eventsToCsv, eventsToClassicApi, eventToFullCalendar} from '@hebcal/rest-api';
import {isoDateStringToDate} from './dateUtil.js';
import dayjs from 'dayjs';
import {basename} from 'path';
import {empty} from './empty.js';
import {eTagFromOptions, makeIcalOpts,
  cleanQuery,
  hebcalFormDefaults,
  doesCookieNeedRefresh, processCookieAndQuery, setHebcalCookie} from './common.js';
import {getIpAddress} from './getIpAddress.js';
import {ulid} from 'ulid';
import {getMaxYahrzeitId, isNumKey, summarizeAnniversaryTypes,
  getAnniversaryTypes,
  YAHRZEIT, BIRTHDAY,
  DEFAULT_YEARS,
  getNumYears,
  compactJsonToSave,
  getCalendarNames, makeCalendarTitle,
  getYahrzeitDetailsFromDb, getYahrzeitDetailForId} from './yahrzeitCommon.js';
import {makeLogInfo} from './logger.js';
import {isDeepStrictEqual} from 'node:util';
import {murmur128HexSync, murmur32HexSync} from 'murmurhash3';

const urlPrefix = process.env.NODE_ENV == 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';

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
  const query = {...defaults, ...reqBody, ...ctx.request.query};
  cleanQuery(query);
  if (isPost) {
    const id = query.ulid;
    if (isValidUlid(id)) {
      ctx.state.ulid = id;
      ctx.state.isEditPage = true;
    }
    return query;
  }
  const rpath = ctx.request.path;
  const qid = query.id;
  if (rpath.startsWith('/yahrzeit/edit/') || isValidUlid(qid)) {
    const id = qid || basename(rpath);
    const contents = await getYahrzeitDetailsFromDb(ctx, id);
    ctx.state.isEditPage = true;
    ctx.state.showDownload = true;
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
  if (ctx.method === 'GET' && !ctx.request.querystring &&
    !rpath.startsWith('/yahrzeit/edit/') && !rpath.startsWith('/yahrzeit/new')) {
    const yahrzeitCookie = ctx.cookies.get('Y') || '';
    const ids = yahrzeitCookie.split('|');
    const calendars = ids.length ? await getCalPickerIds(ctx, ids) : [];
    return ctx.render('yahrzeit-calpicker', {calendars});
  }
  ctx.state.showDownload = false;
  const q = ctx.state.q = await makeQuery(ctx);
  const maxId = ctx.state.maxId = getMaxYahrzeitId(q);
  if (q.cfg === 'json') {
    ctx.body = await renderJson(maxId, q);
    return;
  } else if (q.cfg === 'fc') {
    ctx.body = await renderFullCalendar(ctx, maxId, q);
    return;
  } else if (q.cfg === 'xml') {
    ctx.status = 400;
    ctx.type = 'text/xml';
    ctx.body = `<?xml version="1.0" ?>\n<error message="This API does not support cfg=xml" />\n`;
    return;
  }
  const seq = +(q.seq) || 0;
  ctx.state.seq = seq + 1;
  const count = Math.max(+q.count || 1, maxId);
  ctx.state.adarInfo = false;
  ctx.state.futureDate = false;
  ctx.state.distantPastDate = false;
  ctx.state.url = {};
  if (maxId > 0) {
    const id = getOrMakeUlid(ctx);
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
        } else if ((today.year() - info.day.year()) > 200) {
          ctx.state.distantPastDate = info;
        }
      }
      ctx.status = 200;
      if (ctx.method === 'POST' || ctx.state.showDownload) {
        setYahrzeitCookie(ctx);
      }
      await makeDownloadProps(ctx);
    }
  } else {
    ctx.state.tables = null;
    if (seq > 0 && ctx.method === 'POST' && isValidUlid(q.ulid)) {
      ctx.state.ulid = q.ulid;
      await saveDataToDb(ctx);
    }
  }
  q.years = getNumYears(q.years);
  ctx.state.typesSet = getAnniversaryTypes(q);
  ctx.status = 200;
  if (doesCookieNeedRefresh(ctx)) {
    const ck = processCookieAndQuery(ctx.cookies.get('C'), hebcalFormDefaults, q);
    setHebcalCookie(ctx, ck);
  }
  await ctx.render('yahrzeit', {
    count,
  });
}

/**
 * @private
 * @param {string} str
 * @return {boolean}
 */
function isValidUlid(str) {
  return typeof str === 'string' && str.length === 26 && /^\w+$/.test(str);
}

function getOrMakeUlid(ctx) {
  const q = ctx.state.q;
  const existing = q.ulid || ctx.state.ulid;
  if (existing) {
    if (!isValidUlid(existing)) {
      ctx.remove('Cache-Control');
      ctx.throw(400, 'Invalid calendar id: ' + existing);
    }
    return existing;
  }
  const id = ulid().toLowerCase();
  const logInfo = makeLogInfo(ctx);
  delete logInfo.duration;
  delete logInfo.status;
  logInfo.calendarId = id;
  logInfo.msg = `yahrzeit: created calendarId=${id}`;
  ctx.logger.info(logInfo);
  return id;
}

async function getCalPickerIds(ctx, ids) {
  const db = ctx.mysql;
  const sql = 'SELECT id, contents FROM yahrzeit WHERE id IN (' + new Array(ids.length).fill('?') + ')';
  const results = await db.query2(ctx, {sql, values: ids, timeout: 5000});
  const nonEmpty = results.filter((row) => getMaxYahrzeitId(row.contents) !== 0);
  const calendars = nonEmpty.map((row) => {
    const names = getCalendarNames(row.contents);
    const title = makeCalendarTitle(row.contents, 100);
    return {id: row.id, title, names};
  });
  return calendars;
}

function setYahrzeitCookie(ctx) {
  if (ctx.state.yahrzeitCookieSet) {
    return false;
  }
  const cCookie = ctx.cookies.get('C');
  if (cCookie === 'opt_out') {
    return false;
  }
  const yahrzeitCookie = ctx.cookies.get('Y');
  const prevIds = yahrzeitCookie ? yahrzeitCookie.split('|') : [];
  const ids = new Set(prevIds);
  ids.add(ctx.state.ulid);
  const newCookie = Array.from(ids).join('|');
  const expires = dayjs().add(399, 'd').toDate();
  ctx.cookies.set('Y', newCookie, {
    path: '/yahrzeit',
    expires: expires,
    overwrite: true,
    httpOnly: false,
  });
  ctx.state.yahrzeitCookieSet = true;
  return true;
}

async function renderJson(maxId, q) {
  delete q.ulid;
  const events = await makeYahrzeitEvents(maxId, q, false);
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

async function renderFullCalendar(ctx, maxId, q) {
  for (const param of ['start', 'end']) {
    if (typeof q[param] === 'undefined') {
      ctx.remove('Cache-Control');
      ctx.throw(400, `Please specify required parameter '${param}'`);
    } else if (Array.isArray(q[param])) {
      ctx.remove('Cache-Control');
      ctx.throw(400, `Invalid duplicate parameter '${param}'`);
    }
  }
  const start = new HDate(isoDateStringToDate(q.start)).getFullYear();
  const end = new HDate(isoDateStringToDate(q.end)).getFullYear();
  const years = (end - start) + 1;
  const query = {...q, start, end, years};
  delete query.ulid;
  const il = query.i === 'on';
  const events = await makeYahrzeitEvents(maxId, query, false);
  return events.map((ev) => {
    const item = eventToFullCalendar(ev, 'UTC', il);
    const emoji = ev.getEmoji();
    if (emoji) {
      item.emoji = emoji;
    }
    return item;
  });
}

async function makeFormResults(ctx) {
  const q = ctx.state.q;
  const events = await makeYahrzeitEvents(ctx.state.maxId, q, false);
  if (events.length === 0) {
    return null;
  }
  const items = events.map((ev) => {
    const hd = ev.getDate();
    if (hd.getMonth() >= months.ADAR_I) {
      ctx.state.adarInfo = true;
    }
    return {
      d: dayjs(hd.greg()),
      desc: ev.render('en'),
      year: hd.getFullYear(),
    };
  });
  if (items.length < 50 && (q.yizkor !== 'on' && q.yizkor !== '1')) {
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

async function makeDownloadProps(ctx) {
  const q = ctx.state.q;
  removeEmptyArgs(q);
  const type = summarizeAnniversaryTypes(q);
  ctx.state.anniversaryType = type;
  ctx.state.numYears = getNumYears(q.years);
  ctx.state.currentYear = parseInt(q.start, 10) || new HDate().getFullYear();
  const filename = 'personal';
  ctx.state.downloadAltTitle = `${filename}.ics`;
  q.v = 'yahrzeit';
  if (ctx.method === 'POST') {
    await saveDataToDb(ctx);
    ctx.state.showDownload = true;
  }
  const id = ctx.state.ulid;
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

async function saveDataToDb(ctx) {
  const toSave = {...ctx.state.q};
  const seq = +(toSave.seq) || 1;
  compactJsonToSave(toSave);
  const id = ctx.state.ulid;
  const logInfo = makeLogInfo(ctx);
  delete logInfo.duration;
  delete logInfo.status;
  logInfo.calendarId = id;
  const db = ctx.mysql;
  const sqlExists = 'SELECT contents FROM yahrzeit WHERE id = ?';
  const results = await db.query2(ctx, {sql: sqlExists, values: [id], timeout: 5000});
  if (results?.[0]) {
    const prev = results[0].contents;
    compactJsonToSave(prev);
    toSave.seq = prev.seq = -1; // ignore sequence number during comparison
    if (isDeepStrictEqual(toSave, prev)) {
      logInfo.msg = `yahrzeit-db: no change to calendarId=${id}`;
      ctx.logger.info(logInfo);
      return;
    }
  }
  toSave.seq = seq;
  const contents = JSON.stringify(toSave);
  const ip = getIpAddress(ctx);
  if (!results?.[0]) {
    const sql = 'REPLACE INTO yahrzeit (id, created, updated, ip, contents) VALUES (?, NOW(), NOW(), ?, ?)';
    await db.execute2(ctx, {sql, values: [id, ip, contents], timeout: 5000});
    logInfo.msg = `yahrzeit-db: created calendarId=${id}`;
    ctx.logger.info(logInfo);
  } else {
    const sql = 'UPDATE yahrzeit SET updated = NOW(), contents = ?, ip = ? WHERE id = ?';
    await db.execute2(ctx, {sql, values: [contents, ip, id], timeout: 5000});
    logInfo.msg = `yahrzeit-db: updated calendarId=${id}`;
    ctx.logger.info(logInfo);
  }
}

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
  const id = ctx.request.path.substring(4, 30);
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
  const query = {...details, ...ctx.request.query};
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
  const maxId = getMaxYahrzeitId(query);
  if (ctx.state.ulid) {
    query.ulid = ctx.state.ulid;
  }
  const reminder = query.yrem !== '0' && query.yrem !== 'off';
  const events = await makeYahrzeitEvents(maxId, query, reminder);
  const lastModified = makeLastModified(details, events);
  query.lastModified = ctx.lastModified = lastModified; // store in query for eTag
  const startYear = parseInt(query.start, 10) || getDefaultStartYear();
  const extension = rpath.substring(rpath.length - 4);
  ctx.response.etag = eTagFromOptions(query, {startYear, extension});
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
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
      sequence: +(query.seq) || 1,
      locale: 'en',
    };
    const icalOpt = makeIcalOpts(opts, query);
    icalOpt.dtstamp = IcalEvent.makeDtstamp(new Date());
    // Hack for Google Calendar which doesn't understand iCalendar floating times
    if (query.i === 'on') {
      icalOpt.location = Location.lookup('Jerusalem');
    } else if (ctx.get('user-agent') === 'Google-Calendar-Importer') {
      icalOpt.location = Location.lookup('New York');
    }
    const zeroEvents = events.length === 0;
    const events2 = zeroEvents ? makeDummyEvent(ctx) : events;
    if (zeroEvents) {
      icalOpt.publishedTTL = false;
    }
    const icals = events2.map((ev) => new IcalEvent(ev, icalOpt));
    for (const icalEv of icals) {
      icalEv.locationName = undefined;
    }
    ctx.set('Vary', 'User-Agent');
    ctx.body = await icalEventsToString(icals, icalOpt);
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const csv = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = '\uFEFF' + csv;
  }
}

function makeEditMemo(calendarId) {
  return 'To edit this Hebcal Yahrzeit + Anniversary Calendar, visit https://www.hebcal.com/yahrzeit/edit/' +
    calendarId;
}

function makeDummyEvent(ctx) {
  const dt = new Date();
  const ev = new Event(new HDate(dt), 'Calendar contains no events', flags.USER_EVENT);
  const url = ctx.request.url;
  const id = ctx.state.relcalid || murmur128HexSync(url);
  const isoDateStr = IcalEvent.formatYYYYMMDD(dt);
  ev.uid = `yahrzeit-${isoDateStr}-${id}-dummy`;
  ev.alarm = false;
  if (ctx.state.relcalid) {
    const id = ctx.state.relcalid;
    ev.memo = makeEditMemo(id);
  } else {
    ev.memo = 'To create a new Hebcal Yahrzeit + Anniversary Calendar, visit https://www.hebcal.com/yahrzeit';
  }
  ctx.set('Cache-Control', 'max-age=86400');
  ctx.remove('ETag');
  return [ev];
}

function makeLastModified(details, events) {
  const now = new Date();
  if (events.length === 0) {
    return now;
  }
  let lastModified = details.lastModified;
  if (!lastModified) {
    // An old /v2/y/ URL won't have a lastModified
    lastModified = now;
  }
  const firstEventDt = events[0].getDate().greg();
  if (firstEventDt > lastModified && firstEventDt < now) {
    lastModified = firstEventDt;
  }
  return lastModified;
}

/**
 * @return {number}
 */
function getDefaultStartYear() {
  const today = new HDate();
  const hmonth = today.getMonth();
  const hyear = today.getFullYear();
  const isFirst3months = hmonth >= months.TISHREI && hmonth <= months.TEVET;
  return isFirst3months ? hyear - 1 : hyear;
}

/**
 * @param {number} maxId
 * @param {any} query
 * @param {boolean} reminder
 * @return {Promise<Event[]>}
 */
async function makeYahrzeitEvents(maxId, query, reminder) {
  const years = getNumYears(query.years);
  const startYear = parseInt(query.start, 10) || getDefaultStartYear();
  const endYear = parseInt(query.end, 10) || (startYear + years - 1);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    const events0 = await getEventsForId(query, id, startYear, years);
    events = events.concat(events0);
    if (reminder) {
      const reminders = makeReminderEvents(events0, id);
      events = events.concat(reminders);
    }
  }
  const yizkor = query.yizkor;
  if (yizkor === 'on' || yizkor === '1') {
    const holidays = makeYizkorEvents(startYear, endYear, query.i === 'on');
    for (const ev of holidays) {
      const d = dayjs(ev.getDate().greg());
      const hash = murmur32HexSync(ev.getDesc());
      ev.uid = 'yizkor-' + d.format('YYYYMMDD') + '-' + hash;
      if (query.ulid) {
        ev.memo = makeEditMemo(query.ulid);
      }
    }
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

function getAlarmTime(hd) {
  switch (hd.getDay()) {
    case 6: return '20:00';
    case 5: return '14:30';
    default: return '16:30';
  }
}

function makeReminderEvents(events, id) {
  const yahrzeitEvents = events.filter((ev) => ev.type === YAHRZEIT);
  return yahrzeitEvents.map((ev) => {
    const hd = ev.getDate().prev();
    const dt = hd.greg();
    const uid = 'reminder-' + dayjs(dt).format('YYYYMMDD') + '-' + ev.hash + '-' + id;
    const name = ev.name;
    const subj = hebrewRe.test(name) ?
      `${name} ${YAHRZEIT_HE} תזכורת` :
      `${name} Yahrzeit reminder`;
    return new Event(hd, subj, flags.USER_EVENT, {
      eventTime: dt,
      eventTimeStr: getAlarmTime(hd),
      memo: ev.memo,
      emoji: ev.emoji,
      alarm: 'P0DT0H0M0S',
      uid,
      category: 'Personal',
    });
  });
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} numYears
 * @return {Promise<Event[]>}
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

const hebrewRe = /[\u05d0-\u05ea]/;

const YAHRZEIT_HE = 'יארצייט';

const en2he = {
  Yahrzeit: YAHRZEIT_HE,
  Birthday: 'יום הולדת',
  Anniversary: 'יום נישואין',
};

function hebdateNoYear(hd, isHebrewName) {
  if (isHebrewName) {
    const dd = hd.getDate();
    const mm = Locale.gettext(hd.getMonthName(), 'he-x-NoNikud');
    return gematriya(dd) + ' ' + mm;
  } else {
    return hd.render('en', false).replace(/'/g, '’');
  }
}

function makeYahrzeitSubject(info, hd, yearNumber, appendHebDate) {
  const name = info.name;
  let subj = name;
  const isHebrewName = hebrewRe.test(name) && !/[A-Za-z]/.test(name);
  const type = info.type;
  if (type !== 'Other') {
    const isYahrzeit = type === YAHRZEIT;
    if (isHebrewName) {
      const prefix = en2he[type];
      subj = isYahrzeit ?
        `${prefix} ה-${yearNumber} של ${name}` :
        `${prefix} ${yearNumber} ל${name}`;
    } else {
      const nth = Locale.ordinal(yearNumber, 'en');
      const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
      subj = `${name}’s ${nth} ${typeStr}`;
    }
  }
  if (appendHebDate) {
    const hebdate = hebdateNoYear(hd, isHebrewName);
    subj += ' (' + hebdate + ')';
  }
  return subj;
}

/**
 * @param {number} id
 * @param {any} info
 * @param {number} hyear
 * @param {boolean} appendHebDate
 * @param {string} calendarId
 * @param {boolean} includeUrl
 * @return {Promise<Event>}
 */
async function makeYahrzeitEvent(id, info, hyear, appendHebDate, calendarId, includeUrl) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const origDt = info.day.toDate();
  const hd = isYahrzeit ?
    HebrewCalendar.getYahrzeit(hyear, origDt) :
    HebrewCalendar.getBirthdayOrAnniversary(hyear, origDt);
  if (!hd) {
    return null;
  }
  const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
  const hebdate = hd.render('en').replace(/'/g, '’');
  const origHd = new HDate(origDt);
  const origHyear = origHd.getFullYear();
  const yearNumber = hyear - origHyear;
  const nth = Locale.ordinal(yearNumber, 'en');
  const name = info.name;
  const subj = makeYahrzeitSubject(info, hd, yearNumber, appendHebDate);
  const ev = new Event(hd, subj, flags.USER_EVENT);
  if (isYahrzeit) {
    ev.emoji = '🕯️';
  } else if (isBirthday) {
    ev.emoji = '🎂✡️';
  }
  const observed = dayjs(hd.greg());
  ev.memo = makeMemo(id, info, observed, nth, typeStr, hebdate, includeUrl, calendarId);
  const hash = calendarId || murmur32HexSync(name);
  ev.uid = type.toLowerCase() + '-' + observed.format('YYYYMMDD') + '-' + hash + '-' + id;
  ev.name = name;
  ev.type = type;
  ev.anniversary = yearNumber;
  if (isYahrzeit) {
    ev.alarm = false;
    ev.hash = hash;
  }
  return ev;
}

function makeMemo(id, info, observed, nth, typeStr, hebdate, includeUrl, calendarId) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const isOther = (type === 'Other');
  const name = info.name;
  const nameAndType = isOther ? name : `${name}’s ${typeStr}`;
  const erev = observed.subtract(1, 'day');
  const verb = isYahrzeit ? 'remembering' : 'honoring';
  const prefix = isOther ? name : `Hebcal joins you in ${verb} ${name}, whose ${nth} ${typeStr}`;
  let memo = `${prefix} occurs on ` +
    `${observed.format('dddd, MMMM D')}, corresponding to the ${hebdate}.\\n\\n` +
    `${nameAndType} begins at sundown on ${erev.format('dddd, MMMM D')} and continues until ` +
    `sundown on the day of observance.`;
  if (isYahrzeit) {
    const dow = erev.day();
    const when = dow === 5 ? 'before sundown' : dow === 6 ? 'after nightfall' : 'at sundown';
    memo += ` It is customary to light a memorial candle ${when} as the Yahrzeit begins.\\n\\n` +
      'May your loved one’s soul be bound up in the bond of eternal life and may their memory ' +
      'serve as a continued source of inspiration and comfort to you.';
  } else if (isBirthday) {
    memo += '\\n\\nMazel Tov!';
  }
  if (includeUrl) {
    memo += `\\n\\nhttps://www.hebcal.com/yahrzeit/edit/${calendarId}#row${id}`;
  }
  return memo;
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
