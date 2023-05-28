/* eslint-disable require-jsdoc */
import {basename} from 'path';
import {PassThrough} from 'stream';
import {writeFullKriyahCsv, getLeyningForHoliday,
  getLeyningForParsha, formatAliyahWithBook} from '@hebcal/leyning';
import {writeTriennialCsv} from '@hebcal/triennial';
import createError from 'http-errors';
import {HebrewCalendar, HDate, months} from '@hebcal/core';

const reFullKriyahIL = /^fullkriyah-il-(\d+).csv$/;
const reFullKriyahDiaspora = /^fullkriyah-(\d+).csv$/;
const reTriennialIL = /^triennial-il-(\d+)-\d+.csv$/;
const reTriennialDiaspora = /^triennial-(\d+)-\d+.csv$/;
const reWeekday = /^weekday-\w+-(\d+).csv$/;

export async function parshaCsv(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  let matches;
  if ((matches = reFullKriyahIL.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], true, writeFullKriyahCsv);
  } else if ((matches = reFullKriyahDiaspora.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], false, writeFullKriyahCsv);
  } else if ((matches = reTriennialIL.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], true, writeTriennialCsv);
  } else if ((matches = reTriennialDiaspora.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], false, writeTriennialCsv);
  } else if ((matches = reWeekday.exec(base)) !== null) {
    const il = base.startsWith('weekday-il-');
    sendCsv(ctx, base, matches[1], il, writeWeekdayCsv);
  } else {
    throw createError(404, `Sorry, can't find CSV file: ${base}`);
  }
}

function sendCsv(ctx, filename, hyear, il, callback) {
  ctx.type = 'text/csv; charset=utf-8';
  ctx.response.attachment(filename);
  const pt = ctx.body = new PassThrough();
  callback(pt, +hyear, il);
  pt.end();
}

/**
 * @private
 * @param {WriteStream} stream
 * @param {number} hyear
 * @param {boolean} il
 */
function writeWeekdayCsv(stream, hyear, il) {
  stream.write('"Date","Parashah","Weekday Aliyah","Reading","Verses"\r\n');
  const startDate = new HDate(1, months.TISHREI, hyear);
  const startAbs = startDate.abs();
  const endAbs = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  for (let abs = startAbs; abs <= endAbs; abs++) {
    const hd = new HDate(abs);
    writeWeekdayCsvInner(stream, hd, il);
  }
}

/**
 * @private
 * @param {WriteStream} stream
 * @param {HDate} hd
 * @param {boolean} il
 * @return {boolean}
 */
function writeWeekdayCsvInner(stream, hd, il) {
  // skip if it's not a Monday or Thursday, or if it's a holiday that has Torah reading
  if (!isWeekdayReading(hd, il)) {
    return false;
  }
  const hyear = hd.getFullYear();
  const sedra = HebrewCalendar.getSedra(hyear, il);
  const saturday = hd.onOrAfter(6);
  const parsha = sedra.lookup(saturday);
  if (!parsha.chag) {
    writeWeekdayCsvLines(stream, parsha.parsha, hd);
    return true;
  }
  // So it's a Monday or Thursday but Saturday is Chag.
  // Search for next regular parsha, which could even spill into next year
  const endOfYear = new HDate(1, months.TISHREI, hyear + 1).abs() - 1;
  const endAbs = endOfYear + 30;
  for (let sat2 = saturday.abs() + 7; sat2 <= endAbs; sat2 += 7) {
    const sedra2 = sat2 > endOfYear ? HebrewCalendar.getSedra(hyear + 1, il) : sedra;
    const parsha2 = sedra2.lookup(sat2);
    if (!parsha2.chag) {
      writeWeekdayCsvLines(stream, parsha2.parsha, hd);
      return true;
    }
  }
  throw createError(500, `Can't find weekday for ${hd.toString()}`);
}

/**
 * @private
 * @param {WriteStream} stream
 * @param {string[]} parsha
 * @param {HDate} hd
 */
function writeWeekdayCsvLines(stream, parsha, hd) {
  const reading = getLeyningForParsha(parsha);
  const parshaName = parsha.join('-');
  const date = fmtDate(hd.greg());
  if (reading.weekday) {
    writeCsvLines(stream, date, parshaName, reading.weekday);
  } else {
    throw createError(500, `No weekday for ${parshaName} on ${date}`);
  }
}

/**
 * @private
 * @param {HDate} hd
 * @param {boolean} il
 * @return {boolean}
 */
function isWeekdayReading(hd, il) {
  const dow = hd.getDay();
  if (dow !== 1 && dow !== 4) {
    return false;
  }
  const events = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
  for (const ev of events) {
    const reading = getLeyningForHoliday(ev, il);
    if (reading && reading.fullkriyah) {
      return false;
    }
  }
  return true;
}

const fmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: '2-digit',
});

/**
 * @private
 * @param {Date} dt
 * @return {string}
 */
function fmtDate(dt) {
  const s = fmt.format(dt).split(' ');
  return s[1].substring(0, 2) + '-' + s[0] + '-' + s[2];
}

/**
 * @private
 * @param {fs.WriteStream} stream
 * @param {string} date
 * @param {string} parshaName
 * @param {AliyotMap} aliyot
 */
function writeCsvLines(stream, date, parshaName, aliyot) {
  for (const [num, aliyah] of Object.entries(aliyot)) {
    const str = formatAliyahWithBook(aliyah);
    const numv = aliyah.v || '';
    stream.write(`${date},"${parshaName}",${num},"${str}",${numv}\r\n`);
  }
  stream.write('\r\n');
}
