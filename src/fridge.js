import {HebrewCalendar, Locale, HDate, flags, months} from '@hebcal/core';
import {makeHebcalOptions} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function fridgeShabbat(ctx) {
  const query = Object.assign({c: 'on', maj: 'on', s: 'on'}, ctx.request.query);
  let options;
  try {
    options = makeHebcalOptions(ctx.db, query);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const location = options.location;
  if (!location) {
    ctx.throw(400, 'Location required: geonameid, zip, city');
  }
  const hyear = +query.year || new HDate().getFullYear();
  options.start = new HDate(1, months.TISHREI, hyear).abs() - 1;
  options.end = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  const events = HebrewCalendar.calendar(options).filter((ev) => {
    const desc = ev.getDesc();
    return desc != 'Havdalah' && !desc.startsWith('Chanukah');
  });
  const items = makeContents(events, options);
  const itemsHtml = formatItemsAsTable(items, options);
  let fontFamily = 'Open Sans';
  let fontList = 'Open+Sans:300,600|Open+Sans+Condensed:300';
  if (Locale.getLocaleName() == 'he') {
    fontFamily = 'Alef';
    fontList += '|Alef|Alef:700';
  }
  const gregYear1 = events[0].getDate().greg().getFullYear();
  const gregYear2 = events[events.length - 1].getDate().greg().getFullYear();
  let url = '/fridge?' + (query.zip ? `zip=${query.zip}` : `geonameid=${location.getGeoId()}`);
  for (const opt of ['a', 'i', 'm', 'lg']) {
    if (query[opt]) {
      url += `&amp;${opt}=${query[opt]}`;
    }
  }
  ctx.body = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Refrigerator Shabbos Times for ${location.getName()} - ${hyear} | Hebcal</title>
<link href='https://www.hebcal.com/i/normalize-8.0.1.min.css' rel='stylesheet' type='text/css'>
<link href='//fonts.googleapis.com/css?family=${fontList}' rel='stylesheet' type='text/css'>
<script>
  (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
  ga('create', 'UA-967247-1', 'auto');
  ga('set', 'anonymizeIp', true);
  ga('send', 'pageview');
</script>
<style>
body {font-family: '${fontFamily}', sans-serif;}
h3 {font-weight: 600; margin:24px 0 0;}
table {border-spacing: 0; border-collapse: collapse;}
#fridge-table td {padding: 0px 4px;}
#fridge-table td.leftpad {padding: 0 0 0 12px;}
.text-right {text-align: right;}
.yomtov { font-weight:600 }
.narrow { font-family: 'Open Sans Condensed', sans-serif }
@media print{
 a[href]:after{content:""}
 .sidebar-nav{display:none}
 .goto {display:none}
}
</style>
</head>
<body>
<div align="center">
<h3>${Locale.gettext('Candle lighting')} times for ${location.getShortName()}
<br>Hebrew Year ${hyear} (${gregYear1} - ${gregYear2})</h3>
<p style="margin:0 0 4px">www.hebcal.com</p>
<table style="width:524px" id="fridge-table">
<colgroup>
<col><col><col><col>
<col>
<col style="border-left:1px solid #999"><col><col><col>
</colgroup>
<tbody>
${itemsHtml}
</tbody></table>
<p><a class="goto" title="Previous" rel="nofollow"
href="${url}&amp;year=${hyear - 1}">&larr;&nbsp;${hyear - 1}</a>&nbsp;&nbsp;&nbsp;Times
in <strong>bold</strong> indicate holidays.&nbsp;&nbsp;&nbsp;<a class="goto" title="Next"
href="${url}&amp;year=${hyear + 1}" rel="nofollow">${hyear + 1}&nbsp;&rarr;</a></p>
</div><!-- align=center -->
</body>
</html>
`;
}

/**
 * @param {Event[]} events
 * @param {HebrewCalendar.Options} options
 * @return {any[]}
 */
function makeContents(events, options) {
  const objs = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.getDesc() != 'Candle lighting') {
      continue;
    }
    const hd = ev.getDate();
    const attrs = ev.getAttrs();
    const d = dayjs(hd.greg());
    const item = {
      date: d,
      time: HebrewCalendar.reformatTimeStr(attrs.eventTimeStr, '', options),
    };
    if (i == events.length - 1) {
      item.reason = Locale.gettext('Rosh Hashana');
      item.yomtov = true;
      objs.push(item);
      return objs;
    }
    if (d.day() == 5) {
      const parshaEv = events.slice(i + 1).find((ev) => ev.getFlags() & flags.PARSHA_HASHAVUA);
      if (parshaEv && parshaEv.getDate().isSameDate(hd.next())) {
        const parsha = parshaEv.render();
        const space = parsha.indexOf(' ');
        item.reason = parsha.substring(space + 1);
        objs.push(item);
        continue;
      }
    }
    if (attrs.linkedEvent && attrs.linkedEvent.getDesc().startsWith('Chanukah')) {
      continue;
    }
    const nextEv = events[i + 1];
    item.reason = Locale.gettext(nextEv.basename());
    item.yomtov = Boolean(nextEv.getFlags() & flags.CHAG);
    objs.push(item);
  }
  return objs;
}

/**
 * @param {any[]} items
 * @return {string}
 */
function formatItemsAsTable(items) {
  const half = Math.ceil(items.length / 2);
  let html = '';
  for (let i = 0; i < half; i++) {
    html += '<tr>' + row(items[i], false) + '\n<td></td>\n';
    html += row(items[i + half], true) + '</tr>\n';
  }
  return html;
}

/**
 * @param {any} item
 * @param {boolean} right
 * @return {string}
 */
function row(item, right) {
  if (!item) {
    return '<td></td><td></td><td></td><td></td>';
  }
  const cl = [];
  if (item.yomtov) {
    cl.push('yomtov');
  }
  const narrow = [];
  const lang = Locale.getLocaleName();
  const subj = item.reason;
  if (lang == 'he') {
    narrow.push('text-right');
  } else if (subj.length > 14) {
    narrow.push('narrow');
  }
  const monthClass = cl.slice();
  const timeClass = cl.slice();
  timeClass.push('text-right');
  if (right) {
    monthClass.push('leftpad');
  }
  return td(monthClass, item.date.format('MMM')) +
    td(cl.concat(['text-right']), item.date.format('D')) +
    td(cl.concat(narrow), subj) +
    td(timeClass, item.time);
}

/**
 * @param {string[]} arr
 * @param {string} str
 * @return {string}
 */
function td(arr, str) {
  let s = arr.length ? ('<td class="' + arr.join(' ') + '">') : '<td>';
  s += str;
  s += '</td>';
  return s;
}
