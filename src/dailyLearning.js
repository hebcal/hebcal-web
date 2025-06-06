import dayjs from 'dayjs';
import {localeMap, httpRedirect, CACHE_CONTROL_1_YEAR, queryLongDescr} from './common.js';
import {isoDateStringToDate} from './dateUtil.js';
import {basename} from 'path';
import {HDate, HebrewCalendar, months, OmerEvent, Locale} from '@hebcal/core';
import {getLeyningOnDate, makeLeyningParts} from '@hebcal/leyning';
import {makeLeyningHtmlFromParts} from './parshaCommon.js';
import {readJSON} from './readJSON.js';

const currentYear = new Date().getFullYear();
const config = readJSON('./dailyLearningConfig.json');

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
    dailyLearningSitemap(ctx);
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
  const dailyLearningOpts = {};
  for (const cfg of Object.values(config)) {
    const key = cfg.dailyLearningOptName;
    if (key) {
      dailyLearningOpts[key] = true;
    }
  }
  const events = HebrewCalendar.calendar({
    start: dt,
    end: dt,
    il,
    locale: lg,
    noHolidays: true,
    dailyLearning: dailyLearningOpts,
  });

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  const mm = hd.getMonth();
  if (mm === months.NISAN || mm === months.IYYAR || mm === months.SIVAN) {
    const beginOmer = HDate.hebrew2abs(hd.getFullYear(), months.NISAN, 16);
    const abs = hd.abs();
    if (abs >= beginOmer && abs < (beginOmer + 49)) {
      const omer = abs - beginOmer + 1;
      holidays.push(new OmerEvent(hd, omer));
    }
  }

  const items0 = [];
  const readings = getLeyningOnDate(hd, il, true);
  for (const reading of readings) {
    const isWeekday = Boolean(reading.weekday);
    const isShabbatParsha = reading.fullkriyah && typeof reading.parshaNum !== 'undefined';
    const prefix = isWeekday ? 'Weekday Torah reading' :
      isShabbatParsha ? 'Shabbat Torah reading' :
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
    if (isWeekday || isShabbatParsha) {
      item.flag = 's';
    }
    if (isWeekday) {
      item.desc = 'Three aliyot read in synagogue on Monday and Thursday morning';
    } else if (isShabbatParsha) {
      item.desc = 'Full Torah portion read in synagogue on Saturday morning';
    }
    items0.push(item);
  }

  const items = events.map((ev) => {
    const cats = ev.getCategories();
    const cat0 = cats[0];
    const categoryName = cat0 === 'yerushalmi' ? cats.join('-') : cat0;
    const cfg = config[categoryName];
    const flag = cfg.queryParam;
    const desc = queryLongDescr[flag];
    return {
      id: categoryName,
      category: cfg.shortName,
      basename: cfg.downloadSlug,
      flag,
      desc,
      title: ev.renderBrief(lg),
      url: ev.url(),
      event: ev,
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
    il,
  });
}

function dailyLearningSitemap(ctx) {
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
  ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
  ctx.type = 'text/plain';
  ctx.body = body;
}
