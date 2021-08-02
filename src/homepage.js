/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, months, Sedra, ParshaEvent, flags, OmerEvent} from '@hebcal/core';
import {empty, getDefaultHebrewYear, setDefautLangTz, localeMap, lgToLocale,
  getBeforeAfterSunsetForLocation, makeGregDate} from './common';
import dayjs from 'dayjs';
import './dayjs-locales';

export async function homepage(ctx) {
  const q = setDefautLangTz(ctx);
  ctx.state.lang = 'en';
  const {gy, gd, gm, dt, afterSunset} = getDate(ctx, q);
  const hdate = new HDate(dt);
  const hd = afterSunset ? hdate.next() : hdate;
  Object.assign(ctx.state, {gy, gm, gd, afterSunset});
  const lg = lgToLocale[q.lg || 's'] || q.lg;
  ctx.state.locale = localeMap[lg] || 'en';
  ctx.state.title = 'Jewish Calendar, Hebrew Date Converter, Holidays - hebcal.com';
  setDefaultYear(ctx, dt, hd);
  ctx.state.items = [];
  mastheadDates(ctx, dt, afterSunset, hd);
  const il = ctx.state.il;
  mastheadHolidays(ctx, hd, il);
  mastheadParsha(ctx, dt, il);
  mastheadOmer(ctx, hd);
  const [blub, longText] = getMastheadGreeting(hd, il);
  if (blub) {
    ctx.state.holidayBlurb = blub;
    ctx.state.holidayLongText = longText;
  } else {
    ctx.state.holidayBlurb = false;
  }
  return ctx.render('homepage');
}

function getDate(ctx, q) {
  const isToday = Boolean(empty(q.gy) || empty(q.gm) || empty(q.gd));
  const dt = isToday ? new Date() : makeGregDate(q.gy, q.gm, q.gd);
  const location = ctx.state.location;
  if (isToday && location !== null) {
    return getBeforeAfterSunsetForLocation(dt, location);
  }
  return {dt: dt, afterSunset: false, gy: dt.getFullYear(), gd: dt.getDate(), gm: dt.getMonth() + 1};
}

function mastheadDates(ctx, dt, afterSunset, hd) {
  const items = ctx.state.items;
  const d = dayjs(dt).locale(ctx.state.locale);
  const isoDt = d.format('YYYY-MM-DD');
  const fmtDt = d.format('ddd, D MMMM YYYY') + (afterSunset ? ' (after sunset)' : '');
  items.push(
      `<time datetime="${isoDt}">${fmtDt}</time>`,
      hd.render(ctx.state.locale),
  );
}

function mastheadParsha(ctx, dt, il) {
  const items = ctx.state.items;
  const saturday = dayjs(dt).day(6);
  const hd = new HDate(saturday.toDate());
  const sedra = new Sedra(hd.getFullYear(), il);
  if (sedra.isParsha(hd)) {
    const pe = new ParshaEvent(hd, sedra.get(hd), il);
    const url = pe.url();
    items.push(`<a href="${url}">${pe.render(ctx.state.locale)}</a>`);
  }
}

function mastheadHolidays(ctx, hd, il) {
  const items = ctx.state.items;
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  holidays
      .map((ev) => {
        const url = ev.url();
        const desc = ev.render(ctx.state.locale);
        const suffix = il && url && url.indexOf('?') === -1 ? '?i=on' : '';
        return url ? `<a href="${url}${suffix}">${desc}</a>` : desc;
      }).forEach((str) => items.push(str));
}

function mastheadOmer(ctx, hd) {
  const items = ctx.state.items;
  const beginOmer = HDate.hebrew2abs(hd.getFullYear(), months.NISAN, 16);
  const abs = hd.abs();
  if (abs >= beginOmer && abs < (beginOmer + 49)) {
    const omer = abs - beginOmer + 1;
    items.push(new OmerEvent(hd, omer).render(ctx.state.locale));
  }
}

// For the first 7 months of the year, show the current Gregorian year
// For the last 3 weeks of December, show next Gregorian year
// After Tu B'Av show next Hebrew year
function setDefaultYear(ctx, dt, hdate) {
  const today = hdate.abs();
  const av15 = new HDate(15, months.AV, hdate.getFullYear()).abs();
  const hy = getDefaultHebrewYear(hdate);
  const gregYr1 = hy - 3761;
  const gregYr2 = gregYr1 + 1;
  let gregRange;
  let yearArgs;
  const gy0 = dt.getFullYear();
  const gm = dt.getMonth() + 1;
  const gy = (gm === 12) ? gy0 + 1 : gy0;
  if (hdate.getMonth() === months.TISHREI) {
    yearArgs = `&yt=H&year=${hy}`;
    gregRange = gregYr1 + '-' + gregYr2;
  } else if (gm < 8 || (gm <= 9 && today <= av15) || gm === 12 && dt.getDate() >= 10) {
    yearArgs = `&yt=G&year=${gy}`;
    gregRange = gy;
  } else {
    yearArgs = `&yt=H&year=${hy}`;
    gregRange = gregYr1 + '-' + gregYr2;
  }
  Object.assign(ctx.state, {
    gregRange,
    yearArgs,
    gregYr1,
    gregYr2,
  });
}

