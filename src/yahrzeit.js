import {HDate, months} from '@hebcal/core';
import {eventsToClassicApi} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {basename} from 'node:path';
import {empty} from './empty.js';
import {checkFreshETag} from './etag.js';
import {pkg} from './pkg.js';
import {cleanQuery} from './cleanQuery.js';
import {
  hebcalFormDefaults,
  processCookieAndQuery,
} from './urlArgs.js';
import {doesCookieNeedRefresh, setHebcalCookie} from './cookie.js';
import {getIpAddress} from './getIpAddress.js';
import {ulid} from 'ulid';
import {getMaxYahrzeitId, isNumKey, summarizeAnniversaryTypes,
  getAnniversaryTypes,
  DEFAULT_YEARS,
  getNumYears,
  compactJsonToSave,
  getCalendarNames, makeCalendarTitle,
  getYahrzeitDetailsFromDb, getYahrzeitDetailForId} from './yahrzeitCommon.js';
import {makeYahrzeitEvents} from './makeYahrzeitEvents.js';
import {makeLogInfo} from './logger.js';
import {isDeepStrictEqual} from 'node:util';

const urlPrefix = process.env.NODE_ENV === 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';
const TIMEOUT = 7000;

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
    ctx.status = 400;
    ctx.body = {error: 'This API does not support cfg=fc'};
    return;
  } else if (q.cfg === 'xml') {
    ctx.status = 400;
    ctx.type = 'text/xml';
    ctx.body = `<?xml version="1.0" ?>\n<error message="This API does not support cfg=xml" />\n`;
    return;
  }
  if (ctx.method === 'GET') {
    if (checkFreshETag(ctx, q, {})) {
      return;
    }
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
  const results = await db.query2(ctx, {sql, values: ids, timeout: TIMEOUT});
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
    httpOnly: true,
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
  if (typeof results.version === 'string') {
    results.version += '-' + pkg.version;
  }
  for (const item of results.items) {
    delete item.hebrew;
    delete item.category;
    if (typeof item.memo === 'string') {
      item.memo = item.memo.replaceAll('\\n', '\n');
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
    const desc = ev.render('en');
    return {
      d: dayjs(hd.greg()),
      desc,
      isHebrewName: /[\u0590-\u05FF]/.test(desc),
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
  ctx.state.currentYear = Number.parseInt(q.start, 10) || new HDate().getFullYear();
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
    analyticsTitle: type,
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
  const results = await db.query2(ctx, {sql: sqlExists, values: [id], timeout: TIMEOUT});
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
    await db.execute2(ctx, {sql, values: [id, ip, contents], timeout: TIMEOUT});
    logInfo.msg = `yahrzeit-db: created calendarId=${id}`;
    ctx.logger.info(logInfo);
  } else {
    const sql = 'UPDATE yahrzeit SET updated = NOW(), contents = ?, ip = ? WHERE id = ?';
    await db.execute2(ctx, {sql, values: [contents, ip, id], timeout: TIMEOUT});
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
      const id = Number.parseInt(k.substring(1), 10);
      if (id > maxId) {
        delete q[k];
      }
    }
  }
}
