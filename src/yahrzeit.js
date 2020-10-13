import {HebrewCalendar, HDate, Event, flags, months} from '@hebcal/core';
import {eventsToIcalendarStream} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {Readable} from 'stream';
import {basename} from 'path';
import {empty, getIpAddress, clipboardScript} from './common';
import pino from 'pino';
import {ulid} from 'ulid';
import {makeDb} from './makedb';

const logDir = process.env.NODE_ENV == 'production' ? '/var/log/hebcal' : '.';
const debugLog = pino(pino.destination(logDir + '/debug.log'));

const urlPrefix = process.env.NODE_ENV == 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitApp(ctx) {
  debugLog.info({
    ip: ctx.get('x-client-ip') || ctx.request.ip,
    method: ctx.request.method,
    url: ctx.request.originalUrl,
    ua: ctx.get('user-agent'),
    ref: ctx.get('referer'),
    cookie: ctx.get('cookie'),
    body: ctx.request.body,
    query: ctx.request.query,
  });
  const defaults = (ctx.request.body && ctx.request.body.v === 'yahrzeit') ? {} : {
    hebdate: 'on',
    yizkor: 'off',
    years: 20,
  };
  const q = ctx.state.q = Object.assign(defaults, ctx.request.body, ctx.request.query);
  const maxId = ctx.state.maxId = getMaxId(q);
  const count = +q.count || 6;
  ctx.state.adarInfo = false;
  if (maxId > 0) {
    const tables = ctx.state.tables = makeFormResults(ctx);
    if (tables !== null) {
      await makeDownloadProps(ctx);
    }
  } else {
    ctx.state.tables = null;
  }
  await ctx.render('yahrzeit', {
    title: 'Yahrzeit + Anniversary Calendar | Hebcal Jewish Calendar',
    count: Math.max(count, maxId + 5),
    xtra_html: clipboardScript,
  });
}

