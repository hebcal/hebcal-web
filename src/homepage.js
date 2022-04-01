/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, months, ParshaEvent, flags, OmerEvent, Locale,
  DafYomiEvent, MishnaYomiIndex, MishnaYomiEvent} from '@hebcal/core';
import {getDefaultHebrewYear, setDefautLangTz, localeMap, lgToLocale,
  processCookieAndQuery, urlArgs,
  getSunsetAwareDate} from './common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import './dayjs-locales';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function homepage(ctx) {
  const q0 = setDefautLangTz(ctx);
  const cookie = ctx.cookies.get('C');
  const il = ctx.state.il;
  const defaults = {
    maj: 'on',
    min: 'on',
    nx: 'on',
    mf: 'on',
    ss: 'on',
    mod: 'on',
    i: il ? 'on' : 'off',
  };
  const q = ctx.state.q = processCookieAndQuery(cookie, defaults, q0);
  ctx.state.calendarUrl = '/hebcal?v=1&' + urlArgs(q, cookie ? {} : {set: 'off'});
  ctx.state.lang = 'en';
  const {gy, gd, gm, dt, afterSunset, dateOverride} = getSunsetAwareDate(q, ctx.state.location);
  ctx.state.gy = gy;
  const hdate = new HDate(dt);
  const hd = ctx.state.hd = afterSunset ? hdate.next() : hdate;
  Object.assign(ctx.state, {gy, gm, gd, afterSunset});
  ctx.state.lg = q.lg || 's';
  const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
  ctx.state.locale = localeMap[lg] || 'en';
  ctx.state.title = 'Jewish Calendar, Hebrew Date Converter, Holidays - hebcal.com';
  setDefaultYear(ctx, dt, hd);
  ctx.state.items = [];
  mastheadDates(ctx, dt, afterSunset, hd);
  mastheadHolidays(ctx, hd, il);
  mastheadParsha(ctx, hd, il);
  mastheadOmer(ctx, hd);
  mastheadDafYomi(ctx, hd);
  const [blub, longText] = getMastheadGreeting(hd, il, dateOverride, ctx.state.timezone);
  if (blub) {
    ctx.state.holidayBlurb = blub;
    ctx.state.holidayLongText = longText;
  } else {
    ctx.state.holidayBlurb = false;
  }
  return ctx.render('homepage');
}

function mastheadDates(ctx, dt, afterSunset, hd) {
  const items = ctx.state.items;
  const d = dayjs(dt).locale(ctx.state.locale);
  const isoDt = d.format('YYYY-MM-DD');
  const fmtDt = d.format('ddd, D MMMM YYYY') + (afterSunset ? ' after sunset' : '');
  items.push(`<time datetime="${isoDt}">${fmtDt}</time>`);
  items.push(ctx.state.locale === 'he' ? hd.renderGematriya() : hd.render(ctx.state.lg));
}

function mastheadParsha(ctx, hd, il) {
  const items = ctx.state.items;
  const saturday = hd.onOrAfter(6);
  const sedra = HebrewCalendar.getSedra(saturday.getFullYear(), il);
  if (sedra.isParsha(saturday)) {
    const pe = new ParshaEvent(saturday, sedra.get(saturday), il);
    const url = pe.url();
    items.push(`<a href="${url}">${pe.render(ctx.state.lg)}</a>`);
  }
}

function mastheadHolidays(ctx, hd, il) {
  const items = ctx.state.items;
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  holidays
      .map((ev) => {
        const url = ev.url();
        const desc = ev.chanukahDay ?
          Locale.gettext('Chanukah', ctx.state.lg) + ' ' +
          Locale.gettext('day', ctx.state.lg) + ' ' + ev.chanukahDay :
          ev.render(ctx.state.lg);
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
    items.push(new OmerEvent(hd, omer).render(ctx.state.lg));
  }
}

function mastheadDafYomi(ctx, hd) {
  ctx.state.dafYomi = new DafYomiEvent(hd);
  const myomiIndex = new MishnaYomiIndex();
  const mishnaYomi = myomiIndex.lookup(hd);
  ctx.state.mishnaYomi = new MishnaYomiEvent(hd, mishnaYomi);
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
    hy,
    gregRange,
    yearArgs,
    gregYr1,
    gregYr2,
  });
}

