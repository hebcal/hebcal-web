import {HebrewCalendar, Locale, HDate} from '@hebcal/core';
import {makeHebcalOptions} from './common';
import '@hebcal/locales';

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 */
export async function frigdeShabbat(ctx) {
  const query = ctx.request.query;
  let location;
  try {
    location = getLocationFromQuery(ctx.db, query, false);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const hyear = +query.year || new HDate().getFullYear();
  const options = {
    year: hyear,
    isHebrewYear: true,
    noHolidays: true,
    sedrot: true,
    candlelighting: true,
    location: location,
  };
  const events = HebrewCalendar.calendar(options);
  const cityDescr = location.getName();
  const title = `Refrigerator Shabbos Times for ${cityDescr} - ${hyear} | Hebcal`;
  let fontFamily = 'Open Sans';
  let fontList = 'Open+Sans:300,600|Open+Sans+Condensed:300';
  if (Locale.getLocaleName() == 'he') {
    fontFamily = 'Alef';
    fontList += '|Alef|Alef:700';
  }
  let html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${title}</title>
<link href='/i/normalize-8.0.1.min.css' rel='stylesheet' type='text/css'>
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
`;
  const gregYear1 = events[0].getDate().greg().getFullYear();
  const gregYear2 = events[events.length - 1].getDate().greg().getFullYear();
  const shortCity = location.getShortName();
  html += `<h3>Candle Lighting Times for ${shortCity}
<br>Hebrew Year ${hyear} (${gregYear1} - ${gregYear2})</h3>
<p style="margin:0 0 4px">www.hebcal.com</p>`;
}
