import { Event, flags } from '@hebcal/core';
import { HDate, Locale, birthdayOrAnniversary, gematriya, months, yahrzeit } from '@hebcal/hdate';
import dayjs from 'dayjs';
import {lightCandlesWhen} from './common.js';
import {
  BIRTHDAY,
  OTHER,
  YAHRZEIT,
  getNumYears,
  includeAnniversaryNumber,
  getYahrzeitDetailForId
} from './yahrzeitCommon.js';


/**
 * @typedef {import('./yahrzeitCommon.js').YahrzeitDetail} YahrzeitDetail
 */

/**
 * Per-calendar settings that are the same for every event generated
 * from a single yahrzeit/anniversary entry
 * @typedef {Object} YahrzeitEventOptions
 * @property {boolean} appendHebDate append the Hebrew date to the event title
 * @property {boolean} includeNumber include the anniversary number
 *   (e.g. "3rd") in the event title and memo
 */

const hebrewRe = /[א-ת]/;

const YAHRZEIT_HE = 'יארצייט';

const en2he = {
  Yahrzeit: YAHRZEIT_HE,
  Birthday: 'יום הולדת',
  Anniversary: 'יום נישואין',
};

/**
 * @return {number}
 */
function getDefaultStartYear(today) {
  const hmonth = today.getMonth();
  const hyear = today.getFullYear();
  const isFirst3months = hmonth >= months.TISHREI && hmonth <= months.TEVET;
  return isFirst3months ? hyear - 1 : hyear;
}

function getDateRange(query) {
  const today = new HDate();
  const years = getNumYears(query.years);
  const startYear = Number.parseInt(query.start, 10) || getDefaultStartYear(today);
  const endYear = Number.parseInt(query.end, 10) || (startYear + years - 1);
  return {today, startYear, endYear, years};
}

/**
 * @param {number} maxId
 * @param {Object.<string,string>} query
 * @return {Event[]}
 */