function myDateFormat(d) {
  const strtime = d.format('dddd, MMMM D');
  const isodate = d.format('YYYY-MM-DD');
  return `<time datetime="${isodate}" class="text-nowrap">${strtime}</time>`;
}

const chagSameach = {
  'Chanukah': true,
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

const TZOM_KAL = '✡️&nbsp;Tzom Kal! · <span lang="he" dir="rtl">צום קל</span>&nbsp;✡️';

function getMastheadGreeting(hd, il, dateOverride, tzid) {
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const gy = hd.greg().getFullYear();

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  if (holidays.find((ev) => ev.getDesc() === 'Erev Tish\'a B\'Av')) {
    return [TZOM_KAL, `<a href="/holidays/tisha-bav-${gy}">Tish'a B'Av</a>
 begins tonight at sundown. We wish you an easy fast`];
  }
  const fastDay = holidays.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastDay) {
    const d = dayjs(fastDay.getDate().greg());
    const htmlDate = myDateFormat(d);
    return [TZOM_KAL, `<a href="${fastDay.url()}">${fastDay.render()}</a>
 occurs on ${htmlDate}. We wish you an easy fast`];
  }

  const chmStart = il ? 16 : 17;
  const isElul = mm === months.ELUL;
  const isTishrei = mm === months.TISHREI;
  const isNisan = mm === months.NISAN;

  if (mm == months.SIVAN && dd <= 5 && dd >= 2) {
    const erevShavuot = dayjs(new HDate(5, months.SIVAN, yy).greg());
    const htmlDate = myDateFormat(erevShavuot);
    const suffix = il ? '?i=on' : '';
    return ['🌸&nbsp;⛰️&nbsp;<span lang="he" dir="rtl">חג שבועות שמח</span>&nbsp;⛰️&nbsp;🌸',
      `<strong>Chag Shavuot Sameach!</strong> <a href="/holidays/shavuot-${gy}${suffix}">Shavuot</a>
 begins at sundown on ${htmlDate}`];
  } else if ((isTishrei && dd >= chmStart && dd <= 21) || (isNisan && dd >= chmStart && dd <= 20)) {
    const holiday = isTishrei ? 'Sukkot' : 'Pesach';
    const emoji = isTishrei ? '🌿🍋' : '🫓';
    const blurb = `${emoji}&nbsp;<span lang="he" dir="rtl">מועדים לשמחה</span>&nbsp;${emoji}`;
    return [blurb, `<strong>Moadim L\'Simcha!</strong> We wish you a very happy ${holiday}`];
  } else if ((isElul && dd === 29) || (isTishrei && (dd === 1 || dd === 2))) {
    const blurb = '🍏&nbsp;🍯&nbsp;<span lang="he" dir="rtl">שנה טובה ומתוקה</span>&nbsp;🍯&nbsp;🍏';
    return [blurb, '<strong>Shana Tova u\'Metukah!</strong> We wish you a happy and healthy New Year'];
  }

  if (isTishrei && dd >= 3 && dd <= 10) {
    // between RH & YK
    let longText = '<strong>G\'mar Chatima Tova!</strong> We wish you a good inscription in the Book of Life';
    if (dd < 10) {
      const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg());
      const htmlDate = myDateFormat(erevYK);
      longText += `.\n<br><a href="/holidays/yom-kippur-${gy}">Yom Kippur</a>
 begins at sundown on ${htmlDate}`;
    }
    return ['✡️&nbsp;<span lang="he" dir="rtl">גְּמַר חֲתִימָה טוֹבָה</span>&nbsp;✡️',
      longText];
  } else if (isTishrei && dd >= 11 && dd <= 14) {
    const erevSukkot = dayjs(new HDate(14, months.TISHREI, yy).greg());
    const htmlDate = myDateFormat(erevSukkot);
    const when = (dd === 14) ? 'tonight at sundown' :
      ` at sundown on ${htmlDate}`;
    const blurb = '🌿&nbsp;🍋&nbsp;<span lang="he" dir="rtl">חג סוכות שמח</span>&nbsp;🍋&nbsp;🌿';
    const suffix = il ? '?i=on' : '';
    const longText = `<strong>Chag Sukkot Sameach!</strong> <a href="/holidays/sukkot-${gy}${suffix}">Sukkot</a>
 begins ${when}`;
    return [blurb, longText];
  }

  const chagToday = holidays.find((ev) => chagSameach[ev.basename()]);
  if (chagToday) {
    return getHolidayGreeting(chagToday, il, true, tzid, dateOverride);
  }

  const tomorrow = HebrewCalendar.getHolidaysOnDate(hd.next(), il) || [];
  const chagTomorrow = tomorrow.find((ev) => !(ev.getFlags() & flags.EREV) && chagSameach[ev.basename()]);
  if (chagTomorrow) {
    return getHolidayGreeting(chagTomorrow, il, false);
  }

  const roshChodeshToday = holidays.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshToday) {
    return getRoshChodeshGreeting(hd, roshChodeshToday);
  }

  const roshChodeshTomorrow = tomorrow.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshTomorrow) {
    return getRoshChodeshGreeting(hd, roshChodeshTomorrow);
  }

  if (isElul) {
    // for the entire month of Elul
    const nextYear = yy + 1;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg());
    const htmlDate = myDateFormat(erevRH);
    return ['🍏&nbsp;🍯&nbsp;<span lang="he" dir="rtl">שנה טובה</span>&nbsp;🍯&nbsp;🍏',
      `<strong>Shana Tova!</strong> We wish you a happy and healthy New Year.
 <a href="/holidays/rosh-hashana-${gy}">Rosh Hashana</a> ${nextYear}
 begins at sundown on ${htmlDate}`];
  } else if (mm == months.KISLEV && dd < 24) {
    // immediately after Rosh Chodesh Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg());
    const dow = erevChanukah.day();
    const htmlDate = myDateFormat(erevChanukah);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    return ['🕎&nbsp;<span lang="he" dir="rtl">חנוכה שמח</span>&nbsp;🕎',
      `<strong>Happy Chanukah!</strong> Light the first <a href="/holidays/chanukah-${gy}">Chanukah candle</a>
${when} on ${htmlDate}`];
  } else if (mm == months.IYYAR && dd >= 12 && dd <= 17) {
    const erevLagBaOmer = dayjs(new HDate(17, months.IYYAR, yy).greg());
    const htmlDate = myDateFormat(erevLagBaOmer);
    return ['🔥&nbsp;<span lang="he" dir="rtl">ל״ג בעומר שמח</span>&nbsp;🔥',
      `<a href="/holidays/lag-baomer-${gy}">Lag BaOmer</a>
 begins at sundown on ${htmlDate}`];
  } else if (mm === months.AV && dd >= 23) {
    // for the last week of Av
    const erevRHLaBehemot = dayjs(new HDate(30, months.AV, yy).greg());
    const htmlDate = myDateFormat(erevRHLaBehemot);
    return ['🐑&nbsp;🐓&nbsp;<span lang="he" dir="rtl">ראש השנה לבהמות שמח</span>&nbsp;🐓&nbsp;🐑',
      `<a href="/holidays/rosh-hashana-labehemot-${gy}">Rosh Hashana LaBehemot</a> (New Year for Tithing Animals)
 begins at sundown on ${htmlDate}`];
  } else if (mm === months.SHVAT && dd >= 2 && dd <= 13) {
    // first 2 weeks of Shvat
    const erevTuBiShvat = dayjs(new HDate(14, months.SHVAT, yy).greg());
    const htmlDate = myDateFormat(erevTuBiShvat);
    return ['🌳&nbsp;🌱&nbsp;<span lang="he" dir="rtl">ט״ו בשבט שמח</span>&nbsp;🌱&nbsp;🌳',
      `<a href="/holidays/tu-bishvat-${gy}">Tu BiShvat</a> (New Year for Trees)
 begins at sundown on ${htmlDate}`];
  }

  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;
  if (mm == purimMonth && dd <= 13) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg());
    const htmlDate = myDateFormat(erevPurim);
    return ['🎭️&nbsp;📜&nbsp;<span lang="he" dir="rtl">חג פורים שמח</span>&nbsp;📜&nbsp;🎭️',
      `<strong>Chag Purim Sameach!</strong> <a href="/holidays/purim-${gy}">Purim</a>
 begins at sundown on ${htmlDate}`];
  }
  if ((mm == purimMonth && dd >= 17) || (isNisan && dd <= 14)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg());
    const htmlDate = myDateFormat(erevPesach);
    const blurb = '🫓&nbsp;🍷&nbsp;<span lang="he" dir="rtl">חג כשר ושמח</span>&nbsp;🍷&nbsp;🫓';
    const suffix = il ? '?i=on' : '';
    return [blurb, `<strong>Chag Kasher v\'Sameach!</strong>
 <a href="/holidays/pesach-${gy}${suffix}">Passover</a>
 begins at sundown on ${htmlDate}`];
  }

  return [null, null];
}

