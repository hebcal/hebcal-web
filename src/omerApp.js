import dayjs from 'dayjs';
import {httpRedirect, CACHE_CONTROL_1_YEAR, CACHE_CONTROL_30DAYS} from './common.js';
import {getDefaultHebrewYear} from './dateUtil.js';
import {basename, dirname} from 'path';
import {HDate, months, OmerEvent, HebrewCalendar, Locale} from '@hebcal/core';
import {makeDownloadProps} from './makeDownloadProps.js';
import {getHolidayMeta} from './getHolidayMeta.js';

export async function omerApp(rpath, ctx) {
  if (rpath === '/omer/sitemap.txt') {
    const prefix = 'https://www.hebcal.com/omer';
    let body = '';
    const hyear = new HDate().getFullYear();
    for (let year = hyear - 1; year < hyear + 4; year++) {
      body += `${prefix}/${year}\n`;
      for (let day = 1; day <=49; day++) {
        body += `${prefix}/${year}/${day}\n`;
      }
    }
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', CACHE_CONTROL_1_YEAR);
    ctx.type = 'text/plain';
    ctx.body = body;
    return;
  }
  const yearStr = basename(dirname(rpath));
  if (yearStr === '') {
    return redirCurrentYear(ctx);
  } else if (yearStr === 'omer') {
    const hyear = parseInt(basename(rpath), 10);
    if (isNaN(hyear) || hyear < 3762 || hyear > 9999) {
      return redirCurrentYear(ctx);
    }
    const beginOmer = HDate.hebrew2abs(hyear, months.NISAN, 16);
    const items = Array(50);
    for (let omerDay = 1; omerDay <= 49; omerDay++) {
      const abs = beginOmer + omerDay - 1;
      const hd = new HDate(abs);
      const d = dayjs(hd.greg());
      const ev = new OmerEvent(hd, omerDay);
      items[omerDay] = {omerDay, ev, hd, d, sefira: ev.sefira('en'), he: ev.sefira('he')};
    }

    const options = {year: hyear, isHebrewYear: true};
    const q0 = {v: '1', o: 'on', year: String(hyear), yt: 'H', emoji: '0'};
    makeDownloadProps(ctx, q0, options);
    const feedUrl = '://download.hebcal.com/ical/omer.ics';
    ctx.state.url.subical = 'https' + feedUrl;
    ctx.state.url.webcal = 'webcal' + feedUrl;
    ctx.state.url.gcal = 'http' + feedUrl;
    ctx.state.url.title = 'Days of the Omer';
    ctx.state.downloadAltTitle = `${hyear} only`;
    ctx.state.numYears = 3;
    ctx.state.currentYear = new HDate().getFullYear();
    delete ctx.state.filename.pdf;

    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
    const meta = await getHolidayMeta('Days of the Omer');
    return ctx.render('omer-year', {
      hyear,
      items,
      books: meta.books,
      q: q0,
      emoiSwitchDisabled: true,
    });
  }
  const hyear = parseInt(yearStr, 10);
  if (isNaN(hyear) || hyear < 3762 || hyear > 9999) {
    return redirCurrentYear(ctx);
  }
  const omerDay = parseInt(basename(rpath), 10);
  if (isNaN(omerDay) || omerDay < 1 || omerDay > 49) {
    httpRedirect(ctx, `/omer/${hyear}/1`, 302);
    return;
  }
  const beginOmer = HDate.hebrew2abs(hyear, months.NISAN, 16);
  const hd = new HDate(beginOmer + omerDay - 1);
  const ev = new OmerEvent(hd, omerDay);
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, false) || [];
  const prev = omerDay === 1 ? 49 : omerDay - 1;
  const next = omerDay === 49 ? 1 : omerDay + 1;
  ctx.lastModified = ctx.launchDate;
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  return ctx.render('omer', {
    ev,
    d: dayjs(hd.greg()),
    hd,
    hyear,
    omerDay,
    prev,
    prevNth: Locale.ordinal(prev, 'en'),
    next,
    nextNth: Locale.ordinal(next, 'en'),
    sefEnglish: ev.sefira('en'),
    sefHebrew: ev.sefira('he'),
    sefTranslit: ev.sefira('translit'),
    holidays,
  });
}

function redirCurrentYear(ctx) {
  const hd = new HDate();
  const hyear = getDefaultHebrewYear(hd);
  httpRedirect(ctx, `/omer/${hyear}`, 302);
  return;
}
