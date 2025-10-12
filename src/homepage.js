import {HDate, HebrewCalendar, months, ParshaEvent, flags, Locale,
  DailyLearning} from '@hebcal/core';
import {getDefaultYear, getSunsetAwareDate} from './dateUtil.js';
import {setDefautLangTz, localeMap, lgToLocale,
  cleanQuery,
  processCookieAndQuery, urlArgs,
  shortenUrl,
  makeGeoUrlArgs2,
} from './common.js';
import {pad2, pad4} from '@hebcal/hdate';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import './dayjs-locales.js';

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
  cleanQuery(q);
  ctx.state.calendarUrl = '/hebcal?v=1&' + urlArgs(q, cookie ? {} : {set: 'off'});
  const location = ctx.state.location || ctx.db.lookupLegacyCity('New York');
  const geoUrlArgs = makeGeoUrlArgs2(q, location);
  ctx.state.shabbatUrl = '/shabbat?' + geoUrlArgs;
  const gloc = ctx.state.geoip;
  if (gloc && gloc.geo !== 'none') {
    const mode = gloc.zip ? 'zip' : gloc.nn ? 'nn' : 'geonameid';
    ctx.state.shabbatUrl += `&geoip=${mode}`;
  }
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
  const yearInfo = getDefaultYear(dt, hd);
  Object.assign(ctx.state, yearInfo);
  const yearArgsOverride = makeRangeYearArgs(yearInfo, hd, gy, gm, gd);
  if (yearArgsOverride) {
    ctx.state.yearArgs = yearArgsOverride;
  }
  ctx.state.items = [];
  mastheadDates(ctx, dt, afterSunset, hd);
  mastheadHolidays(ctx, hd, il);
  mastheadParsha(ctx, hd, il);
  mastheadDafYomi(ctx, hd);
  const [blub, longText] = getMastheadGreeting(ctx, hd, il, dateOverride);
  if (blub) {
    ctx.state.holidayBlurb = blub;
    ctx.state.holidayLongText = longText;
  } else {
    ctx.state.holidayBlurb = false;
  }
  return ctx.render('homepage');
}

function makeRangeYearArgs(yearInfo, hd, gy, gm, gd) {
  const isHebrewYear = yearInfo.isHebrewYear;
  if (isHebrewYear) {
    const mm = hd.getMonth();
    const dd = hd.getDate();
    if (mm === months.TISHREI || (mm === months.ELUL && dd > 2) || (mm === months.CHESHVAN && dd < 3)) {
      return undefined;
    }
  }
  const start = pad4(gy) + '-' + pad2(gm) + '-01';
  if (!isHebrewYear && (gm >= 4 && gm <= 8)) {
    const end = pad4(gy) + '-12-31';
    return `&start=${start}&end=${end}`;
  }
  if ((gm === 12 || (gm === 11 && gd >= 11)) || (isHebrewYear && yearInfo.todayAbs >= yearInfo.av15Abs)) {
    const end = pad4(gy + 1) + '-12-31';
    return `&start=${start}&end=${end}`;
  }
  return undefined;
}

function mastheadDates(ctx, dt, afterSunset, hd) {
  const items = ctx.state.items;
  const locale = ctx.state.locale;
  const d = ctx.state.d = dayjs(dt).locale(locale);
  const isoDt = d.format('YYYY-MM-DD');
  ctx.state.isoDt = afterSunset ? d.add(1, 'day').format('YYYY-MM-DD') : isoDt;
  const afterSunsetStr = afterSunset ?
    ' <small>' + Locale.gettext('after sunset', locale) + '</small>' : '';
  const fmtDt = d.format('ddd, D MMMM YYYY') + afterSunsetStr;
  items.push(`<time datetime="${isoDt}">${fmtDt}</time>`);
  const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
  items.push(locale === 'he' ? hd.renderGematriya() : hd.render(lg));
}

