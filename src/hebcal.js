/* eslint-disable require-jsdoc */
import {makeHebcalOptions, processCookieAndQuery, possiblySetCookie, empty} from './common';
import {HebrewCalendar, greg} from '@hebcal/core';
import {eventsToClassicApi, eventToFullCalendar} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hu';
import 'dayjs/locale/pl';
import 'dayjs/locale/ru';

dayjs.extend(localeData);

const hebcalFormDefaults = {
  maj: 'on',
  min: 'on',
  nx: 'on',
  mf: 'on',
  ss: 'on',
  mod: 'on',
  i: 'off',
  F: 'off',
  d: 'off',
  D: 'off',
  s: 'off',
  year: 'now',
  yt: 'G',
  lg: 's',
  b: 18,
  M: 'on',
};

export async function hebcalApp(ctx) {
  const cookie = ctx.cookies.get('C');
  const q = (ctx.request.querystring.length === 0 && !cookie) ? hebcalFormDefaults :
    ctx.request.query.v === '1' ? ctx.request.query :
    processCookieAndQuery(cookie, hebcalFormDefaults, ctx.request.query);
  let error;
  let options = {};
  try {
    options = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    error = err;
    delete q.v;
  }
  if (options.il) {
    q.i = 'on';
  }
  if (options.location) {
    q['city-typeahead'] = options.location.getName();
    ctx.state.location = options.location;
  }
  if (q.year === 'now') {
    q.year = options.year;
  }
  ctx.state.q = q;
  ctx.state.options = options;
  if (q.cfg === 'json') {
    renderJson(ctx);
  } else if (q.cfg === 'fc') {
    renderFullCalendar(ctx);
  } else if (q.cfg === 'e' || q.cfg === 'e2') {
    ctx.body = renderLegacyJavascript(ctx);
  } else {
    if (q.v === '1') {
      return renderHtml(ctx);
    } else {
      return renderForm(error, ctx);
    }
  }
}

function renderForm(error, ctx) {
  const message = error ? error.message : undefined;
  const cookie = ctx.cookies.get('C');
  if (ctx.request.querystring.length === 0 && cookie && cookie.length) {
    // private cache only if we're tailoring results by cookie
    ctx.set('Cache-Control', 'private');
  }
  return ctx.render('hebcal-form', {
    message,
    title: 'Custom Calendar | Hebcal Jewish Calendar',
    xtra_html: `<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/typeahead.js/0.10.4/typeahead.bundle.min.js"></script>
<script src="https://www.hebcal.com/i/hebcal-app-1.9.min.js"></script>
<script>
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
var tooltipList = tooltipTriggerList.map(function (el) {
return new bootstrap.Tooltip(el);
});
window['hebcal'].createCityTypeahead(false);
</script>`,
  });
}

const localeMap = {
  'fi': 'fi',
  'fr': 'fr',
  'he': 'he',
  'hu': 'hu',
  'h': 'he',
  'pl': 'pl',
  'ru': 'ru',
};

function renderHtml(ctx) {
  const options = ctx.state.options;
  const locationName = ctx.state.location ? ctx.state.location.getName() : options.il ? 'Israel' : 'Diaspora';
  let shortTitle = 'Jewish Calendar ';
  if (options.month) {
    shortTitle += greg.monthNames[options.month] + ' ';
  }
  shortTitle += options.year;
  const events = HebrewCalendar.calendar(options);
  const result = eventsToClassicApi(events, options);
  for (const item of result.items) {
    delete item.leyning;
  }
  const q = ctx.state.q;
  if (q.set !== 'off') {
    possiblySetCookie(ctx, q);
  }
  const locale = localeMap[options.locale] || 'en';
  const localeData = dayjs().locale(locale).localeData();
  return ctx.render('hebcal-results', {
    items: result.items,
    cconfig: JSON.stringify(Object.assign({geo: q.geo || 'none'}, result.location)),
    dates: makeMonthlyDates(events),
    locale,
    weekdaysShort: localeData.weekdaysShort(),
    prevUrl: '',
    prevTitle: options.year - 1,
    nextUrl: '',
    nextTitle: options.year + 1,
    shortTitle,
    locationName,
    title: shortTitle + ' ' + locationName + ' | Hebcal Jewish Calendar',
  });
}

/**
 * Returns an array of dayjs objects for every month (including blanks) in the range
 * @param {Event[]} events
 * @return {dayjs.Dayjs[]}
 */
function makeMonthlyDates(events) {
  const startDate = dayjs(events[0].getDate().greg());
  const endDate = dayjs(events[events.length - 1].getDate().greg());
  const start = startDate.set('date', 1);
  const result = [];
  for (let d = start; d.isBefore(endDate); d = d.add(1, 'month')) {
    result.push(d);
  }
  return result;
}

function renderFullCalendar(ctx) {
  const q = ctx.state.q;
  for (const param of ['start', 'end']) {
    if (empty(q[param])) {
      ctx.throw(400, `Please specify required parameter '${param}'`);
    }
    const re = /^\d\d\d\d-\d\d-\d\d/;
    if (!re.test(q[param])) {
      ctx.throw(400, `Parameter '${param}' must match format YYYY-MM-DD`);
    }
  }
  const options = ctx.state.options;
  options.start = new Date(q.start);
  options.end = new Date(q.end);
  const events = HebrewCalendar.calendar(options);
  const location = options.location;
  const tzid = location ? location.getTzid() : 'UTC';
  ctx.body = events.map((ev) => eventToFullCalendar(ev, tzid, options.il));
}

function renderJson(ctx) {
  ctx.set('Cache-Control', 'max-age=86400');
  const events = HebrewCalendar.calendar(ctx.state.options);
  let obj = eventsToClassicApi(events, ctx.state.options);
  const q = ctx.state.q;
  if (q.leyning === 'off') {
    for (const item of obj.items) {
      delete item.leyning;
    }
  }
  const cb = q.callback;
  if (typeof cb === 'string' && cb.length) {
    obj = cb + '(' + JSON.stringify(obj) + ')\n';
  }
  ctx.body = obj;
}

function renderLegacyJavascript(ctx) {
  const options = ctx.state.options;
  options.numYears = 2;
  const events = HebrewCalendar.calendar(options);
  if (ctx.state.q.cfg === 'e') {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const fmtDt = d.format('YYYYMMDD');
      const desc = ev.render();
      const url = ev.url() || '';
      return `DefineEvent(${fmtDt},"${desc}","${url}","",0,0);`;
    });
    return strs.join('\n');
  } else {
    const strs = events.map((ev) => {
      const d = dayjs(ev.getDate().greg());
      const url = ev.url();
      const obj = {d: d.format('YYYYMMDD'), s: ev.render()};
      if (url) {
        obj.u = url;
      }
      return JSON.stringify(obj);
    });
    return 'if(typeof HEBCAL=="undefined"||!HEBCAL){var HEBCAL={};}\nHEBCAL.eraw=[\n' +
      strs.join(',') + `];
HEBCAL.jec2events=HEBCAL.eraw.map(function(e){
var f={eventDate:e.d,eventDescription:e.s};
if(e.u){f.eventLink=e.u}
return f;
});
`;
  }
}