/**
 * @private
 * @param {Event} ev
 * @param {boolean} il
 * @param {boolean} today
 * @param {string} tzid
 * @param {boolean} dateOverride
 * @return {any}
 */
function getHolidayGreeting(ev, il, today, tzid, dateOverride) {
  const url = ev.url();
  const mask = ev.getFlags();
  if (today && !dateOverride && (mask & flags.CHANUKAH_CANDLES)) {
    const d = dayjs.tz(new Date(), tzid);
    const dt = new Date(d.year(), d.month(), d.date());
    const hd = new HDate(dt);
    const holidays = HebrewCalendar.getHolidaysOnDate(hd, il);
    ev = holidays.find((ev) => ev.getFlags() & flags.CHANUKAH_CANDLES);
    const dow = d.day();
    const when = dow === 5 ? 'before sundown' : dow === 6 ? 'at nightfall' : 'at dusk';
    const candles = typeof ev.chanukahDay === 'number' ? ev.chanukahDay + 1 : 1;
    const nth = Locale.ordinal(candles);
    const dowStr = d.format('dddd');
    return [`🕎&nbsp;<span lang="he" dir="rtl">חג אורים שמח</span>&nbsp;🕎`,
      `<strong>Happy Chanukah!</strong> Light the ${nth}
<a href="${url}">Chanukah candle</a> ${dowStr} evening ${when}`];
  }
  const title = ev.basename();
  const emoji0 = ev.getEmoji();
  const emoji = emoji0 ? `<span class="text-nowrap">${emoji0}</span>` : '';
  const longText = today ?
    `We wish you a happy <a href="${url}">${title}</a>` :
    `<a href="${url}">${title}</a> begins tonight at sundown`;
  const blurb = `${emoji}&nbsp;Chag Sameach! · <span lang="he" dir="rtl">חג שמח</span>&nbsp;${emoji}`;
  return [`${blurb}`, longText];
}

const roshChodeshBlurb = '🌒&nbsp;Chodesh Tov! · <span lang="he" dir="rtl">חודש טוב</span>&nbsp;🌒';

function getRoshChodeshGreeting(hd, ev) {
  const monthName = ev.getDesc().substring(13); // 'Rosh Chodesh '
  const url = ev.url();
  const d = dayjs(ev.getDate().greg());
  const today = dayjs(hd.greg()).isSame(d, 'day');
  if (today) {
    return [roshChodeshBlurb,
      `We wish you a good new month of <a href="${url}">${monthName}</a>`];
  }
  const htmlDate = myDateFormat(d.subtract(1, 'day'));
  return [roshChodeshBlurb,
    `<a href="${url}">Rosh Chodesh ${monthName}</a> begins at sundown on ${htmlDate}`];
}
