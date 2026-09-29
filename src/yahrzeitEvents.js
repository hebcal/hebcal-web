import { Event, flags } from '@hebcal/core';
import { HDate, Locale, birthdayOrAnniversary, gematriya, months, yahrzeit } from '@hebcal/hdate';
import dayjs from 'dayjs';
import {murmur32HexSync} from '@hebcal/murmurhash3';
import {lightCandlesWhen} from './common.js';
import {
  BIRTHDAY,
  OTHER,
  YAHRZEIT,
  getNumYears,
  getYahrzeitDetailForId
} from './yahrzeitCommon.js';


/**
 * @typedef {import('./yahrzeitCommon.js').YahrzeitDetail} YahrzeitDetail
 */

/**
 * Per-calendar settings that are the same for every event generated
 * from a single yahrzeit/anniversary entry
 * @typedef {Object} YahrzeitEventOptions
 * @property {string} [calendarId] ULID of the saved calendar, if any
 * @property {boolean} includeUrl append a link to the edit page to the memo
 * @property {boolean} appendHebDate append the Hebrew date to the event title
 */

const hebrewRe = /[א-ת]/;

const YAHRZEIT_HE = 'יארצייט';

const en2he = {
  Yahrzeit: YAHRZEIT_HE,
  Birthday: 'יום הולדת',
  Anniversary: 'יום נישואין',
};

export function makeEditMemo(calendarId) {
  return 'To edit this Hebcal Yahrzeit + Anniversary Calendar, visit https://www.hebcal.com/yahrzeit/edit/' +
    calendarId;
}

/**
 * @return {number}
 */
function getDefaultStartYear(today) {
  const hmonth = today.getMonth();
  const hyear = today.getFullYear();
  const isFirst3months = hmonth >= months.TISHREI && hmonth <= months.TEVET;
  return isFirst3months ? hyear - 1 : hyear;
}

export function getDateRange(query) {
  const today = new HDate();
  const years = getNumYears(query.years);
  const startYear = Number.parseInt(query.start, 10) || getDefaultStartYear(today);
  const endYear = Number.parseInt(query.end, 10) || (startYear + years - 1);
  return {today, startYear, endYear, years};
}

/**
 * @param {number} maxId
 * @param {Object.<string,string>} query
 * @param {boolean} reminder
 * @return {Promise<Event[]>}
 */
export async function makeYahrzeitEvents(maxId, query, reminder) {
  const {startYear, endYear, years} = getDateRange(query);
  let events = [];
  for (let id = 1; id <= maxId; id++) {
    const events0 = getEventsForId(query, id, startYear, years);
    events = events.concat(events0);
    if (reminder) {
      const reminders = makeReminderEvents(events0, id);
      events = events.concat(reminders);
    }
  }
  const yizkor = query.yizkor;
  if (yizkor === 'on' || yizkor === '1') {
    const holidays = makeYizkorEvents(startYear, endYear, query.i === 'on');
    for (const ev of holidays) {
      const d = dayjs(ev.greg());
      const hash = murmur32HexSync(ev.getDesc());
      ev.uid = 'yizkor-' + d.format('YYYYMMDD') + '-' + hash;
      if (query.ulid) {
        ev.memo = makeEditMemo(query.ulid);
      }
    }
    events = events.concat(holidays);
  }
  events.sort((a, b) => a.getDate().abs() - b.getDate().abs());
  return events;
}

function getAlarmTime(hd) {
  switch (hd.getDay()) {
    case 6: return '20:00';
    case 5: return '14:30';
    default: return '16:30';
  }
}

function makeReminderEvents(events, id) {
  const yahrzeitEvents = events.filter((ev) => ev.type === YAHRZEIT);
  return yahrzeitEvents.map((ev) => {
    const hd = ev.getDate().prev();
    const dt = hd.greg();
    const uid = 'reminder-' + dayjs(dt).format('YYYYMMDD') + '-' + ev.hash + '-' + id;
    const name = ev.name;
    const subj = hebrewRe.test(name) ?
      `${name} ${YAHRZEIT_HE} תזכורת` :
      `${name} Yahrzeit reminder`;
    return new Event(hd, subj, flags.USER_EVENT, {
      eventTime: dt,
      eventTimeStr: getAlarmTime(hd),
      memo: ev.memo,
      emoji: ev.emoji,
      alarm: 'P0DT0H0M0S',
      uid,
      category: 'Personal',
    });
  });
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
  const calendarId = query.ulid;
  /** @type {YahrzeitEventOptions} */
  const options = {
    calendarId,
    includeUrl: Boolean(calendarId && query.dl !== '1'),
    appendHebDate: (query.hebdate === 'on' || query.hebdate === '1'),
  };
  for (let hyear = startYear; events.length < numYears; hyear++) {
    const ev = makeYahrzeitEvent(id, info, hyear, options);
    if (ev) {
      events.push(ev);
    }
  }
  return events;
}