function mastheadParsha(ctx, hd, il) {
  const items = ctx.state.items;
  const saturday = hd.onOrAfter(6);
  const sedra = HebrewCalendar.getSedra(saturday.getFullYear(), il);
  if (sedra.isParsha(saturday)) {
    const pe = new ParshaEvent(saturday, sedra.get(saturday), il);
    ctx.state.parshaEvent = pe;
    const url = shortenUrl(pe.url());
    const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
    const parshaStr = pe.render(lg).replace(/'/g, '’');
    items.push(`<a href="${url}">${parshaStr}</a>`);
  }
}

function mastheadHolidays(ctx, hd, il) {
  const items = ctx.state.items;
  const holidays = HebrewCalendar.calendar({
    start: hd,
    end: hd,
    il,
    yomKippurKatan: false,
    shabbatMevarchim: true,
    omer: true,
  });
  const lg = lgToLocale[ctx.state.lg] || ctx.state.lg;
  holidays
      .map((ev) => {
        const url = shortenUrl(ev.url());
        const desc = ev.chanukahDay ?
          Locale.gettext('Chanukah', lg) + ' ' +
          Locale.gettext('day', lg) + ' ' + ev.chanukahDay :
          ev.render(lg).replace(/'/g, '’');
        const suffix = il && url && url.indexOf('?') === -1 ? '?i=on' : '';
        return url ? `<a href="${url}${suffix}">${desc}</a>` : desc;
      }).forEach((str) => items.push(str));
}

function mastheadDafYomi(ctx, hd) {
  ctx.state.dafYomi = DailyLearning.lookup('dafYomi', hd);
  ctx.state.mishnaYomi = DailyLearning.lookup('mishnaYomi', hd);
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
  'Yom HaAtzma\'ut': true,
  'Lag B\'Omer': true,
  'Lag BaOmer': true,
  'Shmini Atzeret': true,
  'Simchat Torah': true,
};

const TZOM_KAL = '✡️&nbsp;Tzom Kal!&nbsp;&nbsp;<span lang="he" dir="rtl">צוֹם קַל</span>&nbsp;✡️';
const SHANA_TOVA = '🍏&nbsp;🍯&nbsp;<span lang="he" dir="rtl">שָׁנָה טוֹבָה וּמְתוּקָה</span>&nbsp;🍯&nbsp;🍏';
const SHANA_TOVA2 = '<strong>Shana Tova u\'Metukah!</strong> We wish you a happy and healthy New Year';

/**
 * @private
 * @param {any} ctx
 * @param {HDate} hd
 * @param {boolean} il
 * @param {boolean} dateOverride
 * @return {string[]}
 */
function getMastheadGreeting(ctx, hd, il, dateOverride) {
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const gy = hd.greg().getFullYear();
  const locale = ctx.state.locale;

  const isElul = mm === months.ELUL;
  const isTishrei = mm === months.TISHREI;
  const suffix = il ? '?i=on' : '';
  if ((isElul && dd === 29) || (isTishrei && (dd === 1 || dd === 2))) {
    return [SHANA_TOVA, SHANA_TOVA2];
  } else if (isTishrei && dd > 4 && dd <= 10) {
    // between RH & YK
    let longText = '<strong>G\'mar Chatima Tova!</strong> We wish you a good inscription in the Book of Life';
    if (dd < 10) {
      const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg()).locale(locale);
      const htmlDate = myDateFormat(erevYK);
      longText += `.\n<br><a class="text-green1 text-nowrap" href="/holidays/yom-kippur-${gy}">Yom Kippur</a>
 begins at sundown on ${htmlDate}`;
    }
    return ['✡️&nbsp;<span lang="he" dir="rtl">גְּמַר חֲתִימָה טוֹבָה</span>&nbsp;✡️',
      longText];
  } else if (isTishrei && dd >= 11 && dd <= 14) {
    const erevSukkot = dayjs(new HDate(14, months.TISHREI, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevSukkot);
    const when = (dd === 14) ? 'tonight at sundown' :
      ` at sundown on ${htmlDate}`;
    const blurb = '🌿&nbsp;🍋&nbsp;<span lang="he" dir="rtl">חַג סוּכּוֹת שָׂמֵחַ</span>&nbsp;🍋&nbsp;🌿';
    const longText = `<strong>Chag Sukkot Sameach!</strong>
 <a class="text-green1 text-nowrap" href="/holidays/sukkot-${gy}${suffix}">Sukkot</a>
 begins ${when}`;
    return [blurb, longText];
  }

  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  if (holidays.find((ev) => ev.getDesc() === 'Erev Tish\'a B\'Av')) {
    return [TZOM_KAL, `<a class="text-green1 text-nowrap" href="/holidays/tisha-bav-${gy}">Tish'a B'Av</a>
 begins tonight at sundown. We wish you an easy fast`];
  }
  if (holidays.find((ev) => ev.getDesc() === 'Yom HaShoah')) {
    return ['✡️ We remember ✡️',
      `Today is <a class="text-green1 text-nowrap" href="/holidays/yom-hashoah-${gy}">Yom HaShoah</a>,
 Holocaust and Heroism Remembrance Day`];
  }
  if (holidays.find((ev) => ev.getDesc() === 'Yom HaZikaron')) {
    return ['🇮🇱 <span lang="he" dir="rtl">אנחנו זוכרים אותם</span> 🇮🇱',
      `Today is <a class="text-green1 text-nowrap" href="/holidays/yom-hazikaron-${gy}">Yom HaZikaron</a>,
 Israeli Memorial Day`];
  }
  const fastDay = holidays.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastDay && fastDay.url()) {
    return fastDayGreeting(ctx, fastDay);
  }

  const chmStart = il ? 16 : 17;
  const isNisan = mm === months.NISAN;

  if (mm == months.SIVAN && dd <= 5 && dd >= 2) {
    const erevShavuot = dayjs(new HDate(5, months.SIVAN, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevShavuot);
    const suffix = il ? '?i=on' : '';
    return ['🌸&nbsp;⛰️&nbsp;<span lang="he" dir="rtl">חַג שָׁבוּעוֹת שָׂמֵחַ</span>&nbsp;⛰️&nbsp;🌸',
      `<strong>Chag Shavuot Sameach!</strong>
 <a class="text-green1 text-nowrap" href="/holidays/shavuot-${gy}${suffix}">Shavuot</a>
 begins at sundown on ${htmlDate}`];
  } else if ((isTishrei && dd >= chmStart && dd <= 21) || (isNisan && dd >= chmStart && dd <= 20)) {
    const holiday = isTishrei ? 'Sukkot' : 'Pesach';
    const emoji = isTishrei ? '🌿🍋' : '🫓';
    const blurb = `${emoji}&nbsp;<span lang="he" dir="rtl">מוֹעֲדִים לְשִׂמְחָה</span>&nbsp;${emoji}`;
    return [blurb, `<strong>Moadim L'Simcha!</strong> We wish you a very happy
 <a class="text-green1" href="/holidays/${holiday.toLowerCase()}-${gy}${suffix}">${holiday}</a>`];
  } else if (mm === months.KISLEV && dd <= 24 && dd >= 2) {
    // immediately after Rosh Chodesh Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg()).locale(locale);
    const dow = erevChanukah.day();
    const htmlDate = myDateFormat(erevChanukah);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    return ['🕎&nbsp;<span lang="he" dir="rtl">חֲנוּכָּה שָׂמֵחַ</span>&nbsp;🕎',
      `<strong>Happy Chanukah!</strong> Light the first
 <a class="text-green1 text-nowrap" href="/holidays/chanukah-${gy}">Chanukah candle</a>
${when} on ${htmlDate}`];
  }

  const chagToday = holidays.find((ev) => chagSameach[ev.basename()]);
  if (chagToday) {
    return getHolidayGreeting(ctx, chagToday, il, true, dateOverride);
  }

  const tomorrow = HebrewCalendar.getHolidaysOnDate(hd.next(), il) || [];
  const chagTomorrow = tomorrow.find((ev) => !(ev.getFlags() & flags.EREV) && chagSameach[ev.basename()]);
  if (chagTomorrow) {
    return getHolidayGreeting(ctx, chagTomorrow, il, false);
  }

  const roshChodeshToday = holidays.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshToday) {
    return getRoshChodeshGreeting(ctx, hd, roshChodeshToday);
  }

  const roshChodeshTomorrow = tomorrow.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);
  if (roshChodeshTomorrow) {
    return getRoshChodeshGreeting(ctx, hd, roshChodeshTomorrow);
  }

  if (isElul) {
    // for the entire month of Elul
    const nextYear = yy + 1;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg()).locale(locale);
    const htmlDate = myDateFormat(erevRH);
    return [SHANA_TOVA, SHANA_TOVA2 + `.<br>
 <a class="text-green1 text-nowrap" href="/holidays/rosh-hashana-${gy}">Rosh Hashana ${nextYear}</a>
 begins at sundown on ${htmlDate}`];
  } else if (mm == months.IYYAR && dd >= 12 && dd <= 17) {
    const erevLagBaOmer = dayjs(new HDate(17, months.IYYAR, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevLagBaOmer);
    return ['🔥&nbsp;<span lang="he" dir="rtl">ל״ג בָּעוֹמֶר שָׂמֵחַ</span>&nbsp;🔥',
      `<a class="text-green1 text-nowrap" href="/holidays/lag-baomer-${gy}">Lag BaOmer</a>
 begins at sundown on ${htmlDate}`];
  } else if (mm === months.AV && dd >= 23) {
    // for the last week of Av
    const erevRHLaBehemot = dayjs(new HDate(30, months.AV, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevRHLaBehemot);
    return ['🐑&nbsp;🐓&nbsp;<span lang="he" dir="rtl">רֹאשׁ הַשָּׁנָה לבְּהֵמוֹת שָׂמֵחַ</span>&nbsp;🐓&nbsp;🐑',
      `<a class="text-green1 text-nowrap" href="/holidays/rosh-hashana-labehemot-${gy}">Rosh Hashana LaBehemot</a>
 (New Year for Tithing Animals)
 begins at sundown on ${htmlDate}`];
  } else if (mm === months.SHVAT && dd >= 2 && dd <= 13) {
    // first 2 weeks of Shvat
    const erevTuBiShvat = dayjs(new HDate(14, months.SHVAT, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevTuBiShvat);
    return ['🌳&nbsp;🌱&nbsp;<span lang="he" dir="rtl">ט״ו בִּשְׁבָט שָׂמֵחַ</span>&nbsp;🌱&nbsp;🌳',
      `<a class="text-green1 text-nowrap" href="/holidays/tu-bishvat-${gy}">Tu BiShvat</a> (New Year for Trees)
 begins at sundown on ${htmlDate}`];
  }

  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;
  if (il && mm === purimMonth && dd === 15 && holidays.length > 0) {
    // Shushan Purim
    return getHolidayGreeting(ctx, holidays[0], il, true, dateOverride);
  }
  if (mm == purimMonth && dd <= 13) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg()).locale(locale);
    const htmlDate = myDateFormat(erevPurim);
    return ['🎭️&nbsp;📜&nbsp;<span lang="he" dir="rtl">חַג פּוּרִים שָׂמֵחַ</span>&nbsp;📜&nbsp;🎭️',
      `<strong>Chag Purim Sameach!</strong> <a class="text-green1 text-nowrap" href="/holidays/purim-${gy}">Purim</a>
 begins at sundown on ${htmlDate}`];
  }
  if ((mm == purimMonth && dd >= 17) || (isNisan && dd <= 14)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg()).locale(locale);
    const deltaDays0 = erevPesach.diff(dayjs(hd.greg()), 'd');
    const deltaDays = deltaDays0 > 1 ? `in ${deltaDays0} days` : 'tomorrow';
    const htmlDate = myDateFormat(erevPesach);
    const blurb = '🫓&nbsp;🍷&nbsp;<span lang="he" dir="rtl">חַג כָּשֵׁר וְשָׂמֵחַ</span>&nbsp;🍷&nbsp;🫓';
    const suffix = il ? '?i=on' : '';
    return [blurb, `<strong>Chag Kasher v'Sameach!</strong>
 <a class="text-green1" href="/holidays/pesach-${gy}${suffix}">Passover</a>
 begins ${deltaDays} at sundown on ${htmlDate}`];
  }

  const fastTomorrow = tomorrow.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastTomorrow && fastTomorrow.url()) {
    return fastDayGreeting(ctx, fastTomorrow);
  }

  return [null, null];
}

