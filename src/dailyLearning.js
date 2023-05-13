import dayjs from 'dayjs';
import {isoDateStringToDate, localeMap} from './common';
import {basename} from 'path';
import {HDate, HebrewCalendar} from '@hebcal/core';
import {getLeyningOnDate, makeLeyningParts} from '@hebcal/leyning';
import {makeLeyningHtmlFromParts} from './parshaCommon';

const FUTURE_100_YEARS = new Date().getFullYear() + 100;
// const CACHE_CONTROL_30DAYS = cacheControl(30);
// const CACHE_CONTROL_1_YEAR = cacheControl(365);

// eslint-disable-next-line require-jsdoc
export function dailyLearningApp(ctx) {
  const rpath = ctx.request.path;
  if (rpath === '/learning/sitemap.txt') {
    const prefix = 'https://www.hebcal.com/learning';
    let body = '';
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 3; i++) {
      const year = currentYear + i;
      const startD = dayjs(new Date(year, 0, 1));
      const endD = dayjs(new Date(year + 1, 0, 1));
      for (let d = startD; d.isBefore(endD); d = d.add(1, 'day')) {
        body += prefix + '/' + d.format('YYYY-MM-DD') + '\n';
      }
    }
    ctx.lastModified = ctx.launchDate;
    // ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
    ctx.type = 'text/plain';
    ctx.body = body;
    return;
  }
  const dt = isoDateStringToDate(basename(rpath));
  const hd = new HDate(dt);
  const d = dayjs(dt);
  const q = ctx.request.query;
  const il = q.i === 'on';
  const lg = q.lg || 's';
  const events = HebrewCalendar.calendar({
    start: dt,
    end: dt,
    il,
    locale: lg,
    noHolidays: true,
    dailyLearning: {
      dafYomi: true,
      mishnaYomi: true,
      nachYomi: true,
      chofetzChaim: true,
      shemiratHaLashon: true,
      rambam1: true,
      yerushalmi: true,
    },
  });

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];

  const readings = getLeyningOnDate(hd, il, true);
  for (const reading of readings) {
    const aliyot = reading.fullkriyah || reading.weekday || reading.megillah;
    if (reading.summaryParts) {
      reading.html = makeLeyningHtmlFromParts(reading.summaryParts);
    } else if (aliyot) {
      const parts = makeLeyningParts(aliyot);
      reading.html = makeLeyningHtmlFromParts(parts);
    }
    if (reading.haft) {
      reading.haftaraHtml = makeLeyningHtmlFromParts(reading.haft);
    }
    if (reading.seph) {
      reading.sephardicHtml = makeLeyningHtmlFromParts(reading.seph);
    }
  }

  const items = events.map((ev) => {
    return {
      prefix: prefix(ev),
      title: ev.renderBrief(lg),
      url: ev.url(),
    };
  });
  ctx.lastModified = ctx.launchDate;
  // ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  return ctx.render('dailyLearning', {
    d,
    hd,
    lg: lg,
    locale: localeMap[lg] || 'en',
    prev: d.subtract(1, 'day'),
    next: d.add(1, 'day'),
    items,
    holidays,
    readings,
    FUTURE_100_YEARS,
  });
}

/**
 * @param {Event} ev
 * @return {string}
 */
function prefix(ev) {
  const cats = ev.getCategories();
  switch (cats[0]) {
    case 'dafyomi': return 'Daf Yomi';
    case 'mishnayomi': return 'Mishna Yomi';
    case 'nachyomi': return 'Nach Yomi';
    case 'chofetzChaim': return 'Sefer Chofetz Chaim';
    case 'shemiratHaLashon': return 'Shemirat HaLashon';
    case 'dailyRambam1': return 'Daily Rambam (Mishneh Torah)';
    case 'yerushalmi': return 'Yerushalmi Yomi';
    case 'parashat': return 'Torah portion';
    default: return '';
  }
}
