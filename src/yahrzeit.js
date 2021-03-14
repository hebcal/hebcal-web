import {HebrewCalendar, HDate, Event, flags, months, Locale} from '@hebcal/core';
import {eventsToIcalendar} from '@hebcal/icalendar';
import {eventsToCsv, eventsToClassicApi} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {basename} from 'path';
import {empty, getIpAddress, clipboardScript, tooltipScript} from './common';
import {ulid} from 'ulid';
import {getMaxYahrzeitId, getYahrzeitDetailsFromDb, getYahrzeitDetailForId,
  isNumKey, summarizeAnniversaryTypes} from './common2';
import etag from 'etag';

const urlPrefix = process.env.NODE_ENV == 'production' ? 'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {*} ctx
 * @return {*}
 */
async function makeQuery(ctx) {
  ctx.state.ulid = '';
  const rpath = ctx.request.path;
  if (rpath.startsWith('/yahrzeit/edit/')) {
    const id = ctx.state.ulid = basename(rpath);
    const db = ctx.mysql;
    const sql = 'SELECT contents FROM yahrzeit WHERE id = ?';
    const results = await db.query(sql, id);
    if (results && results[0]) {
      return results[0].contents;
    } else {
      ctx.throw(404, `Not found: ${id}`);
    }
  }
  const defaults = (ctx.request.body && ctx.request.body.v === 'yahrzeit') ? {} : {
    hebdate: 'on',
    yizkor: 'off',
    years: 20,
  };
  return Object.assign(defaults, ctx.request.body, ctx.request.query);
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitApp(ctx) {
  const q = ctx.state.q = await makeQuery(ctx);
  const maxId = ctx.state.maxId = getMaxYahrzeitId(q);
  if (maxId > 0 && q.cfg === 'json') {
    ctx.body = renderJson(maxId, q);
    return;
  }
  const count = Math.max(+q.count || 1, maxId);
  ctx.state.adarInfo = false;
  if (maxId > 0) {
    const id = q.ulid || ctx.state.ulid || ulid().toLowerCase();
    q.ulid = ctx.state.ulid = id;
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
  return '<div class="row gy-1 gx-2 mb-3 align-items-center mt-1"><div class="col-auto form-floating">'+
  '<input class="form-control" type="text" name="n'+n+'" id="n'+n+'" placeholder="Name (optional)">'+
  '<label class="form-label" for="n<%=num%>">Name (optional)</label></div>'+
  '<div class="col-auto form-floating"><select name="t'+n+'" id="t'+n+'" class="form-select">'+
  '<option>Yahrzeit</option><option>Birthday</option><option>Anniversary</option></select>'+
  '<label class="form-label" for="t<%=num%>">Type</label></div>'+
  '<div class="col-auto form-floating">'+
  '<input class="form-control" type="text" name="d'+n+'" id="d'+n+'" size="2" maxlength="2" max="31" min="1" pattern="\\\\d*" placeholder="Day">'+
  '<label class="form-label" for="d<%=num%>">Day</label></div>'+
  '<div class="col-auto form-floating"><select name="m'+n+'" id="m'+n+'" class="form-select">'+
  '<option value="1">January</option><option value="2">February</option><option value="3">March</option>'+
  '<option value="4">April</option><option value="5">May</option><option value="6">June</option>'+
  '<option value="7">July</option><option value="8">August</option><option value="9">September</option>'+
  '<option value="10">October</option><option value="11">November</option><option value="12">December</option>'+
  '</select>'+
  '<label class="form-label" for="m<%=num%>">Month</label></div>'+
  '<div class="col-auto form-floating">'+
  '<input class="form-control" type="text" name="y'+n+'" id="y'+n+'" size="4" maxlength="4" pattern="\\\\d*" placeholder="Year">'+
  '<label class="form-label" for="y<%=num%>">Year</label></div>'+
  '<div class="col-auto form-check m-2">'+
  '<input class="form-check-input" type="radio" name="s'+n+'" id="s'+n+'-0" checked="" value="off">'+
  '<label class="form-check-label" for="s'+n+'-0">Before sunset</label></div>'+
  '<div class="col-auto form-check">'+
  '<input class="form-check-input" type="radio" name="s'+n+'" id="s'+n+'-1" value="on">'+
  '<label class="form-check-label" for="s'+n+'-1">After sunset</label></div></div>';
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
function renderJson(maxId, q) {
  delete q.ulid;
  const events = makeYahrzeitEvents(maxId, q);
  const results = eventsToClassicApi(events, {}, false);
  for (const item of results.items) {
    delete item.hebrew;
    delete item.category;
    if (typeof item.memo === 'string') {
      item.memo = item.memo.replace(/\\n/g, '\n');
    }
  }
  results.title = makeCalendarTitle(q);
  delete results.location;
  return results;
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
  const db = ctx.mysql;
  const id = ctx.state.ulid;
  const ip = getIpAddress(ctx);
  const sql = 'REPLACE INTO yahrzeit (id, created, ip, contents) VALUES (?, NOW(), ?, ?)';
  q.v = 'yahrzeit';
  delete q.ulid;
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
    ics1year: dlhref + '.ics?dl=1',
    subical: subical,
    webcal: subical.replace(/^https/, 'webcal'),
    gcal: encodeURIComponent(subical.replace(/^https/, 'http')),
    csv_usa: dlhref + usaCSV + '?dl=1',
    csv_eur: dlhref + eurCSV + '?euro=1&dl=1',
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
  const db = ctx.mysql;
  const id = ctx.state.ulid = ctx.request.path.substring(4, 30);
  const obj = await getYahrzeitDetailsFromDb(ctx, db, id);
  ctx.state.relcalid = id;
  await db.close();
  return obj;
}

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function yahrzeitDownload(ctx) {
  if (ctx.method === 'POST') {
    ctx.set('Allow', 'GET');
    ctx.throw(405, 'POST not allowed; try using GET instead');
  }
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
  query.startYear = new HDate().getFullYear();
  ctx.response.etag = etag(JSON.stringify(query), {weak: true});
  ctx.lastModified = details.lastModified || ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
  const maxId = getMaxYahrzeitId(query);
  if (ctx.state.ulid) {
    query.ulid = ctx.state.ulid;
  }
  const events = makeYahrzeitEvents(maxId, query);
  if (events.length === 0) {
    ctx.throw(400, 'No events');
  }
  const extension = rpath.substring(rpath.length - 4);
  if (query.dl == '1') {
    ctx.response.attachment(basename(rpath));
  }
  if (extension == '.ics') {
    const title = makeCalendarTitle(query);
    const relcalid = ctx.state.relcalid ? `hebcal-${ctx.state.relcalid}` : null;
    ctx.response.type = 'text/calendar; charset=utf-8';
    ctx.body = await eventsToIcalendar(events, {yahrzeit: true, title, relcalid});
  } else if (extension == '.csv') {
    const euro = Boolean(query.euro);
    const csv = eventsToCsv(events, {euro});
    ctx.response.type = 'text/x-csv; charset=utf-8';
    ctx.body = csv;
  }
}

/**
 * @param {any} query
 * @return {string}
 */
function makeCalendarTitle(query) {
  const names = Object.entries(query)
      .filter(([k, val]) => k[0] == 'n' && isNumKey(k))
      .map((x) => x[1])
      .filter((str) => str.length > 0);
  const calendarType = summarizeAnniversaryTypes(query, true);
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
function getEventsForId(query, id, startYear, endYear) {
  const events = [];
  const info = getYahrzeitDetailForId(query, id);
  if (info === null) {
    return events;
  }
  const type = info.type;
  const name = info.name;
  const day = info.day;
  const urlPrefix = query.ulid ? `https://www.hebcal.com/yahrzeit/edit/${query.ulid}` : null;
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
      if (query.hebdate === 'on') {
        const comma = hebdate.indexOf(',');
        subj += ' (' + hebdate.substring(0, comma) + ')';
      }
      const ev = new Event(hd, subj, flags.USER_EVENT);
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
      events.push(ev);
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