/**
 * @private
 * @param {any} ctx
 * @param {Event} ev
 * @return {string[]}
 */
function fastDayGreeting(ctx, ev) {
  const locale = ctx.state.locale;
  const d = dayjs(ev.getDate().greg()).locale(locale);
  const htmlDate = myDateFormat(d);
  const url = shortenUrl(ev.url());
  return [TZOM_KAL,
    `<a class="text-green1 text-nowrap" href="${url}">${ev.getDesc()}</a>
 occurs on ${htmlDate}. We wish you an easy fast`];
}

/**
 * @private
 * @param {any} ctx
 * @param {Event} ev
 * @param {boolean} il
 * @param {boolean} today
 * @param {boolean} dateOverride
 * @return {string[]}
 */
function getHolidayGreeting(ctx, ev, il, today, dateOverride) {
  const mask = ev.getFlags();
  if (today && !dateOverride && (mask & flags.CHANUKAH_CANDLES) && ev.chanukahDay) {
    const tzid = ctx.state.timezone;
    const d = dayjs.tz(new Date(), tzid);
    const dt = new Date(d.year(), d.month(), d.date());
    const hd = new HDate(dt);
    const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    const ev2 = holidays.find((ev) => ev.getFlags() & flags.CHANUKAH_CANDLES);
    if (ev2) {
      return getChanukahGreeting(d, ev2);
    }
  }
  const url = shortenUrl(ev.url());
  const title = ev.basename();
  const emoji0 = ev.getEmoji();
  const emoji = emoji0 ? `<span class="text-nowrap">${emoji0}</span>` : '';
  const longText = today ?
    `We wish you a happy <a class="text-green1 text-nowrap" href="${url}">${title}</a>` :
    `<a class="text-green1 text-nowrap" href="${url}">${title}</a> begins tonight at sundown`;
  const blurb = `${emoji}&nbsp;Chag Sameach!&nbsp;&nbsp;<span lang="he" dir="rtl">חַג שָׂמֵחַ</span>&nbsp;${emoji}`;
  return [`${blurb}`, longText];
}

