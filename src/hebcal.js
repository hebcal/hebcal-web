/* eslint-disable require-jsdoc */
import {makeHebcalOptions, processCookieAndQuery} from './common';
import {HebrewCalendar} from '@hebcal/core';
import {eventsToClassicApi, eventToFullCalendar} from '@hebcal/rest-api';
import dayjs from 'dayjs';

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
  geo: 'geoname',
  b: 18,
  M: 'on',
};

export async function hebcalApp(ctx) {
  const cookie = ctx.cookies.get('C');
  const q = (ctx.request.querystring.length === 0 && !cookie) ? hebcalFormDefaults :
    ctx.request.query.v === '1' ? ctx.request.query :
    processCookieAndQuery(cookie, hebcalFormDefaults, ctx.request.query);
  let error;
  let options;
  try {
    options = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    error = err;
  }
  if (options.il) {
    q.i = 'on';
  }
  if (options.location) {
    q['city-typeahead'] = options.location.getName();
  }
  if (q.year === 'now') {
    q.year = options.year;
  }
  if (q.cfg === 'json') {
    ctx.set('Cache-Control', 'max-age=86400');
    const events = HebrewCalendar.calendar(options);
    // console.log(options);
    // console.log(events);
    let obj = eventsToClassicApi(events, options);
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
  } else if (q.cfg === 'fc') {
    options.start = new Date(q.start);
    options.end = new Date(q.end);
    const events = HebrewCalendar.calendar(options);
    const location = options.location;
    const tzid = location ? location.getTzid() : 'UTC';
    ctx.body = events.map((ev) => eventToFullCalendar(ev, tzid, options.il));
  } else if (q.cfg === 'e' || q.cfg === 'e2') {
    options.numYears = 2;
    const events = HebrewCalendar.calendar(options);
    if (q.cfg === 'e') {
      const strs = events.map((ev) => {
        const d = dayjs(ev.getDate().greg());
        const fmtDt = d.format('YYYYMMDD');
        const desc = ev.render();
        const url = ev.url() || '';
        return `DefineEvent(${fmtDt},"${desc}","${url}","",0,0);`;
      });
      ctx.body = strs.join('\n');
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
      ctx.body = 'if(typeof HEBCAL=="undefined"||!HEBCAL){var HEBCAL={};}\nHEBCAL.eraw=[\n' +
        strs.join(',') + `];
HEBCAL.jec2events=HEBCAL.eraw.map(function(e){
  var f={eventDate:e.d,eventDescription:e.s};
  if(e.u){f.eventLink=e.u}
  return f;
});
`;
    }
  } else {
    return ctx.render('hebcal-form', {
      q,
      location: options.location,
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
}