const FORMAT_DOW_MONTH_DAY = 'ddd, D MMMM YYYY';

const chagSameach = {
  'Sukkot': true,
  'Pesach': true,
  'Shavuot': true,
  'Rosh Hashana': true,
  'Rosh Hashana LaBehemot': true,
  'Tu BiShvat': true,
  'Tu B\'Av': true,
  'Purim': true,
  'Shushan Purim': true,
  'Yom HaAtzma\'ut': true,
  'Lag B\'Omer': true,
  'Lag BaOmer': true,
  'Shmini Atzeret': true,
  'Simchat Torah': true,
};

function getMastheadGreeting(hd, il) {
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const gy = hd.greg().getFullYear();

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  if (holidays.find((ev) => ev.getDesc() === 'Erev Tish\'a B\'Av')) {
    return ['Tzom Kal!', `<a href="/holidays/tisha-bav-${gy}">Tish'a B'Av</a>
 begins tonight at sundown. We wish you an easy fast`];
  }
  const fastDay = holidays.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastDay) {
    const strtime = dayjs(fastDay.getDate().greg()).format(FORMAT_DOW_MONTH_DAY);
    return ['Tzom Kal!',
      `We wish you an easy fast.<br><a href="${fastDay.url()}">${fastDay.render()}</a>
 occurs on <span class="text-nowrap">${strtime}</span>`];
  }

  if (mm == months.SIVAN && dd <= 5 && dd >= 2) {
    const erevShavuot = dayjs(new HDate(5, months.SIVAN, yy).greg());
    const strtime = erevShavuot.format(FORMAT_DOW_MONTH_DAY);
    return ['🌸 ⛰️ Chag Shavuot Sameach! ⛰️ 🌸',
      `<br><a href="/holidays/shavuot-${gy}">Shavuot</a>
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  } else if ((mm == months.TISHREI && dd >= 16 && dd <= 21) ||
      (mm == months.NISAN && dd >= 16 && dd <= 21)) {
    const holiday = mm == months.TISHREI ? 'Sukkot' : 'Pesach';
    return ['Moadim L\'Simcha!', `We wish you a very happy ${holiday}`];
  } else if (mm === months.TISHREI && (dd === 1 || dd === 2)) {
    return ['Shana Tova u\'Metukah!',
      '🍏 🍯 <span lang="he" dir="rtl">שנה טובה ומתוקה</span> 🍯 🍏' +
      '<br>We wish you a happy and healthy New Year'];
  }

  if (mm == months.TISHREI && dd >= 3 && dd <= 10) {
    // between RH & YK
    let longText = '<br>We wish you a good inscription in the Book of Life';
    if (dd < 10) {
      const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg());
      const strtime = erevYK.format(FORMAT_DOW_MONTH_DAY);
      longText += `.\n<br><a href="/holidays/yom-kippur-${gy}">Yom Kippur</a>
 begins at sundown on <span class="text-nowrap">${strtime}</span>`;
    }
    return ['✍️ 📖 G\'mar Chatima Tova / גְּמַר חֲתִימָה טוֹבָה 📖 ✍️', longText];
  }

  const chagToday = holidays.find((ev) => chagSameach[ev.basename()]);
  if (chagToday) {
    return getHolidayGreeting(chagToday, true);
  }

  const tomorrow = HebrewCalendar.getHolidaysOnDate(hd.next(), il) || [];
  const chagTomorrow = tomorrow.find((ev) => !(ev.getFlags() & flags.EREV) && chagSameach[ev.basename()]);
  if (chagTomorrow) {
    return getHolidayGreeting(chagTomorrow, false);
  }

  const roshChodeshToday = holidays.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshToday) {
    return getRoshChodeshGreeting(hd, roshChodeshToday);
  }

  const roshChodeshTomorrow = tomorrow.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshTomorrow) {
    return getRoshChodeshGreeting(hd, roshChodeshTomorrow);
  }

  if (mm === months.ELUL) {
    // for the entire month of Elul
    const nextYear = yy + 1;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg());
    const strtime = erevRH.format(FORMAT_DOW_MONTH_DAY);
    return ['🍏 🍯 Shana Tova! 🍯 🍏', `We wish you a happy and healthy New Year.
 <br><a href="/holidays/rosh-hashana-${gy}">Rosh Hashana</a> ${nextYear}
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  } else if (mm == months.KISLEV && dd < 24) {
    // immediately after Rosh Chodesh Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg());
    const dow = erevChanukah.day();
    const strtime = erevChanukah.format(FORMAT_DOW_MONTH_DAY);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    return ['🕎 Happy Chanukah! 🕎',
      `<br>Light the first <a href="/holidays/chanukah-${gy}">Chanukah candle</a>
 ${when} on <span class="text-nowrap">${strtime}</span>`];
  } else if (mm == months.IYYAR && dd >= 12 && dd <= 17) {
    const erevLagBaOmer = dayjs(new HDate(17, months.IYYAR, yy).greg());
    const strtime = erevLagBaOmer.format(FORMAT_DOW_MONTH_DAY);
    return ['🔥 <span lang="he" dir="rtl">ל״ג בעומר שמח</span> 🔥',
      `<br><a href="/holidays/lag-baomer-${gy}">Lag BaOmer</a>
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  } else if (mm === months.AV && dd >= 23) {
    // for the last week of Av
    const erevRHLaBehemot = dayjs(new HDate(30, months.AV, yy).greg());
    const strtime = erevRHLaBehemot.format(FORMAT_DOW_MONTH_DAY);
    return ['🐄 🐑 <span lang="he" dir="rtl">ראש השנה לבהמות שמח</span> 🐑 🐄',
      `<br><a href="/holidays/rosh-hashana-labehemot-${gy}">Rosh Hashana LaBehemot</a> (New Year for Tithing Animals)
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  } else if (mm === months.SHVAT && dd >= 2 && dd <= 13) {
    // first 2 weeks of Shvat
    const erevTuBiShvat = dayjs(new HDate(14, months.SHVAT, yy).greg());
    const strtime = erevTuBiShvat.format(FORMAT_DOW_MONTH_DAY);
    return ['🌳 🌱 <span lang="he" dir="rtl">ט״ו בשבט שמח</span> 🌱 🌳',
      `<br><a href="/holidays/tu-bishvat-${gy}">Tu BiShvat</a> (New Year for Trees)
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  }

  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;
  if (mm == purimMonth && dd <= 13) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg());
    const strtime = erevPurim.format(FORMAT_DOW_MONTH_DAY);
    return ['🎭️ 📜 Chag Purim Sameach! 📜 🎭️',
      `<a href="/holidays/purim-${gy}">Purim</a>
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  }
  if ((mm == purimMonth && dd >= 17) || (mm == months.NISAN && dd <= 14)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg());
    const strtime = erevPesach.format(FORMAT_DOW_MONTH_DAY);
    return ['Chag Kasher v\'Sameach!', `We wish you a happy
 <a href="/holidays/pesach-${gy}">Passover</a>. Pesach
 begins at sundown on <span class="text-nowrap">${strtime}</span>`];
  }

  return [null, null];
}

/**
 * @private
 * @param {Event} ev
 * @param {boolean} today
 * @return {any}
 */
function getHolidayGreeting(ev, today) {
  const emoji = ev.getEmoji();
  const url = ev.url();
  const mask = ev.getFlags();
  const title = ev.basename();
  let longText = `<br>We wish you a happy <a href="${url}">${title}</a>`;
  if (today && (mask & flags.CHANUKAH_CANDLES)) {
    return [`${emoji} Chag Urim Sameach! ${emoji}`, longText];
  }
  if (!today) {
    longText = `<br><a href="${url}">${title}</a> begins tonight at sundown`;
  }
  return [`${emoji} Chag Sameach! ${emoji}`, longText];
}

const roshChodeshBlurb = '🗓️ 🌒&nbsp; Chodesh Tov / <span lang="he" dir="rtl">חודש טוב</span> &nbsp;🌒 🗓️';

function getRoshChodeshGreeting(hd, ev) {
  const monthName = ev.getDesc().substring(13); // 'Rosh Chodesh '
  const url = ev.url();
  const d = dayjs(ev.getDate().greg());
  const today = dayjs(hd.greg()).isSame(d, 'day');
  if (today) {
    return [roshChodeshBlurb,
      `<br>We wish you a good new month of <a href="${url}">${monthName}</a>`];
  }
  return [roshChodeshBlurb,
    `<br><a href="${url}">Rosh Chodesh ${monthName}</a> begins at sundown`];
}