const roshChodeshBlurb = '🌒&nbsp;Chodesh Tov!&nbsp;&nbsp;<span lang="he" dir="rtl">חוֹדֶשׁ טוֹב</span>&nbsp;🌒';

function getChanukahGreeting(d, ev) {
  const url = shortenUrl(ev.url());
  const dow = d.day();
  const when = dow === 5 ? 'before sundown' : dow === 6 ? 'at nightfall' : 'at dusk';
  const candles = typeof ev.chanukahDay === 'number' ? ev.chanukahDay + 1 : 1;
  const nth = Locale.ordinal(candles, 'en');
  const dowStr = d.format('dddd');
  return [`🕎&nbsp;<span lang="he" dir="rtl">חַג אוּרִים שָׂמֵחַ</span>&nbsp;🕎`,
    `<strong>Happy Chanukah!</strong> Light the ${nth}
<a class="text-green1 text-nowrap" href="${url}">Chanukah candle</a> ${dowStr} evening ${when}`];
}

function getRoshChodeshGreeting(ctx, hd, ev) {
  const locale = ctx.state.locale;
  const monthName0 = ev.getDesc().substring(13); // 'Rosh Chodesh '
  const monthName = monthName0.replace(/'/g, '’');
  const url = shortenUrl(ev.url());
  const d = dayjs(ev.getDate().greg()).locale(locale);
  const today = dayjs(hd.greg()).isSame(d, 'day');
  if (today) {
    return [roshChodeshBlurb,
      `We wish you a good new month of <a class="text-green1 text-nowrap" href="${url}">${monthName}</a>`];
  }
  const htmlDate = myDateFormat(d.subtract(1, 'day'));
  return [roshChodeshBlurb,
    `<a class="text-green1 text-nowrap" href="${url}">Rosh Chodesh ${monthName}</a> begins at sundown on ${htmlDate}`];
}
