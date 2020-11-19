import {HebrewCalendar, HDate, Event, flags, months} from '@hebcal/core';
import {eventsToIcalendarStream} from '@hebcal/icalendar';
import {eventsToCsv} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {Readable} from 'stream';
import {basename} from 'path';
import {empty, getIpAddress, clipboardScript, tooltipScript} from './common';
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
  const count = Math.max(+q.count || 1, maxId);
  ctx.state.adarInfo = false;
  if (maxId > 0) {
    const tables = ctx.state.tables = makeFormResults(ctx);
    if (tables !== null) {
      await makeDownloadProps(ctx);
    }
  } else {
    ctx.state.tables = null;
  }
  const scriptHtml = ctx.state.tables ? (clipboardScript + tooltipScript) : tooltipScript;
  await ctx.render('yahrzeit', {
    title: 'Yahrzeit + Anniversary Calendar | Hebcal Jewish Calendar',
    count,
    xtra_html: scriptHtml +
`<script>
(function() {
var count=${count};
function yahrzeitRow(n) {
  return '<div class="row gy-1 gx-2 mb-3 align-items-center mt-1"><div class="col-auto"><input class="form-control" type="text" name="n'+n+'" placeholder="Name (optional)"></div><div class="col-auto"><select name="t'+n+'" class="form-select"><option>Yahrzeit</option><option>Birthday</option><option>Anniversary</option></select></div><div class="col-auto"><input class="form-control" type="text" name="d'+n+'" size="2" maxlength="2" max="31" min="1" pattern="\\\\d*" placeholder="Day"></div><div class="col-auto"><select name="m'+n+'" class="form-select"><option value="1">January</option><option value="2">February</option><option value="3">March</option><option value="4">April</option><option value="5">May</option><option value="6">June</option><option value="7">July</option><option value="8">August</option><option value="9">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option></select></div><div class="col-auto"><input class="form-control" type="text" name="y'+n+'" size="4" maxlength="4" pattern="\\\\d*" placeholder="Year"></div><div class="col-auto form-check m-2"><input class="form-check-input" type="radio" name="s'+n+'" id="s'+n+'-0" checked="" value="off"><label class="form-check-label" for="s'+n+'-0">Before sunset</label></div><div class="col-auto form-check"><input class="form-check-input" type="radio" name="s'+n+'" id="s'+n+'-1" value="on"><label class="form-check-label" for="s'+n+'-1">After sunset</label></div></div>';
}
document.getElementById("newrow").onclick = function() {
  var n = ++count;
  var newNode = document.createElement("div");
  newNode.className = "yahrzeit-row";
  newNode.id = "row" + n;
  newNode.innerHTML = yahrzeitRow(n);
  var parentDiv = document.getElementById("rows");
  parentDiv.insertBefore(newNode, null);
  return false;
}
})();
</script>`,
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
  const type = summarizeAnniversaryTypes(q);
  ctx.state.downloadTitle = type;
  const filename = type.toLowerCase();
  const db = makeDb(ctx.iniConfig);
  const id = ctx.state.ulid = ulid().toLowerCase();
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

/**
 * @param {any} query
 * @return {string}
 */
function summarizeAnniversaryTypes(query) {
  const types0 = Object.entries(query)
      .filter(([k, val]) => k[0] == 't' && isNumKey(k))
      .map((x) => x[1]);
  const types = Array.from(new Set(types0));
  return types.length === 1 ? types[0] : 'Anniversary';
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
  ctx.state.relcalid = id;
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
    const title = makeCalendarTitle(query);
    const readable = ctx.body = new Readable();
    const relcalid = ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null;
    eventsToIcalendarStream(readable, events, {yahrzeit: true, title, relcalid});
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const ical = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = ical;
  }
}

/**
 * @param {any} query
 * @return {string}
 */
function makeCalendarTitle(query) {
  const names = Object.entries(query)
      .filter(([k, val]) => k[0] == 'n' && isNumKey(k))
      .map((x) => x[1]);
  const calendarType0 = summarizeAnniversaryTypes(query);
  let calendarType = calendarType0; // default 'Yahrzeit'
  switch (calendarType0) {
    case 'Anniversary':
      calendarType = 'Hebrew Anniversaries';
      break;
    case 'Birthday':
      calendarType = 'Hebrew Birthdays';
      break;
    default:
      break;
  }
  let title = calendarType;
  if (names.length > 0) {
    title += ': ' + names.join(', ');
  }
  if (title.length > 64) {
    title = title.substring(0, 61) + '...';
  }
  return title;
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
