import {Event, HDate, HebrewCalendar, Locale,
  flags, gematriya, months} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, eventsToClassicApi, pad4, pad2} from '@hebcal/rest-api';
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
  getCalendarNames, makeCalendarTitle,
  getYahrzeitDetailsFromDb, getYahrzeitDetailForId} from './yahrzeitCommon.js';
import {makeLogInfo} from './logger.js';
import {isDeepStrictEqual} from 'node:util';
import {murmur32HexSync} from 'murmurhash3';

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
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.body = await renderJson(maxId, q);
    return;
  } else if (q.cfg === 'xml') {
    ctx.set('Access-Control-Allow-Origin', '*');
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
      setYahrzeitCookie(ctx);
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

async function makeDownloadProps(ctx) {
  const q = ctx.state.q;
  removeEmptyArgs(q);
  const type = summarizeAnniversaryTypes(q);
  ctx.state.anniversaryType = type;
  ctx.state.downloadAltTitle = `${type}.ics`;
  ctx.state.numYears = getNumYears(q.years);
  ctx.state.currentYear = parseInt(q.start, 10) || new HDate().getFullYear();
  const filename = type.toLowerCase();
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

const noSaveFields = ['ulid', 'v', 'ref_url', 'ref_text', 'seq'];

async function saveDataToDb(ctx) {
  const toSave = {...ctx.state.q};
  const seq = +(toSave.seq) || 1;
  noSaveFields.forEach((key) => delete toSave[key]);
  compactJsonToSave(toSave);
  const id = ctx.state.ulid;
  const logInfo = makeLogInfo(ctx);
  delete logInfo.duration;
  delete logInfo.status;
  logInfo.calendarId = id;
  const db = ctx.mysql;
  const sqlExists = 'SELECT contents FROM yahrzeit WHERE id = ?';
  const results = await db.query2(ctx, {sql: sqlExists, values: [id], timeout: 5000});
  if (results && results[0]) {
    const prev = results[0].contents;
    noSaveFields.forEach((key) => delete prev[key]);
    if (isDeepStrictEqual(toSave, prev)) {
      logInfo.msg = `yahrzeit-db: no change to calendarId=${id}`;
      ctx.logger.info(logInfo);
      return;
    }
  }
  toSave.seq = seq;
  const contents = JSON.stringify(toSave);
  const ip = getIpAddress(ctx);
  if (!results || !results[0]) {
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

function compactJsonToSave(obj) {
  const maxId = getMaxYahrzeitId(obj);
  for (let i = 1; i <= maxId; i++) {
    const yk = 'y' + i;
    const mk = 'm' + i;
    const dk = 'd' + i;
    const yy = obj[yk];
    const mm = obj[mk];
    const dd = obj[dk];
    if (!empty(dd) && !empty(mm) && !empty(yy)) {
      const yy4 = yy.length === 4 ? yy : pad4(+yy);
      const mm2 = mm.length === 2 ? mm : pad2(+mm);
      const dd2 = dd.length === 2 ? dd : pad2(+dd);
      obj['x' + i] = yy4 + '-' + mm2 + '-' + dd2;
      delete obj[yk];
      delete obj[mk];
      delete obj[dk];
    }
    const anniversaryType = obj['t' + i];
    if (anniversaryType) {
      obj['t' + i] = anniversaryType[0].toLowerCase();
    }
    const sunset = obj['s' + i];
    if (typeof sunset !== 'undefined') {
      obj['s' + i] = (sunset === 'on' || sunset == 1) ? 1 : 0;
    }
  }
  if (typeof obj.years === 'string') {
    obj.years = getNumYears(obj.years);
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
  ctx.state.trace.set('getDetailsFromDb-start', Date.now());
  const id = ctx.request.path.substring(4, 30);
  const obj = await getYahrzeitDetailsFromDb(ctx, id);
  ctx.state.trace.set('getDetailsFromDb-end', Date.now());
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
  ctx.state.trace.set('makeYahrzeitEvents-start', Date.now());
  const events = await makeYahrzeitEvents(maxId, query, reminder);
  ctx.state.trace.set('makeYahrzeitEvents-end', Date.now());
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  let lastModified = details.lastModified;
  const now = new Date();
  if (!lastModified) {
    // An old /v2/y/ URL won't have a lastModified
    lastModified = now;
  }
  const firstEventDt = events[0].getDate().greg();
  if (firstEventDt > lastModified && firstEventDt < now) {
    lastModified = firstEventDt;
  }
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
    ctx.state.trace.set('eventsToIcalendar-start', Date.now());
    ctx.response.type = 'text/calendar; charset=utf-8';
    const opts = {
      yahrzeit: true,
      emoji: true,
      title: makeCalendarTitle(query, 64),
      relcalid: ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null,
      publishedTTL: 'PT1D',
      sequence: +(query.seq) || 1,
    };
    const icalOpt = makeIcalOpts(opts, query);
    ctx.body = await eventsToIcalendar(events, icalOpt);
    ctx.state.trace.set('eventsToIcalendar-end', Date.now());
  } else if (extension == '.csv') {
    ctx.state.trace.set('eventsToCsv-start', Date.now());
    const euro = Boolean(query.euro);
    const csv = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = '\uFEFF' + csv;
    ctx.state.trace.set('eventsToCsv-end', Date.now());
  }
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
      const reminders = events0
          .filter((ev) => ev.type === 'Yahrzeit')
          .map((ev) => {
            const hd = ev.getDate().prev();
            const dt = hd.greg();
            const dow = hd.getDay();
            const eventTimeStr = dow === 6 ? '20:00' : dow === 5 ? '14:30' : '16:30';
            const uid = 'reminder-' + dayjs(dt).format('YYYYMMDD') + '-' + ev.hash + '-' + id;
            return new Event(
                hd,
                `${ev.name} Yahrzeit reminder`,
                flags.USER_EVENT,
                {
                  eventTime: dt,
                  eventTimeStr,
                  memo: ev.memo,
                  emoji: ev.emoji,
                  alarm: 'P0DT0H0M0S',
                  uid,
                  category: 'Personal',
                },
            );
          });
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

const en2he = {
  Yahrzeit: 'יארצייט',
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
  const isHebrewName = hebrewRe.test(name);
  const type = info.type;
  if (type !== 'Other') {
    const isYahrzeit = type === 'Yahrzeit';
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
  const isYahrzeit = (type === 'Yahrzeit');
  const isBirthday = (type === 'Birthday');
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