/**
 * @param {HDate} hd
 * @param {boolean} isHebrewName
 * @return {string}
 */
function hebdateNoYear(hd, isHebrewName) {
  if (isHebrewName) {
    const dd = hd.getDate();
    const mm = Locale.gettext(hd.getMonthName(), 'he-x-NoNikud');
    return gematriya(dd) + ' ' + mm;
  } else {
    return hd.render('en', false).replaceAll('\'', '’');
  }
}

/**
 * @param {YahrzeitDetail} info
 * @param {HDate} hd date of observance
 * @param {number} yearNumber
 * @param {boolean} appendHebDate
 * @return {string}
 */
function makeYahrzeitSubject(info, hd, yearNumber, appendHebDate) {
  const name = info.name;
  let subj = name;
  const isHebrewName = hebrewRe.test(name) && !/[A-Za-z]/.test(name);
  const type = info.type;
  if (type !== 'Other') {
    const isYahrzeit = type === YAHRZEIT;
    if (isHebrewName) {
      const prefix = en2he[type];
      subj = isYahrzeit ?
        `${prefix} ה-${yearNumber} של ${name}` :
        `${prefix} ${yearNumber} ל${name}`;
    } else {
      const nth = Locale.ordinal(yearNumber, 'en');
      const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
      subj = `${name}’s ${nth} ${typeStr}`;
    }
  }
  if (appendHebDate) {
    const hebdate = hebdateNoYear(hd, isHebrewName);
    subj += ' (' + hebdate + ')';
  }
  return subj;
}

/**
 * @param {number} id
 * @param {YahrzeitDetail} info
 * @param {number} hyear
 * @param {YahrzeitEventOptions} options
 * @return {Event|null} `null` if there is no observance in `hyear`
 */
function makeYahrzeitEvent(id, info, hyear, options) {
  const {calendarId, includeUrl, appendHebDate} = options;
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
  const subj = makeYahrzeitSubject(info, hd, yearNumber, appendHebDate);
  const ev = new Event(hd, subj, flags.USER_EVENT);
  if (isYahrzeit) {
    ev.emoji = '🕯️';
  } else if (isBirthday) {
    ev.emoji = '🎂✡️';
  }
  const editUrl = includeUrl ?
    `https://www.hebcal.com/yahrzeit/edit/${calendarId}#row${id}` :
    undefined;
  ev.memo = makeMemo(info, hd, yearNumber, editUrl);
  const hash = calendarId || murmur32HexSync(name);
  ev.uid = type.toLowerCase() + '-' + hyear + '-' + hash + '-' + id;
  ev.name = name;
  ev.type = type;
  ev.anniversary = yearNumber;
  if (isYahrzeit) {
    ev.alarm = false;
    ev.hash = hash;
  }
  return ev;
}

// literal backslash-n: iCalendar-escaped newline, unescaped later for display
const NL = String.raw`\n`;

/**
 * @param {YahrzeitDetail} info
 * @param {HDate} hd date of observance
 * @param {number} yearNumber how many years since the original date
 * @param {string} [editUrl] link to the edit page, appended to the memo
 * @return {string}
 */
function makeMemo(info, hd, yearNumber, editUrl) {
  const type = info.type;
  const isYahrzeit = type === YAHRZEIT;
  const isBirthday = type === BIRTHDAY;
  const isOther = (type === OTHER);
  const name = info.name;
  const typeStr = isYahrzeit ? type : `Hebrew ${type}`;
  const nth = Locale.ordinal(yearNumber, 'en');
  const hebdate = hd.render('en').replaceAll('\'', '’');
  const observed = dayjs(hd.greg());
  const nameAndType = isOther ? name : `${name}’s ${typeStr}`;
  const erev = observed.subtract(1, 'day');
  const verb = isYahrzeit ? 'remembering' : 'honoring';
  const prefix = isOther ? name : `Hebcal joins you in ${verb} ${name}, whose ${nth} ${typeStr}`;
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
  if (editUrl) {
    memo += `${NL}${NL}${editUrl}`;
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
