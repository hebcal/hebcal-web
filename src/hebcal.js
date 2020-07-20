/* eslint-disable require-jsdoc */
import {getLocationFromQuery, processCookieAndQuery} from './common';
import {HDate} from '@hebcal/core';

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
  if (q.year === 'now') {
    q.year = q.yt === 'H' ? new HDate().getFullYear() : new Date().getFullYear();
  }
  let location;
  try {
    location = getLocationFromQuery(ctx.db, q, q.i === 'on');
    if (location) {
      q['city-typeahead'] = location.getName();
      if (location.getIsrael()) {
        q.i = 'on';
      }
    }
  } catch (err) {
  }
  await ctx.render('hebcal-form', {
    q,
    location,
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
