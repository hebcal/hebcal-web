import dayjs from 'dayjs';
import {checkFreshETag} from './etag.js';
import {httpRedirect} from './common.js';
import {CACHE_CONTROL_30DAYS} from './cacheControl.js';
import {localeMap} from './lang.js';
import {queryLongDescr, dailyLearningConfig} from './urlArgs.js';
import {isoDateStringToDate} from './dateUtil.js';
import {basename} from 'node:path';
import {HDate, calendar, months, OmerEvent, Locale, getHolidaysOnDate} from '@hebcal/core';
import {getLeyningOnDate, makeLeyningParts} from '@hebcal/leyning';
import {makeLeyningHtmlFromParts} from './parshaCommon.js';
import {makeAnchor} from '@hebcal/rest-api';
import {makeDownloadProps, useStaticIcalFeed} from './makeDownloadProps.js';
import '@hebcal/learning';

/**
 * URL slug for a daily learning calendar page, `/learning/<slug>`.
 * Uses the static feed name where there is one so the page and the
 * download.hebcal.com/ical/ feed share a name.
 * @param {any} cfg entry from dailyLearningConfig.json
 * @return {string}
 */
export function learningPageSlug(cfg) {
  return cfg.downloadSlug || makeAnchor(cfg.settingsName);
}

/** Every config entry backed by a `DailyLearning` schedule, by page slug */
const slugToCfg = new Map();
for (const cfg of dailyLearningConfig) {
  if (cfg.dailyLearningOptName) {
    slugToCfg.set(learningPageSlug(cfg), cfg);
  }
}

export function dailyLearningApp(ctx) {
  const rpath = ctx.request.path;
  if (rpath === '/learning/' || rpath === '/learning') {
    let d = dayjs();
    if (d.hour() > 19) {
      d = d.add(1, 'day');
    }
    ctx.set('Cache-Control', 'private, max-age=1200');
    httpRedirect(ctx, `/learning/${d.format('YYYY-MM-DD')}`, 302);
    return;
  }
  if (rpath === '/learning/sitemap.txt') {
    dailyLearningSitemap(ctx);
    return;
  }
  const slugCfg = slugToCfg.get(basename(rpath));
  if (slugCfg) {
    return dailyLearningCalendar(ctx, slugCfg);
  }
  // let this 400 if URL contains invalid date
  const dt = isoDateStringToDate(basename(rpath));
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  if (checkFreshETag(ctx, {}, {})) {
    return;
  }
  const hd = new HDate(dt);
  const d = dayjs(dt);
  const q = ctx.request.query;
  const il = q.i === 'on';
  const lg = q.lg || 's';
  const dlOpts = {};
  const cat2cfg = {};
  for (const cfg of dailyLearningConfig) {
    cat2cfg[cfg.eventCategory] = cfg;
    const key = cfg.dailyLearningOptOverride || cfg.dailyLearningOptName;
    if (key) {
      dlOpts[key] = true;
    }
  }
  const events = calendar({
    start: dt,
    end: dt,
    il,
    locale: lg,
    noHolidays: true,
    dailyLearning: dlOpts,
  });

  const holidays = getHolidaysOnDate(hd, il) || [];
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
    const isShabbatParsha = reading.fullkriyah && reading.parshaNum !== undefined;
    const prefix = isWeekday ? 'Weekday Torah reading' :
      isShabbatParsha ? 'Shabbat Torah reading' :
      reading.fullkriyah ? 'Holiday Torah reading' :
      reading.megillah ? 'Megillah' : 'Reading';
    const category = reading.name.en.startsWith('Rosh Chodesh ') ?
      'Rosh Chodesh Torah reading' :
      prefix + ': ' + Locale.gettext(reading.name.en, lg);
    const item = {
      id: makeAnchor(prefix),
      category,
      group: 'Tanakh',
    };
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
    const cfg = cat2cfg[categoryName];
    const flag = cfg.queryParam;
    const desc = queryLongDescr[flag];
    return {
      id: categoryName,
      calUrl: cfg.dailyLearningOptName ? '/learning/' + learningPageSlug(cfg) : undefined,
      category: cfg.shortName,
      basename: cfg.downloadSlug,
      group: cfg.group,
      flag,
      desc,
      title: ev.renderBrief(lg),
      url: ev.url(),
      event: ev,
    };
  });
  items.unshift(...items0);

  const currentYear = new Date().getFullYear();
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

/**
 * Month-view FullCalendar page for one daily learning schedule. The events
 * are computed in the browser by client-daily-learning.js; the server only
 * renders the page chrome and the download modal.
 * @param {import('koa').ParameterizedContext} ctx
 * @param {any} cfg entry from dailyLearningConfig.json
 */
async function dailyLearningCalendar(ctx, cfg) {
  const q = ctx.request.query;
  const il = q.i === 'on';
  const slug = learningPageSlug(cfg);
  const year = new Date().getFullYear();
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  if (checkFreshETag(ctx, {il}, {slug, year})) {
    return;
  }
  const q0 = {
    v: '1',
    [cfg.queryParam]: 'on',
    i: il ? 'on' : 'off',
    year: String(year),
    yt: 'G',
    ny: cfg.years,
    emoji: '0',
  };
  makeDownloadProps(ctx, q0, {year}, cfg.years);
  if (cfg.downloadSlug) {
    useStaticIcalFeed(ctx, cfg.downloadSlug);
  }
  ctx.state.url.title = cfg.shortName;
  await ctx.render('dailyLearningCalendar', {
    cfg,
    slug,
    il,
    schedule: cfg.dailyLearningOptName,
    // Not every config entry has a descLong (e.g. Perek Yomi)
    desc: cfg.descLong || cfg.descMedium,
    emojiSwitchDisabled: true,
  });
}

function dailyLearningSitemap(ctx) {
  const sunday = dayjs().day(0);
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  const slugs = Array.from(slugToCfg.keys());
  if (checkFreshETag(ctx, {}, {
    sunday: sunday.format('YYYY-MM-DD'),
    slugs: slugs.join(),
  })) {
    return;
  }
  const prefix = 'https://www.hebcal.com/learning';
  let body = '';
  for (const slug of slugs) {
    body += prefix + '/' + slug + '\n';
  }
  const startD = sunday.subtract(2, 'week');
  const endD = sunday.add(78, 'week');
  for (let d = startD; !d.isAfter(endD); d = d.add(1, 'day')) {
    body += prefix + '/' + d.format('YYYY-MM-DD') + '\n';
  }
  ctx.type = 'text/plain';
  ctx.body = body;
}
