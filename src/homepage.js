/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, months, Sedra, ParshaEvent, flags, Zmanim} from '@hebcal/core';
import {empty, getDefaultHebrewYear, setDefautLangTz} from './common';
import dayjs from 'dayjs';

export async function homepage(ctx) {
  ctx.set('Cache-Control', 'private'); // personalize by cookie or GeoIP
  const q = setDefautLangTz(ctx);
  const {dt, afterSunset} = getDate(ctx, q);
  const hdate = new HDate(dt);
  const hd = afterSunset ? hdate.next() : hdate;
  ctx.state.title = 'Jewish Calendar, Hebrew Date Converter, Holidays - hebcal.com';
  setDefaultYear(ctx, dt, hd);
  const items = ctx.state.items = [];
  mastheadDates(items, dt, afterSunset, hd);
  const il = ctx.state.il;
  mastheadHolidays(items, hd, il);
  mastheadParsha(items, dt, il);
  const [blub, longText] = getHolidayGreeting(hd, il);
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
  const dt = isToday ? new Date() :
    new Date(parseInt(q.gy, 10), parseInt(q.gm, 10) - 1, parseInt(q.gd, 10));
  const location = ctx.state.location;
  if (isToday && location !== null) {
    const tzid = ctx.state.timezone = location.getTzid();
    const isoDate = Zmanim.formatISOWithTimeZone(tzid, dt);
    const gy = parseInt(isoDate.substring(0, 4), 10);
    const gm = parseInt(isoDate.substring(5, 7), 10);
    const gd = parseInt(isoDate.substring(8, 10), 10);
    const day = new Date(gy, gm - 1, gd);
    const zman = new Zmanim(day, location.getLatitude(), location.getLongitude());
    const sunset = zman.sunset();
    const afterSunset = Boolean(dt >= sunset);
    return {dt: day, afterSunset: afterSunset};
  }
  return {dt: dt, afterSunset: false};
}

function mastheadDates(items, dt, afterSunset, hd) {
  const d = dayjs(dt);
  const isoDt = d.format('YYYY-MM-DD');
  const fmtDt = d.format('ddd, D MMMM YYYY') + (afterSunset ? ' (after sunset)' : '');
  items.push(
      `<time datetime="${isoDt}">${fmtDt}</time>`,
      hd.render(),
  );
}

function mastheadParsha(items, dt, il) {
  const saturday = dayjs(dt).day(6);
  const hd = new HDate(saturday.toDate());
  const sedra = new Sedra(hd.getFullYear(), il);
  if (sedra.isParsha(hd)) {
    const pe = new ParshaEvent(hd, sedra.get(hd));
    const url = pe.url();
    const suffix = il ? '?i=on' : '';
    items.push(`<a href="${url}${suffix}">${pe.render()}</a>`);
  }
}

function mastheadHolidays(items, hd, il) {
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  const suffix = il ? '?i=on' : '';
  holidays
      .map((ev) => {
        const url = ev.url();
        const desc = ev.render();
        return url ? `<a href="${url}${suffix}">${desc}</a>` : desc;
      }).forEach((str) => items.push(str));
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

function getHolidayGreeting(hd, il) {
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const gy = hd.greg().getFullYear();
  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;
  const holidays = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  const roshChodesh = holidays.find((ev) => ev.getFlags() & flags.ROSH_CHODESH);

  if (roshChodesh) {
    const monthName = roshChodesh.getDesc().substring(13); // 'Rosh Chodesh '
    const url = roshChodesh.url();
    return ['Chodesh Tov',
      `We wish you a good new month of <a href="${url}">${monthName}</a>`];
  }
  if (mm == months.AV && dd == 8) {
    return ['Tzom Kal', `<a href="/holidays/tisha-bav-${gy}">Tish'a B'Av</a>
begins tonight at sundown. We wish you an easy fast`];
  }
  const fastDay = holidays.find((ev) => ev.getFlags() & (flags.MAJOR_FAST | flags.MINOR_FAST));
  if (fastDay) {
    const strtime = dayjs(fastDay.getDate().greg()).format(FORMAT_DOW_MONTH_DAY);
    return ['Tzom Kal',
      `We wish you an easy fast.<br><a href="${fastDay.url()}">${fastDay.render()}</a> occurs on ${strtime}`];
  }
  if (holidays[0] && holidays[0].getFlags() & flags.CHANUKAH_CANDLES) {
    return ['Chag Urim Sameach',
      `We wish you a happy <a href="/holidays/chanukah-${gy}">Chanukah</a>`];
  }
  if (mm == months.KISLEV && dd < 24) {
    // immediately after Rosh Chodesh Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg());
    const dow = erevChanukah.day();
    const strtime = erevChanukah.format(FORMAT_DOW_MONTH_DAY);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    return ['Happy Chanukah',
      `Light the first <a href="/holidays/chanukah-${gy}">Chanukah candle</a> ${when} on ${strtime}`];
  }
  if ((mm == months.TISHREI && dd >= 14 && dd <= 21) ||
      (mm == months.NISAN && dd >= 14 && dd <= 21)) {
    const holiday = mm == months.TISHREI ? 'Sukkot' : 'Pesach';
    return ['Moadim L\'Simcha', `We wish you a very happy ${holiday}`];
  }
  if (mm === months.TISHREI && (dd === 1 || dd === 2)) {
    return ['Chag Sameach',
      'Shana Tova u\'Metukah!<br>🍏🍯 שנה טובה ומתוקה 🍯🍏<br>We wish you a happy and healthy New Year'];
  }
  if (mm == months.ELUL || (mm == months.AV && dd >= 22)) {
    // for the last week of Av and entire month of Elul
    const nextYear = yy + 1;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg());
    const strtime = erevRH.format(FORMAT_DOW_MONTH_DAY);
    return ['Shana Tova', `We wish you a happy and healthy New Year.
<br><a href="/holidays/rosh-hashana-${gy}">Rosh Hashana</a> ${nextYear} begins at sundown on ${strtime}`];
  }
  if (mm == months.TISHREI && dd >= 3 && dd <= 10) {
    // between RH & YK
    let longText = '<br>We wish you a good inscription in the Book of Life';
    if (dd < 10) {
      const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg());
      const strtime = erevYK.format(FORMAT_DOW_MONTH_DAY);
      longText += `.\n<br><a href="/holidays/yom-kippur-${gy}">Yom Kippur</a>
begins at sundown on ${strtime}`;
    }
    return ['G\'mar Chatima Tova / גְּמַר חֲתִימָה טוֹבָה', longText];
  }
  if (mm == purimMonth && dd <= 13) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg());
    const strtime = erevPurim.format(FORMAT_DOW_MONTH_DAY);
    return ['Chag Purim Sameach', `<a href="/holidays/purim-${gy}">Purim</a>
begins at sundown on ${strtime}`];
  }
  if ((mm == purimMonth && dd >= 17) || (mm == months.NISAN && dd <= 14)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg());
    const strtime = erevPesach.format(FORMAT_DOW_MONTH_DAY);
    return ['Chag Kasher v\'Sameach', `We wish you a happy
<a href="/holidays/pesach-${gy}">Passover</a>.
Pesach begins at sundown on ${strtime}`];
  }
  if (holidays[0]) {
    const desc = holidays[0].basename();
    if (chagSameach[desc]) {
      const url = holidays[0].url();
      return ['Chag Sameach', `We wish you a happy <a href="${url}">${desc}</a>`];
    }
  }
  return [undefined, undefined];
}
