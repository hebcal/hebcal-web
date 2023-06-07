import dayjs from 'dayjs';
import {isoDateStringToDate, localeMap, httpRedirect} from './common';
import {basename} from 'path';
import {HDate, HebrewCalendar, months, OmerEvent, Locale} from '@hebcal/core';
import {getLeyningOnDate, makeLeyningParts} from '@hebcal/leyning';
import {makeLeyningHtmlFromParts} from './parshaCommon';

const currentYear = new Date().getFullYear();

// eslint-disable-next-line require-jsdoc
export function dailyLearningApp(ctx) {
  const rpath = ctx.request.path;
  if (rpath === '/learning/' || rpath === '/learning') {
    let d = dayjs();
    if (d.hour() > 19) {
      d = d.add(1, 'day');
    }
    ctx.set('Cache-Control', 'private, max-age=3600');
    httpRedirect(ctx, `/learning/${d.format('YYYY-MM-DD')}`, 302);
    return;
  } else if (rpath === '/learning/sitemap.txt') {
    const prefix = 'https://www.hebcal.com/learning';
    let body = '';
    for (let i = -1; i < 4; i++) {
      const year = currentYear + i;
      const startD = dayjs(new Date(year, 0, 1));
      const endD = dayjs(new Date(year + 1, 0, 1));
      for (let d = startD; d.isBefore(endD); d = d.add(1, 'day')) {
        body += prefix + '/' + d.format('YYYY-MM-DD') + '\n';
      }
    }
    ctx.lastModified = ctx.launchDate;
    ctx.type = 'text/plain';
    ctx.body = body;
    return;
  }
  const dt = isoDateStringToDate(basename(rpath));
  ctx.lastModified = ctx.launchDate;
  ctx.status = 200;
  if (ctx.fresh) {
    ctx.status = 304;
    return;
  }
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
      psalms: true,
      rambam1: true,
      yerushalmi: true,
      chofetzChaim: true,
      shemiratHaLashon: true,
    },
  });

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  switch (hd.getMonth()) {
    case months.NISAN:
    case months.IYYAR:
    case months.SIVAN:
      const beginOmer = HDate.hebrew2abs(hd.getFullYear(), months.NISAN, 16);
      const abs = hd.abs();
      if (abs >= beginOmer && abs < (beginOmer + 49)) {
        const omer = abs - beginOmer + 1;
        holidays.push(new OmerEvent(hd, omer));
      }
      break;
    default:
      break;
  }

  const items0 = [];
  const readings = getLeyningOnDate(hd, il, true);
  for (const reading of readings) {
    const prefix = reading.weekday ? 'Weekday Torah reading' :
      reading.fullkriyah && typeof reading.parshaNum === 'number' ? 'Shabbat Torah reading' :
      reading.fullkriyah ? 'Holiday Torah reading' :
      reading.megillah ? 'Megillah' : 'Reading';
    const category = reading.name.en.startsWith('Rosh Chodesh ') ?
      'Rosh Chodesh Torah reading' :
      prefix + ': ' + Locale.gettext(reading.name.en, lg);
    const item = {category};
    const aliyot = reading.fullkriyah || reading.weekday || reading.megillah;
    if (reading.summaryParts) {
      item.html = makeLeyningHtmlFromParts(reading.summaryParts);
    } else if (aliyot) {
      const parts = makeLeyningParts(aliyot);
      item.html = makeLeyningHtmlFromParts(parts);
    }
    if (reading.haft) {
      item.haftaraHtml = makeLeyningHtmlFromParts(reading.haft);
    }
    items0.push(item);
  }

  const items = events.map((ev) => {
    return {
      category: getCategory(ev),
      title: ev.renderBrief(lg),
      url: ev.url(),
    };
  });
  items.unshift(...items0);

  return ctx.render('dailyLearning', {
    d,
    hd,
    lg: lg,
    locale: localeMap[lg] || 'en',
    prev: d.subtract(1, 'day'),
    next: d.add(1, 'day'),
    items,
    holidays,
    currentYear,
  });
}

/**
 * @param {Event} ev
 * @return {string}
 */
function getCategory(ev) {
  const cats = ev.getCategories();
  switch (cats[0]) {
    case 'dafyomi': return 'Daf Yomi (Babylonian Talmud)';
    case 'mishnayomi': return 'Mishna Yomi';
    case 'nachyomi': return 'Nach Yomi';
    case 'dailyPsalms': return 'Daily Tehillim (Psalms)';
    case 'chofetzChaim': return 'Sefer Chofetz Chaim';
    case 'shemiratHaLashon': return 'Shemirat HaLashon';
    case 'dailyRambam1': return 'Daily Rambam (Mishneh Torah)';
    case 'yerushalmi': return 'Yerushalmi Yomi (Jerusalem Talmud)';
    case 'parashat': return 'Torah portion';
    default: return '';
  }
}