// eslint-disable-next-line require-jsdoc
function makeFormResults(ctx) {
  const q = ctx.state.q;
  const events = makeYahrzeitEvents(ctx.state.maxId, q);
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
  if (q.yizkor !== 'on') {
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

// eslint-disable-next-line require-jsdoc
async function makeDownloadProps(ctx) {
  const q = ctx.state.q;
  removeEmptyArgs(q);
  const types0 = Object.entries(q)
      .filter(([k, val]) => k[0] == 't' && isNumKey(k))
      .map((x) => x[1]);
  const types = Array.from(new Set(types0));
  const type = types.length === 1 ? types[0] : 'Anniversary';
  ctx.state.downloadTitle = type;
  const filename = type.toLowerCase();
  const db = makeDb(ctx.iniConfig);
  const id = ulid().toLowerCase();
  const ip = getIpAddress(ctx);
  const sql = 'INSERT INTO yahrzeit (id, created, ip, contents) VALUES (?, NOW(), ?, ?)';
  q.v = 'yahrzeit';
  await db.query(sql, [id, ip, JSON.stringify(q)]);
  await db.close();
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
    subical: subical,
    webcal: subical.replace(/^https/, 'webcal'),
    gcal: encodeURIComponent(subical.replace(/^https/, 'http')),
    csv_usa: dlhref + usaCSV + '?dl=1',
    csv_eur: dlhref + eurCSV + '?euro=1&dl=1',
  };
}

// eslint-disable-next-line require-jsdoc
function removeEmptyArgs(q) {
  const maxId = getMaxId(q);
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
  const db = makeDb(ctx.iniConfig);
  const id = ctx.request.path.substring(4, 30);
  const sql = 'SELECT contents, downloaded FROM yahrzeit WHERE id = ?';
  const results = await db.query(sql, id);
  if (!results || !results[0]) {
    await db.close();
    ctx.throw(404, `Download key ${id} not found`);
  }
  const row = results[0];
  const obj = row.contents;
  if (!row.downloaded) {
    const sqlUpdate = 'UPDATE yahrzeit SET downloaded = 1 WHERE id = ?';
    await db.query(sqlUpdate, id);
  }
  await db.close();
  return obj;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  const rpath = ctx.request.path;
  const details = rpath.startsWith('/v3') ? await getDetailsFromDb(ctx) : {};
  const query = Object.assign({}, details, ctx.request.query);
  if (query.v !== 'yahrzeit') {
    return;
  }
  ctx.logger.debug(Object.assign({
    ip: ctx.get('x-client-ip') || ctx.request.ip,
    url: ctx.request.originalUrl,
  }, query));
  const maxId = getMaxId(query);
  const events = makeYahrzeitEvents(maxId, query);
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  const extension = rpath.substring(rpath.length - 4);
  if (query.dl == '1') {
    ctx.response.attachment(basename(rpath));
  }
  if (extension == '.ics') {
    ctx.response.type = 'text/calendar; charset=utf-8';
    const readable = ctx.body = new Readable();
    eventsToIcalendarStream(readable, events, {yahrzeit: true});
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const ical = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}

/**
 * @param {number} maxId
 * @param {any} query
 * @return {Event[]}
 */
export function makeYahrzeitEvents(maxId, query) {
  const years = parseInt(query.years, 10) || 20;
  const startYear = new HDate().getFullYear();
  const endYear = startYear + years;
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    events = events.concat(getEventsForId(query, id, startYear, endYear));
  }
  if (query.yizkor == 'on') {
    const holidays = makeYizkorEvents(startYear, endYear);
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

/**
 * @param {string} k
 * @return {boolean}
 */
function isNumKey(k) {
  const code = k.charCodeAt(1);
  return code >= 48 && code <= 57;
}

/**
 * @param {any} query
 * @return {number}
 */
function getMaxId(query) {
  const ids = Object.keys(query)
      .filter((k) => k[0] == 'y' && isNumKey(k))
      .map((k) => +(k.substring(1)))
      .map((id) => empty(query['y'+id]) ? 0 : id);
  const max = Math.max(...ids);
  const valid = [];
  for (let i = 1; i <= max; i++) {
    if (!empty(query['d' + i]) && !empty(query['m' + i]) && !empty(query['y' + i])) {
      valid.push(i);
    }
  }
  return valid.length === 0 ? 0 : Math.max(...valid);
}

/**
 * @param {any} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function getEventsForId(query, id, startYear, endYear) {
  const events = [];
  const [dd, mm, yy] = [
    query[`d${id}`],
    query[`m${id}`],
    query[`y${id}`],
  ];
  if (empty(dd) || empty(mm) || empty(yy)) {
    return events;
  }
  const type = query[`t${id}`] || 'Yahrzeit';
  const sunset = query[`s${id}`];
  const name = query[`n${id}`] ? query[`n${id}`].trim() : `Person${id}`;
  let day = dayjs(new Date(yy, mm - 1, dd));
  if (sunset === 'on') {
    day = day.add(1, 'day');
  }
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    const hd = (type == 'Yahrzeit') ?
      HebrewCalendar.getYahrzeit(hyear, day.toDate()) :
      HebrewCalendar.getBirthdayOrAnniversary(hyear, day.toDate());
    if (hd) {
      const typeStr = (type == 'Yahrzeit') ? type : `Hebrew ${type}`;
      let subj = `${name}'s ${typeStr}`;
      if (query.hebdate === 'on') {
        const hebdate = hd.render('en');
        const comma = hebdate.indexOf(',');
        subj += ' (' + hebdate.substring(0, comma) + ')';
      }
      events.push(new Event(hd, subj, flags.USER_EVENT));
    }
  }
  return events;
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear) {
  const holidays = [];
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(22, months.NISAN, hyear), 'Yizkor (Pesach VIII)', flags.USER_EVENT),
        new Event(new HDate(7, months.SIVAN, hyear), 'Yizkor (Shavuot II)', flags.USER_EVENT),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT),
    );
  }
  return holidays;
}
