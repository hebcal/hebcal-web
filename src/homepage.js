import {HDate, HebrewCalendar, months, Sedra, ParshaEvent} from '@hebcal/core';
import dayjs from 'dayjs';

// eslint-disable-next-line require-jsdoc
export async function homepage(ctx) {
  const dt = new Date();
  const d = dayjs(dt);
  const isoDt = d.format('YYYY-MM-DD');
  const fmtDt = d.format('ddd, D MMMM YYYY');
  const hd = new HDate(dt);
  const sedra = new Sedra(hd.getFullYear(), false);
  const parsha = sedra.get(hd);
  const pe = new ParshaEvent(hd, parsha);
  const holidays = HebrewCalendar.getHolidaysOnDate(hd) || [];
  const events = holidays.filter((ev) => ev.observedInDiaspora()).map((ev) => {
    const url = ev.url();
    const desc = ev.render();
    return url ? `<a href="${url}">${desc}</a>` : desc;
  });
  ctx.state.title = 'Jewish Calendar, Hebrew Date Converter, Holidays - hebcal.com';
  ctx.state.items = [
    `<time datetime="${isoDt}">${fmtDt}</time>`,
    hd.render(),
    `<a href="${pe.url()}">${pe.render()}</a>`,
  ].concat(events);
  return ctx.render('homepage');
}

/**
 * @param {any} cfg
 * @param {string} shortLocation
 * @return {string}
 */
function getSpecialNote(cfg, shortLocation) {
  const hd = new HDate(TODAY);
  const mm = hd.getMonth();
  const dd = hd.getDate();
  const yy = hd.getFullYear();
  const purimMonth = HDate.isLeapYear(yy) ? months.ADAR_II : months.ADAR_I;

  let note;
  if ((mm == months.AV && dd >= 15) || (mm == months.ELUL && dd >= 16)) {
    // for the last two weeks of Av and the last week or two of Elul
    const nextYear = yy + 1;
    const fridgeLoc = cfg.zip ? `zip=${cfg.zip}` : `geonameid=${cfg.geonameid}`;
    const erevRH = dayjs(new HDate(1, months.TISHREI, nextYear).prev().greg());
    const strtime = erevRH.format(FORMAT_DOW_MONTH_DAY);
    let url = `https://www.hebcal.com/shabbat/fridge.cgi?${fridgeLoc}&amp;year=${nextYear}`;
    if (cfg.m) url += `&amp;m=${cfg.m}`;
    url += `&amp;${UTM_PARAM}`;
    note = `Shana Tova! We wish you a happy and healthy New Year.
Rosh Hashana ${nextYear} begins at sundown on ${strtime}. Print your <a
style="color:#356635" href="${url}">${shortLocation} virtual refrigerator magnet</a>
for candle candle lighting times and Parashat haShavuah on a compact 5x7 page.`;
  } else if (mm == months.TISHREI && dd <= 9) {
    // between RH & YK
    const erevYK = dayjs(new HDate(9, months.TISHREI, yy).greg());
    const strtime = erevYK.format(FORMAT_DOW_MONTH_DAY);
    note = `G'mar Chatima Tova! We wish you a good inscription in the Book of Life.
<a style="color:#356635" href="https://www.hebcal.com/holidays/yom-kippur?${UTM_PARAM}">Yom Kippur</a>
begins at sundown on ${strtime}.`;
  } else if ((mm == months.TISHREI && dd >= 17 && dd <= 21) || (mm == months.NISAN && dd >= 17 && dd <= 20)) {
    const holiday = mm == months.TISHREI ? 'Sukkot' : 'Pesach';
    note = `Moadim L'Simcha! We wish you a very happy ${holiday}.`;
  } else if (mm == purimMonth && dd >= 2 && dd <= 10) {
    // show Purim greeting 1.5 weeks before
    const erevPurim = dayjs(new HDate(13, purimMonth, yy).greg());
    const strtime = erevPurim.format(FORMAT_DOW_MONTH_DAY);
    note = `Chag Purim Sameach!
<a style="color:#356635" href="https://www.hebcal.com/holidays/purim?${UTM_PARAM}">Purim</a>
begins at sundown on ${strtime}.`;
  } else if ((mm == purimMonth && dd >= 17 && dd <= 25) || (mm == months.NISAN && dd >= 2 && dd <= 9)) {
    // show Pesach greeting shortly after Purim and ~2 weeks before
    const erevPesach = dayjs(new HDate(14, months.NISAN, yy).greg());
    const strtime = erevPesach.format(FORMAT_DOW_MONTH_DAY);
    note = `Chag Kasher v'Sameach! We wish you a happy
<a style="color:#356635" href="https://www.hebcal.com/holidays/pesach?${UTM_PARAM}">Passover</a>.
Pesach begins at sundown on ${strtime}.`;
  } else if (mm == months.KISLEV && dd >= 1 && dd <= 13) {
    // for the first 2 weeks of Kislev, show Chanukah greeting
    const erevChanukah = dayjs(new HDate(24, months.KISLEV, yy).greg());
    const dow = erevChanukah.day();
    const strtime = erevChanukah.format(FORMAT_DOW_MONTH_DAY);
    const when = dow == 5 ? 'before sundown' : dow == 6 ? 'at nightfall' : 'at sundown';
    note = `Chag Urim Sameach! Light the first
<a style="color:#356635" href="https://www.hebcal.com/holidays/chanukah?${UTM_PARAM}">Chanukah candle</a>
${when} on ${strtime}.`;
  }
  if (!note) {
    return '';
  }

  // eslint-disable-next-line max-len
  return '<div style="font-size:14px;font-family:arial,helvetica,sans-serif;padding:8px;color:#468847;background-color:#dff0d8;border-color:#d6e9c6;border-radius:4px">\n' +
    note + `\n</div>\n${BLANK}\n`;
}