export function makeYahrzeitEvents(maxId, query) {
  const {startYear, endYear, years} = getDateRange(query);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    events = events.concat(getEventsForId(query, id, startYear, years));
  }
  const yizkor = query.yizkor;
  if (yizkor === 'on' || yizkor === '1') {
    events = events.concat(makeYizkorEvents(startYear, endYear, query.i === 'on'));
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

/**
 * @param {Object.<string,string>} query
 * @param {number} id
 * @param {number} startYear
 * @param {number} numYears
 * @return {Event[]}
 */
function getEventsForId(query, id, startYear, numYears) {
  const events = [];
  const info = getYahrzeitDetailForId(query, id);
  if (info === null) {
    return events;
  }
  /** @type {YahrzeitEventOptions} */
  const options = {
    appendHebDate: (query.hebdate === 'on' || query.hebdate === '1'),
    includeNumber: includeAnniversaryNumber(query),
  };
  for (let hyear = startYear; events.length < numYears; hyear++) {
    const ev = makeYahrzeitEvent(info, hyear, options);
    if (ev) {
      events.push(ev);
    }
  }
  return events;
}

/**
 * Hebrew date without the year, in Hebrew, e.g. "כ׳ חשון"
 * @param {HDate} hd
 * @return {string}
 */
function hebdateNoYearHe(hd) {
  const dd = hd.getDate();
  const mm = Locale.gettext(hd.getMonthName(), 'he-x-NoNikud');
  return gematriya(dd) + ' ' + mm;
}

/**
 * Hebrew date without the year, in English, e.g. "20th of Cheshvan"
 * @param {HDate} hd
 * @return {string}
 */
function hebdateNoYearEn(hd) {
  return hd.render('en', false).replaceAll('\'', '’');
}

/**
 * @param {YahrzeitDetail} info
 * @param {HDate} hd date of observance
 * @param {number} yearNumber
 * @param {boolean} appendHebDate
 * @param {boolean} includeNumber
 * @return {string}
 */
function makeSubject(info, hd, yearNumber, appendHebDate, includeNumber) {
  const name = info.name;
  let subj = name;
  const isHebrewName = hebrewRe.test(name) && !/[A-Za-z]/.test(name);
  const type = info.type;
  if (type !== 'Other') {
    const isYahrzeit = type === YAHRZEIT;
    if (isHebrewName) {
      const prefix = en2he[type];
      if (isYahrzeit) {
        subj = includeNumber ?
          `${prefix} ה-${yearNumber} של ${name}` :
          `${prefix} של ${name}`;
      } else {
        subj = includeNumber ?
          `${prefix} ${yearNumber} ל${name}` :
          `${prefix} ל${name}`;
      }
    } else {
      const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
      subj = includeNumber ?
        `${name}’s ${Locale.ordinal(yearNumber, 'en')} ${typeStr}` :
        `${name}’s ${typeStr}`;
    }
  }
  if (appendHebDate) {
    const hebdate = isHebrewName ? hebdateNoYearHe(hd) : hebdateNoYearEn(hd);
    subj += ' (' + hebdate + ')';
  }
  return subj;
}

/**
 * @param {YahrzeitDetail} info
 * @param {number} hyear
 * @param {YahrzeitEventOptions} options
 * @return {Event|null} `null` if there is no observance in `hyear`
 */
function makeYahrzeitEvent(info, hyear, options) {
  const {appendHebDate, includeNumber} = options;
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const origDt = info.day.toDate();
  const hd = isYahrzeit ?
    yahrzeit(hyear, origDt) :
    birthdayOrAnniversary(hyear, origDt);
  if (!hd) {
    return null;
  }
  const origHd = new HDate(origDt);
  const origHyear = origHd.getFullYear();
  const yearNumber = hyear - origHyear;
  const name = info.name;
  const subj = makeSubject(info, hd, yearNumber, appendHebDate, includeNumber);
  const ev = new Event(hd, subj, flags.USER_EVENT);
  if (isYahrzeit) {
    ev.emoji = '🕯️';
  } else if (isBirthday) {
    ev.emoji = '🎂✡️';
  }
  ev.memo = makeMemo(info, hd, includeNumber ? yearNumber : 0);
  ev.name = name;
  ev.type = type;
  ev.anniversary = yearNumber;
  return ev;
}

const NL = '\n';

/**
 * @param {YahrzeitDetail} info
 * @param {HDate} hd date of observance
 * @param {number} yearNumber how many years since the original date,
 *   or 0 to omit the anniversary number
 * @return {string}
 */
function makeMemo(info, hd, yearNumber) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const isOther = (type === OTHER);
  const name = info.name;
  const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
  const nth = yearNumber ? Locale.ordinal(yearNumber, 'en') + ' ' : '';
  const hebdate = hd.render('en').replaceAll('\'', '’');
  const observed = dayjs(hd.greg());
  const nameAndType = isOther ? name : `${name}’s ${typeStr}`;
  const erev = observed.subtract(1, 'day');
  const verb = isYahrzeit ? 'remembering' : 'honoring';
  const prefix = isOther ? name : `Hebcal joins you in ${verb} ${name}, whose ${nth}${typeStr}`;
  let memo = `${prefix} occurs on ` +
    `${observed.format('dddd, MMMM D')}, corresponding to the ${hebdate}.${NL}${NL}` +
    `${nameAndType} begins at sundown on ${erev.format('dddd, MMMM D')} and continues until ` +
    `sundown on the day of observance.`;
  if (isYahrzeit) {
    const dow = erev.day();
    const when = lightCandlesWhen(dow);
    memo += ` It is customary to light a memorial candle ${when} as the Yahrzeit begins.${NL}${NL}` +
      'May your loved one’s soul be bound up in the bond of eternal life and may their memory ' +
      'serve as a continued source of inspiration and comfort to you.';
  } else if (isBirthday) {
    memo += `${NL}${NL}Mazel Tov!`;
  }
  return memo;
}

/**
 * @param {number} startYear
 * @param {number} endYear
 * @param {boolean} il
 * @return {Event[]}
 */
function makeYizkorEvents(startYear, endYear, il) {
  const holidays = [];
  const attrs = {emoji: '🕯️'};
  const pesachDay = il ? 21 : 22;
  const pesachDesc = il ? 'Yizkor (Pesach VII)' : 'Yizkor (Pesach VIII)';
  const shavuotDay = il ? 6 : 7;
  const shavuotDesc = il ? 'Yizkor (Shavuot)' : 'Yizkor (Shavuot II)';
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    holidays.push(
        new Event(new HDate(pesachDay, months.NISAN, hyear), pesachDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(shavuotDay, months.SIVAN, hyear), shavuotDesc, flags.USER_EVENT, attrs),
        new Event(new HDate(10, months.TISHREI, hyear), 'Yizkor (Yom Kippur)', flags.USER_EVENT, attrs),
        new Event(new HDate(22, months.TISHREI, hyear), 'Yizkor (Shmini Atzeret)', flags.USER_EVENT, attrs),
    );
  }
  return holidays;
}
